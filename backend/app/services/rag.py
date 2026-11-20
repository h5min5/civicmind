"""Municipal knowledge retrieval. Answers must cite stored passages."""

import hashlib
import re
from pathlib import Path

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.config import BASE_DIR

KNOWLEDGE_DIR = BASE_DIR / "knowledge"
TOKEN = re.compile(r"[a-z0-9]{3,}")


def knowledge_files() -> list[Path]:
    if not KNOWLEDGE_DIR.is_dir():
        return []
    return sorted(KNOWLEDGE_DIR.glob("*.md"))


def knowledge_hash() -> str:
    digest = hashlib.sha256()
    for path in knowledge_files():
        digest.update(path.name.encode())
        digest.update(path.read_bytes())
    return digest.hexdigest()


def chunk_markdown(path: Path) -> list[dict]:
    title = path.stem.replace("_", " ")
    sections: list[tuple[str, list[str]]] = [(title, [])]
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.startswith("## "):
            sections.append((line[3:].strip() or title, []))
        else:
            sections[-1][1].append(line)
    chunks = []
    index = 0
    for heading, body_lines in sections:
        body = "\n".join(body_lines).strip()
        if len(body) < 40:
            continue
        block = f"{heading}\n{body}"
        while block:
            piece = block[:900]
            if len(block) > 900:
                split = piece.rfind("\n")
                if split > 400:
                    piece = piece[:split]
            piece = piece.strip()
            if piece:
                chunks.append(
                    {
                        "doc_id": path.stem,
                        "title": heading,
                        "source": path.name,
                        "content": piece,
                        "chunk_index": index,
                    }
                )
                index += 1
            block = block[len(piece) :].strip()
    return chunks


def tokens(value: str) -> set[str]:
    return set(TOKEN.findall(value.lower()))


def _covers(query: set[str], content: set[str]) -> set[str]:
    found: set[str] = set()
    for token in query:
        if token in content:
            found.add(token)
            continue
        if len(token) >= 5 and any(len(word) >= 5 and (word.startswith(token) or token.startswith(word)) for word in content):
            found.add(token)
    return found


def rank_chunks(question: str, chunks: list[dict], limit: int = 4) -> list[dict]:
    """Rank chunks by the share of question tokens that appear in the title or body."""
    query = tokens(question)
    if not query:
        return []
    ranked = []
    for chunk in chunks:
        overlap = _covers(query, tokens(f"{chunk.get('title', '')} {chunk.get('content', '')}"))
        score = len(overlap) / len(query)
        if score <= 0:
            continue
        ranked.append(
            {
                "title": chunk.get("title") or "Knowledge",
                "source": chunk.get("source") or chunk.get("title") or "Knowledge",
                "content": chunk.get("content") or "",
                "score": round(score, 3),
            }
        )
    ranked.sort(key=lambda item: item["score"], reverse=True)
    return ranked[:limit]


def ensure_index(session: Session) -> dict:
    from app.models import AppMeta, KnowledgeChunk
    from app.services.embeddings import ProviderError, get_embedding_client

    files = knowledge_files()
    digest = knowledge_hash()
    stored = session.get(AppMeta, "knowledge_hash")
    existing = session.scalar(select(func.count()).select_from(KnowledgeChunk)) or 0
    if stored is not None and stored.value == digest and existing:
        embedded = session.scalar(
            select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.embedding.is_not(None))
        ) or 0
        return {"chunks": existing, "embedded": embedded, "rebuilt": False}
    session.execute(text("DELETE FROM knowledge_chunks"))
    pieces = [piece for path in files for piece in chunk_markdown(path)]
    embedded = 0
    error = None
    client = get_embedding_client()
    for piece in pieces:
        vector = None
        try:
            vector = client.embed(piece["content"], session)
            embedded += 1
        except ProviderError as exc:
            error = str(exc)
            vector = None
        session.add(
            KnowledgeChunk(
                doc_id=piece["doc_id"],
                title=piece["title"],
                source=piece["source"],
                chunk_index=piece["chunk_index"],
                content=piece["content"],
                embedding=vector,
            )
        )
    if stored is None:
        session.add(AppMeta(key="knowledge_hash", value=digest))
    else:
        stored.value = digest
    session.flush()
    return {"chunks": len(pieces), "embedded": embedded, "rebuilt": True, "embedding_error": error}


def retrieve(session: Session, question: str, limit: int = 4) -> list[dict]:
    from app.services.embeddings import ProviderError, get_embedding_client, to_pgvector

    index = ensure_index(session)
    rows = session.execute(
        text("SELECT title, source, content FROM knowledge_chunks ORDER BY source, chunk_index")
    ).mappings().all()
    keyword = rank_chunks(question, [dict(row) for row in rows], limit=limit)
    embedded = index.get("embedded") or 0
    if not embedded:
        return keyword
    try:
        vector = get_embedding_client().embed(question, session)
    except ProviderError:
        return keyword
    semantic = session.execute(
        text(
            """
            SELECT title, source, content,
                   (1 - (embedding <=> CAST(:embedding AS vector))) AS score
            FROM knowledge_chunks
            WHERE embedding IS NOT NULL
            ORDER BY embedding <=> CAST(:embedding AS vector)
            LIMIT :limit
            """
        ),
        {"embedding": to_pgvector(vector), "limit": limit},
    ).mappings().all()
    found = [
        {
            "title": row["title"],
            "source": row["source"],
            "content": row["content"],
            "score": round(max(0.0, float(row["score"])), 3),
        }
        for row in semantic
        if row["score"] is not None and float(row["score"]) > 0.2
    ]
    return found or keyword
