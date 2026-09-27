from rest_framework import serializers

from chat.models import Citation, Conversation, Message
from courses.models import Course


class CitationSerializer(serializers.ModelSerializer):
    document_id = serializers.IntegerField(source="chunk.document_id", read_only=True)
    document_title = serializers.CharField(source="chunk.document.title", read_only=True)
    page_number = serializers.IntegerField(source="chunk.page_number", read_only=True)
    chunk_id = serializers.IntegerField(source="chunk_id", read_only=True)

    class Meta:
        model = Citation
        fields = ("id", "chunk_id", "document_id", "document_title", "page_number", "relevance")


class MessageSerializer(serializers.ModelSerializer):
    citations = CitationSerializer(many=True, read_only=True)

    class Meta:
        model = Message
        fields = ("id", "role", "content", "generation_mode", "citations", "created_at")


class ConversationSerializer(serializers.ModelSerializer):
    course_name = serializers.CharField(source="course.title", read_only=True)

    class Meta:
        model = Conversation
        fields = ("id", "course", "course_name", "title", "created_at", "updated_at")
        read_only_fields = ("id", "course_name", "created_at", "updated_at")

    def get_fields(self):
        fields = super().get_fields()
        request = self.context.get("request")
        if request and request.user.is_authenticated:
            fields["course"].queryset = Course.objects.filter(owner=request.user)
        return fields


class ConversationDetailSerializer(ConversationSerializer):
    messages = MessageSerializer(many=True, read_only=True)

    class Meta(ConversationSerializer.Meta):
        fields = ConversationSerializer.Meta.fields + ("messages",)


class AskQuestionSerializer(serializers.Serializer):
    question = serializers.CharField(max_length=3000, trim_whitespace=True)

    def validate_question(self, value: str) -> str:
        if not value:
            raise serializers.ValidationError("A question is required.")
        return value
