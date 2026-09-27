from django.conf import settings
from django.db import models


class Course(models.Model):
    owner = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="courses")
    title = models.CharField(max_length=160)
    code = models.CharField(max_length=32)
    description = models.TextField(blank=True)
    color = models.CharField(max_length=7, default="#5577BD")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["code", "title"]
        constraints = [models.UniqueConstraint(fields=["owner", "code"], name="unique_course_code_per_owner")]

    def __str__(self) -> str:
        return f"{self.code} — {self.title}"
