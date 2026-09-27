from django.contrib import admin

from documents.models import Document, DocumentChunk


@admin.register(Document)
class DocumentAdmin(admin.ModelAdmin):
    list_display = ("title", "course", "status", "page_count", "created_at")
    list_filter = ("status", "course")
    search_fields = ("title", "original_filename")


@admin.register(DocumentChunk)
class DocumentChunkAdmin(admin.ModelAdmin):
    list_display = ("document", "page_number", "ordinal", "character_count")
    search_fields = ("document__title", "content")
