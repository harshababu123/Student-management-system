from django.db import migrations, models
import django.db.models.deletion


def migrate_legacy_courses(apps, schema_editor):
    Course = apps.get_model("students", "Course")
    Student = apps.get_model("students", "Student")
    for student in Student.objects.all().iterator():
        old_name = (student.legacy_course or "").strip() or "General Studies"
        course, _ = Course.objects.get_or_create(
            name=old_name,
            defaults={"code": f"LEG-{student.pk}"},
        )
        student.course_id = course.pk
        student.student_code = f"STU-{student.pk:05d}"
        student.save(update_fields=["course", "student_code"])


class Migration(migrations.Migration):
    dependencies = [("students", "0001_initial")]

    operations = [
        migrations.CreateModel(
            name="Course",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("name", models.CharField(max_length=120, unique=True)),
                ("code", models.CharField(max_length=20, unique=True)),
                ("description", models.TextField(blank=True)),
                ("is_active", models.BooleanField(default=True)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
            ],
            options={"ordering": ["name"]},
        ),
        migrations.RenameField(model_name="student", old_name="course", new_name="legacy_course"),
        migrations.AddField(model_name="student", name="student_code", field=models.CharField(blank=True, max_length=24, null=True, unique=True)),
        migrations.AddField(model_name="student", name="phone", field=models.CharField(blank=True, max_length=24)),
        migrations.AddField(model_name="student", name="gender", field=models.CharField(blank=True, choices=[("female", "Female"), ("male", "Male"), ("nonbinary", "Non-binary"), ("undisclosed", "Prefer not to say")], max_length=16)),
        migrations.AddField(model_name="student", name="date_of_birth", field=models.DateField(blank=True, null=True)),
        migrations.AddField(model_name="student", name="address", field=models.TextField(blank=True)),
        migrations.AddField(model_name="student", name="is_active", field=models.BooleanField(default=True)),
        migrations.AddField(model_name="student", name="created_at", field=models.DateTimeField(auto_now_add=True)),
        migrations.AddField(model_name="student", name="course", field=models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="students", to="students.course")),
        migrations.RunPython(migrate_legacy_courses, migrations.RunPython.noop),
        migrations.RemoveField(model_name="student", name="legacy_course"),
        migrations.RemoveField(model_name="student", name="age"),
        migrations.CreateModel(
            name="Mark",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("assessment", models.CharField(max_length=120)),
                ("score", models.DecimalField(decimal_places=2, max_digits=7)),
                ("maximum_score", models.DecimalField(decimal_places=2, default=100, max_digits=7)),
                ("feedback", models.TextField(blank=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("course", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="marks", to="students.course")),
                ("student", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="marks", to="students.student")),
            ],
            options={"ordering": ["-updated_at", "assessment"]},
        ),
        migrations.AddConstraint(
            model_name="mark",
            constraint=models.UniqueConstraint(fields=("student", "course", "assessment"), name="unique_student_course_assessment"),
        ),
        migrations.AlterField(model_name="student", name="course", field=models.ForeignKey(on_delete=django.db.models.deletion.SET_NULL, related_name="students", to="students.course")),
    ]
