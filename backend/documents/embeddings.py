"""Embedding providers with a local deterministic development fallback."""

from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured


TOKEN_PATTERN = re.compile(r"[\w'-]+", re.UNICODE)


class EmbeddingError(RuntimeError):
    """Raised when a configured embeddings provider cannot return valid vectors."""


def normalize(vector: list[float]) -> list[float]:
    magnitude = math.sqrt(sum(value * value for value in vector))
    if magnitude == 0:
        raise EmbeddingError("An embedding provider returned a zero vector.")
    return [value / magnitude for value in vector]


class LocalHashEmbeddingProvider:
    """Development-only lexical embeddings; replace with an external provider in production."""

    def embed_many(self, values: list[str]) -> list[list[float]]:
        vectors: list[list[float]] = []
        for value in values:
            vector = [0.0] * settings.EMBEDDING_DIMENSIONS
            tokens = Counter(TOKEN_PATTERN.findall(value.lower()))
            for token, count in tokens.items():
                digest = hashlib.sha256(token.encode("utf-8")).digest()
                bucket = int.from_bytes(digest[:4], "big") % settings.EMBEDDING_DIMENSIONS
                direction = 1.0 if digest[4] % 2 else -1.0
                vector[bucket] += direction * (1 + math.log(count))
            if not tokens:
                vector[0] = 1.0
            vectors.append(normalize(vector))
        return vectors


class OpenAICompatibleEmbeddingProvider:
    """Small HTTP adapter for an OpenAI-compatible /v1/embeddings endpoint."""

    def embed_many(self, values: list[str]) -> list[list[float]]:
        if not all([settings.EMBEDDING_API_URL, settings.EMBEDDING_API_KEY, settings.EMBEDDING_MODEL]):
            raise ImproperlyConfigured("External embeddings require EMBEDDING_API_URL, EMBEDDING_API_KEY, and EMBEDDING_MODEL.")
        body = json.dumps({
            "model": settings.EMBEDDING_MODEL,
            "input": values,
            "dimensions": settings.EMBEDDING_DIMENSIONS,
        }).encode("utf-8")
        request = Request(
            settings.EMBEDDING_API_URL,
            data=body,
            headers={"Authorization": f"Bearer {settings.EMBEDDING_API_KEY}", "Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=30) as response:  # nosec B310 - endpoint is explicit configuration
                payload = json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError) as exc:
            raise EmbeddingError("The embedding provider could not be reached.") from exc

        rows = sorted(payload.get("data", []), key=lambda item: item.get("index", 0))
        vectors = [list(map(float, item.get("embedding", []))) for item in rows]
        if len(vectors) != len(values) or any(len(vector) != settings.EMBEDDING_DIMENSIONS for vector in vectors):
            raise EmbeddingError("The embedding provider returned an unexpected vector count or dimension.")
        return [normalize(vector) for vector in vectors]


def embedding_provider():
    if settings.EMBEDDING_BACKEND == "local_hash":
        if not settings.DEBUG:
            raise ImproperlyConfigured("local_hash embeddings are development-only; configure an external provider for production.")
        return LocalHashEmbeddingProvider()
    if settings.EMBEDDING_BACKEND in {"external", "openai"}:
        return OpenAICompatibleEmbeddingProvider()
    raise ImproperlyConfigured(f"Unsupported EMBEDDING_BACKEND: {settings.EMBEDDING_BACKEND}")
