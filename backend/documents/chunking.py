"""Deterministic, page-aware text normalisation and chunking."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Iterable


WHITESPACE = re.compile(r"\s+")


@dataclass(frozen=True)
class PreparedChunk:
    page_number: int
    ordinal: int
    content: str


def clean_text(value: str) -> str:
    return WHITESPACE.sub(" ", value).strip()


def split_text(value: str, chunk_size: int = 900, overlap: int = 160) -> list[str]:
    """Split text near word boundaries while retaining bounded context overlap."""
    if chunk_size <= 0:
        raise ValueError("chunk_size must be positive")
    if not 0 <= overlap < chunk_size:
        raise ValueError("overlap must be at least 0 and smaller than chunk_size")

    text = clean_text(value)
    if not text:
        return []

    chunks: list[str] = []
    start = 0
    while start < len(text):
        end = min(start + chunk_size, len(text))
        if end < len(text):
            boundary = text.rfind(" ", start + chunk_size // 2, end)
            if boundary > start:
                end = boundary
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= len(text):
            break
        start = max(start + 1, end - overlap)
    return chunks


def prepare_chunks(pages: Iterable[tuple[int, str]], chunk_size: int = 900, overlap: int = 160) -> list[PreparedChunk]:
    prepared: list[PreparedChunk] = []
    ordinal = 0
    for page_number, page_text in pages:
        for content in split_text(page_text, chunk_size=chunk_size, overlap=overlap):
            prepared.append(PreparedChunk(page_number=page_number, ordinal=ordinal, content=content))
            ordinal += 1
    return prepared
