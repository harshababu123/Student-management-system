from django.db import models


class Course(models.Model):
    name = models.CharField(max_length=120, unique=True)
    code = models.CharField(max_length=20, unique=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return f"{self.code} · {self.name}"


class Student(models.Model):
    GENDER_CHOICES = [("female", "Female"), ("male", "Male"), ("nonbinary", "Non-binary"), ("undisclosed", "Prefer not to say")]
    student_code = models.CharField(max_length=24, unique=True, null=True, blank=True)
    user = models.OneToOneField("auth.User", on_delete=models.SET_NULL, null=True, blank=True, related_name="student_profile")
    name = models.CharField(max_length=100)
    email = models.EmailField(unique=True)
    phone = models.CharField(max_length=24, blank=True)
    gender = models.CharField(max_length=16, choices=GENDER_CHOICES, blank=True)
    date_of_birth = models.DateField(null=True, blank=True)
    address = models.TextField(blank=True)
    course = models.ForeignKey(Course, on_delete=models.SET_NULL, null=True, related_name="students")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name", "id"]

    def save(self, *args, **kwargs):
        super().save(*args, **kwargs)
        if not self.student_code:
            self.student_code = f"STU-{self.pk:05d}"
            super().save(update_fields=["student_code"])

    @property
    def age(self):
        if not self.date_of_birth:
            return None
        from datetime import date
        today = date.today()
        return today.year - self.date_of_birth.year - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))

    def __str__(self):
        return f"{self.student_code or 'New student'} · {self.name}"


class Mark(models.Model):
    student = models.ForeignKey(Student, on_delete=models.CASCADE, related_name="marks")
    course = models.ForeignKey(Course, on_delete=models.PROTECT, related_name="marks")
    assessment = models.CharField(max_length=120)
    score = models.DecimalField(max_digits=7, decimal_places=2)
    maximum_score = models.DecimalField(max_digits=7, decimal_places=2, default=100)
    feedback = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at", "assessment"]
        constraints = [models.UniqueConstraint(fields=["student", "course", "assessment"], name="unique_student_course_assessment")]

    @property
    def percentage(self):
        if not self.maximum_score:
            return 0
        return round(float(self.score / self.maximum_score * 100), 1)

    def __str__(self):
        return f"{self.student.student_code} · {self.assessment}"
