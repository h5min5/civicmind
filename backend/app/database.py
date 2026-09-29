import logging
import re
import threading

from sqlalchemy import create_engine, event, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import get_settings

logger = logging.getLogger("civicmind")

_init_lock = threading.Lock()
_initialized = False


class Base(DeclarativeBase):
    pass


def _engine():
    settings = get_settings()
    return create_engine(
        settings.database_url,
        poolclass=NullPool,
        pool_pre_ping=True,
    )


engine = _engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def safe_error(exc: Exception) -> str:
    message = str(exc).split("\n")[0]
    message = re.sub(r"://[^@\s]+@", "://***@", message)
    return message[:300]


def init_db() -> None:
    global _initialized
    if _initialized:
        return
    with _init_lock:
        if _initialized:
            return
        from pgvector.psycopg import register_vector

        import app.models  # noqa: F401

        def _on_connect(dbapi_connection, _connection_record):
            # Supabase keeps PostGIS and pgvector in the extensions schema.
            previous = dbapi_connection.autocommit
            dbapi_connection.autocommit = True
            cursor = dbapi_connection.cursor()
            cursor.execute("SET search_path TO public, extensions")
            cursor.close()
            dbapi_connection.autocommit = previous
            try:
                register_vector(dbapi_connection)
            except Exception:
                logger.debug("pgvector is not registered on this connection yet", exc_info=True)

        if not getattr(engine, "_civicmind_vector_hook", False):
            event.listen(engine, "connect", _on_connect)
            engine._civicmind_vector_hook = True  # type: ignore[attr-defined]

        for statement in (
            "CREATE EXTENSION IF NOT EXISTS vector",
            "CREATE EXTENSION IF NOT EXISTS postgis",
        ):
            try:
                with engine.begin() as connection:
                    connection.execute(text(statement))
            except Exception:
                logger.warning(
                    "Could not run '%s'. Enable vector and postgis in Supabase if they are not already on.",
                    statement,
                    exc_info=True,
                )
        Base.metadata.create_all(engine)
        with engine.begin() as connection:
            connection.execute(text("ALTER TABLE complaints ADD COLUMN IF NOT EXISTS area VARCHAR(120)"))
            connection.execute(text("ALTER TABLE incidents ADD COLUMN IF NOT EXISTS area VARCHAR(120)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_complaints_area ON complaints (area)"))
            connection.execute(text("CREATE INDEX IF NOT EXISTS ix_incidents_area ON incidents (area)"))
            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS complaints_geo_gix
                    ON complaints
                    USING GIST (
                      (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)
                    )
                    """
                )
            )
            connection.execute(
                text(
                    """
                    CREATE INDEX IF NOT EXISTS incidents_geo_gix
                    ON incidents
                    USING GIST (
                      (ST_SetSRID(ST_MakePoint(longitude, latitude), 4326)::geography)
                    )
                    """
                )
            )
        try:
            with engine.begin() as connection:
                connection.execute(
                    text(
                        """
                        CREATE INDEX IF NOT EXISTS complaints_embedding_hnsw
                        ON complaints
                        USING hnsw (embedding vector_cosine_ops)
                        """
                    )
                )
        except Exception:
            logger.warning("HNSW index was not created; search still works on small tables", exc_info=True)
        _initialized = True


def ping_database() -> dict:
    try:
        init_db()
        with engine.connect() as connection:
            postgis = connection.execute(text("SELECT PostGIS_Version()")).scalar()
            pgvector = connection.execute(
                text("SELECT extversion FROM pg_extension WHERE extname = 'vector'")
            ).scalar()
        return {"ok": True, "error": None, "postgis": postgis, "pgvector": pgvector}
    except Exception as exc:
        logger.exception("Database check failed")
        return {"ok": False, "error": safe_error(exc), "postgis": None, "pgvector": None}
