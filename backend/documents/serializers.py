from pathlib import Path

from django.conf import settings
from rest_framework import serializers

from courses.models import Course
from documents.models import Document


class DocumentSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.title", read_only=True)
    chunks_count = serializers.SerializerMethodField()
    file = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = Document
        fields = (
            "id", "course", "course_name", "title", "original_filename", "file", "file_size",
            "page_count", "status", "extraction_error", "chunks_count", "created_at", "processed_at",
        )
        read_only_fields = ("id", "original_filename", "file_size", "page_count", "status", "extraction_error", "chunks_count", "created_at", "processed_at")
        extra_kwargs = {"title": {"required": False}}

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            fields["course"].queryset = Course.objects.filter(owner=request.user)
        return fields

    def get_chunks_count(self, instance: Document) -> int:
        if hasattr(instance, "chunks_count"):
            return instance.chunks_count
        return instance.chunks.count()

    def validate_file(self, value):
        if value.size > settings.MAX_DOCUMENT_BYTES:
            raise serializers.ValidationError("PDFs must be smaller than 30 MB.")
        if Path(value.name).suffix.lower() != ".pdf":
            raise serializers.ValidationError("Only PDF files are supported.")
        header = value.read(5)
        value.seek(0)
        if header != b"%PDF-":
            raise serializers.ValidationError("The uploaded file is not a valid PDF.")
        return value

    def validate(self, attrs):
        if self.instance is None and "file" not in attrs:
            raise serializers.ValidationError({"file": "A PDF file is required."})
        return attrs

    def create(self, validated_data):
        uploaded_file = validated_data.pop("file")
        title = validated_data.get("title") or Path(uploaded_file.name).stem
        return Document.objects.create(
            **validated_data,
            title=title,
            original_filename=Path(uploaded_file.name).name,
            file=uploaded_file,
            file_size=uploaded_file.size,
            uploaded_by=self.context["request"].user,
        )
