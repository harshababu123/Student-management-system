from django.contrib import admin

from .models import Course, Mark, Student


@admin.register(Course)
class CourseAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "is_active")
    search_fields = ("code", "name")
    list_filter = ("is_active",)


@admin.register(Student)
class StudentAdmin(admin.ModelAdmin):
    list_display = ("student_code", "name", "email", "course", "is_active")
    search_fields = ("student_code", "name", "email")
    list_filter = ("course", "is_active")


@admin.register(Mark)
class MarkAdmin(admin.ModelAdmin):
    list_display = ("student", "course", "assessment", "score", "maximum_score", "updated_at")
    search_fields = ("student__student_code", "student__name", "assessment")
    list_filter = ("course",)
