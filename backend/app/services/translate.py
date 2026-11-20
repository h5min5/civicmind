"""Turn stored English reports, and the rest of the platform text, into the language a person is viewing."""

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.database import SessionLocal
from app.models import Translation
from app.services.embeddings import ProviderError
from app.services.groq_vision import _extract_json, complete_chat

TARGETS = {
    "en": "English",
    "hi": "Hindi, in Devanagari",
    "mr": "Marathi, in Devanagari",
}


def has_devanagari(text: str) -> bool:
    return sum(1 for char in text if "\u0900" <= char <= "\u097F") >= 4


def ensure_english(session: Session, text: str) -> str:
    """Complaints may be filed in Hindi or Marathi. The stored report is English."""
    cleaned = " ".join(text.split())
    if not cleaned or not has_devanagari(cleaned):
        return text
    try:
        translated = translate_many(session, [cleaned], "en")[0]
    except ProviderError:
        return text
    return translated or text


def translate_many(session: Session, texts: list[str], target: str) -> list[str]:
    if target not in TARGETS:
        raise ValueError("Choose English, Hindi, or Marathi.")
    if len(texts) > 40:
        raise ValueError("Translate at most 40 passages at once.")
    prepared = [" ".join(text.split())[:2000] for text in texts]
    result = list(prepared)
    missing: list[tuple[int, str, str]] = []
    for index, text in enumerate(prepared):
        if not text:
            continue
        digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
        cached = session.scalar(
            select(Translation.text).where(Translation.source_hash == digest, Translation.target == target)
        )
        if cached:
            result[index] = cached
            continue
        if target == "en" and not has_devanagari(text):
            result[index] = text
            continue
        missing.append((index, digest, text))
    if not missing:
        return result
    translated = _ask(target, [item[2] for item in missing])
    for (index, digest, source), value in zip(missing, translated, strict=False):
        text = value.strip() if value and value.strip() else source
        result[index] = text
        session.execute(
            pg_insert(Translation)
            .values(source_hash=digest, target=target, text=text)
            .on_conflict_do_nothing(index_elements=["source_hash", "target"])
        )
    session.flush()
    return result


def translate_view(texts: list[str], target: str) -> list[str]:
    """Translate for the page without holding a database connection during the model call."""
    if target not in TARGETS:
        raise ValueError("Choose English, Hindi, or Marathi.")
    if len(texts) > 40:
        raise ValueError("Translate at most 40 passages at once.")
    prepared = [" ".join(text.split())[:2000] for text in texts]
    result = list(prepared)
    missing: list[tuple[int, str, str]] = []
    session = SessionLocal()
    try:
        with session.begin():
            for index, text in enumerate(prepared):
                if not text:
                    continue
                digest = hashlib.sha256(text.encode("utf-8")).hexdigest()
                cached = session.scalar(
                    select(Translation.text).where(Translation.source_hash == digest, Translation.target == target)
                )
                if cached:
                    result[index] = cached
                    continue
                if target == "en" and not has_devanagari(text):
                    continue
                missing.append((index, digest, text))
    finally:
        session.close()
    if not missing:
        return result
    translated = _ask(target, [item[2] for item in missing])
    session = SessionLocal()
    try:
        with session.begin():
            for (index, digest, source), value in zip(missing, translated, strict=False):
                text = value.strip() if value and value.strip() else source
                result[index] = text
                session.execute(
                    pg_insert(Translation)
                    .values(source_hash=digest, target=target, text=text)
                    .on_conflict_do_nothing(index_elements=["source_hash", "target"])
                )
    finally:
        session.close()
    return result


def _ask(target: str, texts: list[str]) -> list[str]:
    numbered = "\n".join(f"{index + 1}. {text}" for index, text in enumerate(texts))
    raw = complete_chat(
        (
            "You translate civic-platform text. The source may be English, Hindi, or Marathi. "
            f"Write every item in {TARGETS[target]}. If an item is already in that language, repeat it. "
            "Keep complaint codes, numbers, and coordinates unchanged. "
            'Return only JSON: {"translations": ["...", "..."]} with one string per item, in the same order.'
        ),
        numbered,
        timeout=50,
    )
    try:
        payload = _extract_json(raw)
        values = payload.get("translations")
        if not isinstance(values, list):
            raise ValueError("missing translations")
        return [str(item) if item is not None else "" for item in values]
    except (ValueError, json.JSONDecodeError, TypeError):
        return texts
