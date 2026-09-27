from rest_framework import serializers

from courses.models import Course


class CourseSerializer(serializers.ModelSerializer):
    documents_count = serializers.SerializerMethodField()

    class Meta:
        model = Course
        fields = ("id", "title", "code", "description", "color", "documents_count", "created_at", "updated_at")
        read_only_fields = ("id", "documents_count", "created_at", "updated_at")

    def get_documents_count(self, instance: Course) -> int:
        if hasattr(instance, "documents_count"):
            return instance.documents_count
        return instance.documents.count()

    def validate_color(self, value: str) -> str:
        if len(value) != 7 or not value.startswith("#"):
            raise serializers.ValidationError("Use a hex color in the form #RRGGBB.")
        try:
            int(value[1:], 16)
        except ValueError as exc:
            raise serializers.ValidationError("Use a hex color in the form #RRGGBB.") from exc
        return value.lower()
