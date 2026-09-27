"""ASGI config for Acadexa."""

import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "acadexa.settings")

application = get_asgi_application()
