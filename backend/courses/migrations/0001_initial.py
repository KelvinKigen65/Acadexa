from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name="Course",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("title", models.CharField(max_length=160)),
                ("code", models.CharField(max_length=32)),
                ("description", models.TextField(blank=True)),
                ("color", models.CharField(default="#5577BD", max_length=7)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("owner", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="courses", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ["code", "title"]},
        ),
        migrations.AddConstraint(
            model_name="course",
            constraint=models.UniqueConstraint(fields=("owner", "code"), name="unique_course_code_per_owner"),
        ),
    ]
