"""PDF extraction and chunk persistence for the document ingestion pipeline."""

from __future__ import annotations

from dataclasses import dataclass

import fitz
from django.core.exceptions import ImproperlyConfigured
from django.db import transaction
from django.utils import timezone

from documents.chunking import PreparedChunk, prepare_chunks
from documents.embeddings import EmbeddingError, embedding_provider
from documents.models import Document, DocumentChunk


class DocumentIngestionError(RuntimeError):
    """A safe, user-displayable document-processing failure."""


@dataclass(frozen=True)
class IngestionResult:
    pages: int
    chunks: int


def extract_pages(document: Document) -> list[tuple[int, str]]:
    document.file.open("rb")
    try:
        payload = document.file.read()
    finally:
        document.file.close()
    try:
        pdf = fitz.open(stream=payload, filetype="pdf")
    except (fitz.FileDataError, RuntimeError) as exc:
        raise DocumentIngestionError("The uploaded file could not be read as a PDF.") from exc

    try:
        if pdf.needs_pass:
            raise DocumentIngestionError("Password-protected PDFs cannot be processed.")
        pages = [(index + 1, page.get_text("text")) for index, page in enumerate(pdf)]
    finally:
        pdf.close()
    if not any(text.strip() for _, text in pages):
        raise DocumentIngestionError("No selectable text was found in this PDF. OCR is not available yet.")
    return pages


def ingest_document(document: Document) -> IngestionResult:
    """Synchronously ingest a PDF. Production deployments should call this from a job queue."""
    document.status = Document.Status.PROCESSING
    document.extraction_error = ""
    document.save(update_fields=["status", "extraction_error"])
    try:
        pages = extract_pages(document)
        chunks = prepare_chunks(pages)
        if not chunks:
            raise DocumentIngestionError("No usable text chunks could be created from this PDF.")
        vectors = embedding_provider().embed_many([chunk.content for chunk in chunks])
        models = [
            DocumentChunk(
                document=document,
                ordinal=chunk.ordinal,
                page_number=chunk.page_number,
                content=chunk.content,
                character_count=len(chunk.content),
                embedding=vector,
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        with transaction.atomic():
            DocumentChunk.objects.filter(document=document).delete()
            DocumentChunk.objects.bulk_create(models, batch_size=250)
            document.page_count = len(pages)
            document.status = Document.Status.READY
            document.processed_at = timezone.now()
            document.save(update_fields=["page_count", "status", "processed_at", "extraction_error"])
        return IngestionResult(pages=len(pages), chunks=len(models))
    except (DocumentIngestionError, EmbeddingError, ImproperlyConfigured, OSError, ValueError) as exc:
        document.status = Document.Status.FAILED
        document.extraction_error = str(exc)[:1000]
        document.save(update_fields=["status", "extraction_error"])
        raise DocumentIngestionError(document.extraction_error) from exc
