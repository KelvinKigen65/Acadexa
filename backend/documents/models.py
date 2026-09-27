from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from django.conf import settings
from django.core.files.storage import default_storage
from django.db import models
from django.utils.text import get_valid_filename
from pgvector.django import HnswIndex, VectorField

from courses.models import Course


def document_upload_path(instance: "Document", filename: str) -> str:
    safe_name = get_valid_filename(Path(filename).name)
    return f"courses/{instance.course_id}/documents/{uuid4().hex}-{safe_name}"


class Document(models.Model):
    class Status(models.TextChoices):
        QUEUED = "queued", "Queued"
        PROCESSING = "processing", "Processing"
        READY = "ready", "Ready"
        FAILED = "failed", "Failed"

    course = models.ForeignKey(Course, on_delete=models.CASCADE, related_name="documents")
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="uploaded_documents")
    title = models.CharField(max_length=255)
    original_filename = models.CharField(max_length=255)
    file = models.FileField(upload_to=document_upload_path)
    file_size = models.PositiveBigIntegerField(default=0)
    page_count = models.PositiveIntegerField(default=0)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.QUEUED)
    extraction_error = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title

    def delete_file(self) -> None:
        if self.file and default_storage.exists(self.file.name):
            default_storage.delete(self.file.name)


class DocumentChunk(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="chunks")
    ordinal = models.PositiveIntegerField()
    page_number = models.PositiveIntegerField()
    content = models.TextField()
    character_count = models.PositiveIntegerField()
    embedding = VectorField(dimensions=settings.EMBEDDING_DIMENSIONS)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["document_id", "ordinal"]
        constraints = [models.UniqueConstraint(fields=["document", "ordinal"], name="unique_document_chunk_ordinal")]
        indexes = [
            HnswIndex(
                name="chunk_embedding_cosine_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],
            ),
        ]

    def __str__(self) -> str:
        return f"{self.document.title} · page {self.page_number} · chunk {self.ordinal}"
