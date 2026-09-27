from django.contrib import admin

from chat.models import Citation, Conversation, Message

admin.site.register(Conversation)
admin.site.register(Message)
admin.site.register(Citation)
