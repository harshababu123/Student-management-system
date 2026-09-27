from django.urls import path

from . import views

urlpatterns = [
    path("auth/session/", views.auth_session, name="auth_session"),
    path("auth/student-register/", views.student_account_registration, name="student_account_registration"),
    path("student/me/", views.student_me, name="student_me"),
    path("students/", views.students_collection, name="students_collection"),
    path("students/<int:student_id>/", views.student_detail, name="student_detail"),
    path("courses/", views.courses_collection, name="courses_collection"),
    path("courses/<int:course_id>/", views.course_detail, name="course_detail"),
    path("marks/", views.marks_collection, name="marks_collection"),
    path("marks/<int:mark_id>/", views.mark_detail, name="mark_detail"),
]
