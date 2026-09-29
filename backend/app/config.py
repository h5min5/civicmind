from functools import lru_cache
from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parents[1]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    database_url: str
    groq_api_key: str
    groq_model: str = "qwen/qwen3.6-27b"
    groq_base_url: str = "https://api.groq.com/openai/v1"
    embedding_base_url: str
    embedding_api_key: str = ""
    embedding_model: str
    embedding_task: str = ""
    embedding_dimensions: int | None = None
    similarity_threshold: float = Field(default=0.80, gt=0, le=1)
    geo_radius_meters: float = Field(default=500, gt=0)
    time_window_hours: float = Field(default=72, gt=0)
    cors_origins: str = "*"
    candidate_limit: int = Field(default=20, ge=1, le=100)

    @model_validator(mode="after")
    def fill_embedding_key(self) -> "Settings":
        if not self.embedding_api_key.strip():
            self.embedding_api_key = self.groq_api_key
        self.database_url = normalize_database_url(self.database_url)
        self.groq_base_url = self.groq_base_url.rstrip("/")
        self.embedding_base_url = self.embedding_base_url.rstrip("/")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        raw = self.cors_origins.strip()
        if raw == "*":
            return ["*"]
        return [origin.strip() for origin in raw.split(",") if origin.strip()]


def normalize_database_url(url: str) -> str:
    cleaned = url.strip()
    if cleaned.startswith("postgres://"):
        cleaned = "postgresql://" + cleaned[len("postgres://") :]
    if cleaned.startswith("postgresql://"):
        cleaned = "postgresql+psycopg://" + cleaned[len("postgresql://") :]
    if "supabase" in cleaned and "sslmode=" not in cleaned:
        cleaned += ("&" if "?" in cleaned else "?") + "sslmode=require"
    return cleaned


@lru_cache
def get_settings() -> Settings:
    return Settings()
