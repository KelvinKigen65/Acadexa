from django.conf import settings
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(["GET"])
@permission_classes([AllowAny])
def health(request):
    """Expose only non-sensitive runtime configuration for liveness checks."""
    return Response({
        "status": "ok",
        "embedding_backend": settings.EMBEDDING_BACKEND,
        "llm_backend": settings.LLM_BACKEND,
    })
