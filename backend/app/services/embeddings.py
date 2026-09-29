import logging
from functools import lru_cache

import httpx
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AppMeta

logger = logging.getLogger("civicmind")

SIGNATURE_DIM = "embedding_dimensions"
SIGNATURE_MODEL = "embedding_model"


class ProviderError(Exception):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


class EmbeddingClient:
    """OpenAI-compatible embeddings. Dimension is measured, never assumed."""

    def __init__(self) -> None:
        self._dimension: int | None = None

    def embed(self, text: str, session: Session | None = None) -> list[float]:
        vector = self._request(text)
        self._check_dimension(vector, session)
        return vector

    def probe(self, session: Session | None = None) -> int:
        vector = self.embed("Mumbai civic complaint about a pothole", session)
        return len(vector)

    def _request(self, text: str) -> list[float]:
        settings = get_settings()
        payload: dict = {"model": settings.embedding_model, "input": text}
        if settings.embedding_task:
            payload["task"] = settings.embedding_task
        try:
            response = httpx.post(
                f"{settings.embedding_base_url}/embeddings",
                headers={
                    "Authorization": f"Bearer {settings.embedding_api_key}",
                    "Content-Type": "application/json",
                },
                json=payload,
                timeout=45,
            )
        except httpx.HTTPError as exc:
            raise ProviderError(f"Could not reach the embedding provider. {exc}") from exc

        if response.status_code in {401, 403}:
            raise ProviderError("The embedding API key was rejected. Check EMBEDDING_API_KEY.")
        if response.status_code >= 400:
            detail = response.text[:300]
            hint = ""
            if "api.groq.com" in settings.embedding_base_url:
                hint = " Groq does not serve embeddings. Set EMBEDDING_BASE_URL to an OpenAI-compatible embeddings host."
            raise ProviderError(f"Embedding provider returned {response.status_code}: {detail}.{hint}")

        body = response.json()
        data = body.get("data")
        vector = None
        if isinstance(data, list) and data and isinstance(data[0], dict) and "embedding" in data[0]:
            vector = data[0]["embedding"]
        elif isinstance(data, list) and data and isinstance(data[0], (int, float)):
            vector = data
        if not isinstance(vector, list) or not vector or not all(isinstance(item, (int, float)) for item in vector):
            raise ProviderError("The embedding provider returned a response without a numeric vector.")
        return [float(item) for item in vector]

    def _check_dimension(self, vector: list[float], session: Session | None) -> None:
        settings = get_settings()
        dimension = len(vector)
        if settings.embedding_dimensions and dimension != settings.embedding_dimensions:
            raise ProviderError(
                f"Embedding dimension is {dimension}, but EMBEDDING_DIMENSIONS is set to {settings.embedding_dimensions}."
            )
        if self._dimension is not None and dimension != self._dimension:
            raise ProviderError(
                f"Embedding dimension changed from {self._dimension} to {dimension} in the same process."
            )
        if session is not None:
            _remember_signature(session, dimension, settings.embedding_model)
        self._dimension = dimension


def _remember_signature(session: Session, dimension: int, model: str) -> None:
    stored_dim = session.get(AppMeta, SIGNATURE_DIM)
    stored_model = session.get(AppMeta, SIGNATURE_MODEL)
    if stored_dim is not None and int(stored_dim.value) != dimension:
        raise ProviderError(
            f"This database already stores {stored_dim.value}-dimensional embeddings, "
            f"but the provider returned {dimension}. Keep the original model or use a new database."
        )
    if stored_model is not None and stored_model.value != model:
        raise ProviderError(
            f"This database was embedded with '{stored_model.value}', but the app is now using '{model}'. "
            "Mixing models would make similarity meaningless."
        )
    if stored_dim is None:
        session.add(AppMeta(key=SIGNATURE_DIM, value=str(dimension)))
    if stored_model is None:
        session.add(AppMeta(key=SIGNATURE_MODEL, value=model))


def read_signature(session: Session) -> tuple[int | None, str | None]:
    dim_row = session.get(AppMeta, SIGNATURE_DIM)
    model_row = session.get(AppMeta, SIGNATURE_MODEL)
    dimension = int(dim_row.value) if dim_row is not None else None
    model = model_row.value if model_row is not None else None
    return dimension, model


def to_pgvector(values: list[float]) -> str:
    return "[" + ",".join(str(float(value)) for value in values) + "]"


@lru_cache
def get_embedding_client() -> EmbeddingClient:
    return EmbeddingClient()


def cached_dimension() -> int | None:
    client = get_embedding_client()
    return client._dimension
