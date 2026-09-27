from django.db import transaction
from django.core.exceptions import ImproperlyConfigured
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.exceptions import APIException
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from chat.models import Citation, Conversation, Message
from chat.serializers import AskQuestionSerializer, ConversationDetailSerializer, ConversationSerializer, MessageSerializer
from rag.workflow import GenerationError, answer_question


class RagUnavailable(APIException):
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE
    default_detail = "The academic-answering service is temporarily unavailable."
    default_code = "rag_unavailable"


class ConversationViewSet(ModelViewSet):
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Conversation.objects.filter(user=self.request.user).select_related("course")
        if self.action == "retrieve":
            queryset = queryset.prefetch_related("messages__citations__chunk__document")
        return queryset

    def get_serializer_class(self):
        return ConversationDetailSerializer if self.action == "retrieve" else ConversationSerializer

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=True, methods=["post"])
    def ask(self, request, pk=None):
        conversation = self.get_object()
        payload = AskQuestionSerializer(data=request.data)
        payload.is_valid(raise_exception=True)
        question = payload.validated_data["question"]

        try:
            result = answer_question(question=question, user_id=request.user.id, course_id=conversation.course_id)
        except (GenerationError, ImproperlyConfigured, RuntimeError) as exc:
            raise RagUnavailable() from exc

        with transaction.atomic():
            Message.objects.create(conversation=conversation, role=Message.Role.USER, content=question)
            assistant_message = Message.objects.create(
                conversation=conversation,
                role=Message.Role.ASSISTANT,
                content=result.answer,
                generation_mode=result.generation_mode,
            )
            Citation.objects.bulk_create([
                Citation(message=assistant_message, chunk_id=chunk.id, relevance=chunk.relevance)
                for chunk in result.chunks
            ])
            if not conversation.title:
                conversation.title = question[:160]
            conversation.save(update_fields=["title", "updated_at"])

        assistant_message = Message.objects.prefetch_related("citations__chunk__document").get(pk=assistant_message.pk)
        return Response(MessageSerializer(assistant_message).data, status=status.HTTP_201_CREATED)
