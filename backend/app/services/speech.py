"""Transcribe a spoken complaint and name the language that was actually spoken."""

import re

import httpx

from app.config import get_settings
from app.services.embeddings import ProviderError

SUPPORTED = ("en", "hi", "mr")
MAX_AUDIO_BYTES = 12_000_000
_LANGUAGE_NAMES = {
    "en": "en",
    "english": "en",
    "hi": "hi",
    "hindi": "hi",
    "mr": "mr",
    "marathi": "mr",
}
_MARATHI = {"आहे", "आहेत", "नाही", "झाला", "झाली", "झाले", "साठी", "मध्ये", "जवळ", "येथे", "तिथे", "पाहिजे", "होते", "होता", "रस्त्यावर", "खड्डा"}
_HINDI = {"है", "हैं", "नहीं", "गया", "गयी", "गए", "लिए", "में", "पास", "यहाँ", "वहां", "वहाँ", "चाहिए", "था", "थी", "सड़क", "गड्ढा"}


def transcribe(audio: bytes, filename: str, media_type: str, hint: str | None) -> dict:
    if not audio:
        raise ValueError("The recording was empty.")
    if len(audio) > MAX_AUDIO_BYTES:
        raise ValueError("The recording is too long. Stop it within about a minute.")
    settings = get_settings()
    try:
        response = httpx.post(
            f"{settings.groq_base_url}/audio/transcriptions",
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data={"model": settings.groq_whisper_model, "response_format": "verbose_json", "temperature": "0"},
            files={"file": (filename or "speech.webm", audio, media_type or "audio/webm")},
            timeout=60,
        )
    except httpx.HTTPError as exc:
        raise ProviderError(f"Could not reach the speech service. {exc}") from exc
    if response.status_code in {401, 403}:
        raise ProviderError("The Groq API key was rejected. Check GROQ_API_KEY.")
    if response.status_code >= 400:
        raise ProviderError(f"Speech transcription returned {response.status_code}: {response.text[:300]}")
    body = response.json()
    text = str(body.get("text") or "").strip()
    if not text:
        raise ValueError("No words were heard. Speak again, closer to the microphone.")
    language, switched = choose_language(text, str(body.get("language") or ""), hint)
    return {"text": text, "language": language, "switched": switched}


def choose_language(text: str, reported: str, hint: str | None) -> tuple[str, bool]:
    """Prefer the spoken language over the chip the citizen had selected."""
    selected = hint if hint in SUPPORTED else "en"
    detected = _LANGUAGE_NAMES.get(reported.strip().lower())
    devanagari, latin = _script_counts(text)
    if latin >= 8 and latin > devanagari * 2:
        detected = "en"
    elif devanagari >= 4 and devanagari > latin:
        detected = _indic_language(text, detected if detected in {"hi", "mr"} else None)
    if detected not in SUPPORTED:
        return selected, False
    return detected, detected != selected


def _indic_language(text: str, fallback: str | None) -> str:
    words = set(re.findall(r"[\u0900-\u097F]+", text))
    marathi = len(words & _MARATHI)
    hindi = len(words & _HINDI)
    if marathi > hindi:
        return "mr"
    if hindi > marathi:
        return "hi"
    return fallback or "hi"


def _script_counts(text: str) -> tuple[int, int]:
    devanagari = sum(1 for char in text if "\u0900" <= char <= "\u097F")
    latin = sum(1 for char in text if ("A" <= char <= "Z") or ("a" <= char <= "z"))
    return devanagari, latin
