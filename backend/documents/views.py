from django.db.models import Count
from rest_framework import status
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet

from documents.ingestion import DocumentIngestionError, ingest_document
from documents.models import Document
from documents.serializers import DocumentSerializer


class DocumentViewSet(ModelViewSet):
    serializer_class = DocumentSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser]
    http_method_names = ["get", "post", "delete", "head", "options"]

    def get_queryset(self):
        return (
            Document.objects.filter(course__owner=self.request.user)
            .select_related("course")
            .annotate(chunks_count=Count("chunks"))
        )

    def perform_create(self, serializer):
        document = serializer.save()
        try:
            ingest_document(document)
        except DocumentIngestionError:
            # The failed status and a safe explanation are persisted on the document.
            pass

    def perform_destroy(self, instance):
        instance.delete_file()
        instance.delete()

    @action(detail=True, methods=["post"])
    def reprocess(self, request, pk=None):
        document = self.get_object()
        try:
            ingest_document(document)
        except DocumentIngestionError:
            return Response(DocumentSerializer(document, context={"request": request}).data, status=status.HTTP_422_UNPROCESSABLE_ENTITY)
        return Response(DocumentSerializer(document, context={"request": request}).data)
