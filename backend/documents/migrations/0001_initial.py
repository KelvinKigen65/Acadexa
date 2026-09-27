from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import pgvector.django.indexes
import pgvector.django.vector


class Migration(migrations.Migration):
    initial = True
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("courses", "0001_initial"),
    ]

    operations = [
        migrations.RunSQL("CREATE EXTENSION IF NOT EXISTS vector", "DROP EXTENSION IF EXISTS vector"),
        migrations.CreateModel(
            name="Document",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=255)),
                ("original_filename", models.CharField(max_length=255)),
                ("file", models.FileField(upload_to="documents.models.document_upload_path")),
                ("file_size", models.PositiveBigIntegerField(default=0)),
                ("page_count", models.PositiveIntegerField(default=0)),
                ("status", models.CharField(choices=[("queued", "Queued"), ("processing", "Processing"), ("ready", "Ready"), ("failed", "Failed")], default="queued", max_length=16)),
                ("extraction_error", models.TextField(blank=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("processed_at", models.DateTimeField(blank=True, null=True)),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="documents", to="courses.course")),
                ("uploaded_by", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="uploaded_documents", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["-created_at"]},
        ),
        migrations.CreateModel(
            name="DocumentChunk",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("ordinal", models.PositiveIntegerField()),
                ("page_number", models.PositiveIntegerField()),
                ("content", models.TextField()),
                ("character_count", models.PositiveIntegerField()),
                ("embedding", pgvector.django.vector.VectorField(dimensions=384)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("document", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="chunks", to="documents.document")),
            ],
            options={
                "ordering": ["document_id", "ordinal"],
                "indexes": [pgvector.django.indexes.HnswIndex(ef_construction=64, fields=["embedding"], m=16, name="chunk_embedding_cosine_hnsw", opclasses=["vector_cosine_ops"])],
            },
        ),
        migrations.AddConstraint(
            model_name="documentchunk",
            constraint=models.UniqueConstraint(fields=("document", "ordinal"), name="unique_document_chunk_ordinal"),
        ),
    ]
