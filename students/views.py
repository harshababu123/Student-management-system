import json
from functools import wraps
from datetime import date
from decimal import Decimal, InvalidOperation

from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.contrib.auth import authenticate, get_user_model, login, logout
from django.contrib.auth.password_validation import validate_password
from django.db import IntegrityError
from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404
from django.views.decorators.http import require_http_methods

from .models import Course, Mark, Student

User = get_user_model()


def teacher_only(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Please sign in to continue."}, status=401)
        if not request.user.is_staff:
            return JsonResponse({"error": "This action is available to teachers only."}, status=403)
        return view(request, *args, **kwargs)
    return wrapped


def signed_in_only(view):
    @wraps(view)
    def wrapped(request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({"error": "Please sign in to continue."}, status=401)
        return view(request, *args, **kwargs)
    return wrapped


def account_data(user):
    if user.is_staff:
        return {"authenticated": True, "role": "teacher", "name": user.get_full_name() or user.username,
                "username": user.username}
    student = getattr(user, "student_profile", None)
    if student and student.is_active:
        return {"authenticated": True, "role": "student", "name": student.name,
                "student_code": student.student_code}
    return {"authenticated": False, "role": "unknown"}


@require_http_methods(["GET", "POST", "DELETE"])
def auth_session(request):
    if request.method == "GET":
        if not request.user.is_authenticated:
            return JsonResponse({"authenticated": False})
        data = account_data(request.user)
        if not data["authenticated"]:
            logout(request)
            return JsonResponse({"authenticated": False})
        return JsonResponse(data)
    if request.method == "DELETE":
        logout(request)
        return JsonResponse({"authenticated": False})
    try:
        data = payload(request)
    except ValueError as error:
        return JsonResponse({"error": str(error)}, status=400)
    identifier = str(data.get("username", "")).strip()
    password = str(data.get("password", ""))
    user_record = User.objects.filter(Q(username__iexact=identifier) | Q(email__iexact=identifier)).first()
    user = authenticate(request, username=user_record.username, password=password) if user_record else None
    if not user:
        return JsonResponse({"error": "The username or password is incorrect."}, status=400)
    account = account_data(user)
    if not account["authenticated"]:
        return JsonResponse({"error": "This account is not linked to a teacher or student profile."}, status=403)
    login(request, user)
    return JsonResponse(account)


@require_http_methods(["POST"])
def student_account_registration(request):
    try:
        data = payload(request)
        code = str(data.get("student_code", "")).strip()
        email = str(data.get("email", "")).strip()
        password = str(data.get("password", ""))
        student = Student.objects.get(student_code__iexact=code, email__iexact=email, is_active=True)
        if student.user_id:
            return JsonResponse({"error": "An account has already been created for this student."}, status=400)
        validate_password(password, user=User(username=student.email, email=student.email))
        if User.objects.filter(Q(username__iexact=student.email) | Q(email__iexact=student.email)).exists():
            return JsonResponse({"error": "An account already exists for this email. Contact your teacher."}, status=400)
        user = User.objects.create_user(username=student.email, email=student.email, password=password)
        student.user = user
        student.save(update_fields=["user"])
        login(request, user)
        return JsonResponse(account_data(user), status=201)
    except Student.DoesNotExist:
        return JsonResponse({"error": "We couldn’t match that student ID and email. Check with your teacher."}, status=400)
    except ValidationError as error:
        return JsonResponse({"error": " ".join(error.messages)}, status=400)
    except (ValueError, TypeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    except IntegrityError:
        return JsonResponse({"error": "An account could not be created for this email."}, status=400)


@signed_in_only
@require_http_methods(["GET"])
def student_me(request):
    if request.user.is_staff:
        return JsonResponse({"error": "This profile is available to student accounts."}, status=403)
    student = getattr(request.user, "student_profile", None)
    if not student or not student.is_active:
        return JsonResponse({"error": "This account is not linked to a student record."}, status=403)
    return JsonResponse(student_data(student))


def payload(request):
    try:
        data = json.loads(request.body or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError):
        raise ValueError("Request body must contain valid JSON.")
    if not isinstance(data, dict):
        raise ValueError("Request body must be a JSON object.")
    return data


def student_data(student):
    return {
        "id": student.id,
        "student_code": student.student_code,
        "name": student.name,
        "email": student.email,
        "phone": student.phone,
        "gender": student.gender,
        "date_of_birth": student.date_of_birth.isoformat() if student.date_of_birth else "",
        "age": student.age,
        "address": student.address,
        "course_id": student.course_id,
        "course": student.course.name if student.course else "Unassigned",
        "course_code": student.course.code if student.course else "",
        "is_active": student.is_active,
    }


def course_data(course):
    return {"id": course.id, "name": course.name, "code": course.code, "description": course.description,
            "is_active": course.is_active, "student_count": course.students.filter(is_active=True).count()}


def mark_data(mark):
    return {"id": mark.id, "student_id": mark.student_id, "student_code": mark.student.student_code,
            "student_name": mark.student.name, "course_id": mark.course_id, "course": mark.course.name,
            "assessment": mark.assessment, "score": float(mark.score), "maximum_score": float(mark.maximum_score),
            "percentage": mark.percentage, "feedback": mark.feedback}


def student_values(data):
    name = str(data.get("name", "")).strip()
    email = str(data.get("email", "")).strip()
    if not name or not email:
        raise ValueError("Name and email are required.")
    try:
        validate_email(email)
    except ValidationError:
        raise ValueError("Enter a valid email address.")
    dob_value = str(data.get("date_of_birth", "")).strip()
    try:
        dob = date.fromisoformat(dob_value) if dob_value else None
    except ValueError:
        raise ValueError("Enter a valid date of birth.")
    if dob and dob > date.today():
        raise ValueError("Date of birth cannot be in the future.")
    gender = str(data.get("gender", "")).strip()
    choices = {value for value, _ in Student.GENDER_CHOICES}
    if gender and gender not in choices:
        raise ValueError("Choose a valid gender option.")
    course_id = data.get("course_id") or None
    if not course_id:
        raise ValueError("Select a course for this student.")
    try:
        course = Course.objects.get(pk=int(course_id), is_active=True)
    except (TypeError, ValueError, Course.DoesNotExist):
        raise ValueError("Select an active course.")
    phone = str(data.get("phone", "")).strip()
    address = str(data.get("address", "")).strip()
    if len(phone) > 24:
        raise ValueError("Phone number must be 24 characters or fewer.")
    return {"name": name, "email": email, "phone": phone, "gender": gender,
            "date_of_birth": dob, "address": address, "course": course}


def course_values(data):
    name = str(data.get("name", "")).strip()
    code = str(data.get("code", "")).strip().upper()
    if not name or not code:
        raise ValueError("Course name and course code are required.")
    if len(code) > 20:
        raise ValueError("Course code must be 20 characters or fewer.")
    return {"name": name, "code": code, "description": str(data.get("description", "")).strip()}


@teacher_only
@require_http_methods(["GET", "POST"])
def students_collection(request):
    if request.method == "GET":
        query = request.GET.get("q", "").strip()
        students = Student.objects.select_related("course").all()
        students = students.filter(is_active=request.GET.get("archived") != "1")
        if query:
            students = students.filter(Q(student_code__iexact=query) | Q(name__icontains=query) |
                                       Q(email__icontains=query) | Q(course__name__icontains=query))
        course_id = request.GET.get("course")
        if course_id:
            students = students.filter(course_id=course_id)
        return JsonResponse([student_data(s) for s in students], safe=False)
    try:
        data = payload(request)
        values = student_values(data)
        if Student.objects.filter(email__iexact=values["email"]).exists():
            return JsonResponse({"error": "That email address is already in use."}, status=400)
        student = Student.objects.create(**values)
    except (ValueError, TypeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    except Exception as error:
        if "unique" in str(error).lower():
            return JsonResponse({"error": "That email address is already in use."}, status=400)
        raise
    return JsonResponse(student_data(student), status=201)


@teacher_only
@require_http_methods(["GET", "PUT", "DELETE"])
def student_detail(request, student_id):
    student = get_object_or_404(Student.objects.select_related("course"), pk=student_id)
    if request.method == "GET":
        return JsonResponse(student_data(student))
    if request.method == "DELETE":
        student.is_active = False
        student.save(update_fields=["is_active"])
        return JsonResponse({"message": "Student archived. Their marks are retained."})
    try:
        data = payload(request)
        values = student_values(data)
    except (ValueError, TypeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    if Student.objects.filter(email__iexact=values["email"]).exclude(pk=student.pk).exists():
        return JsonResponse({"error": "That email address is already in use."}, status=400)
    if student.user_id and User.objects.filter(Q(email__iexact=values["email"]) | Q(username__iexact=values["email"])).exclude(pk=student.user_id).exists():
        return JsonResponse({"error": "That email address is already linked to another account."}, status=400)
    for field, value in values.items():
        setattr(student, field, value)
    if "is_active" in data:
        student.is_active = bool(data["is_active"])
    student.save()
    if student.user_id and student.user.email.casefold() != student.email.casefold():
        student.user.email = student.email
        student.user.username = student.email
        student.user.save(update_fields=["email", "username"])
    return JsonResponse(student_data(student))


@teacher_only
@require_http_methods(["GET", "POST"])
def courses_collection(request):
    if request.method == "GET":
        courses = Course.objects.all()
        if request.GET.get("all") != "1":
            courses = courses.filter(is_active=True)
        return JsonResponse([course_data(course) for course in courses], safe=False)
    try:
        values = course_values(payload(request))
        if Course.objects.filter(Q(name__iexact=values["name"]) | Q(code__iexact=values["code"])).exists():
            return JsonResponse({"error": "A course with that name or code already exists."}, status=400)
        course = Course.objects.create(**values)
    except (ValueError, TypeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    return JsonResponse(course_data(course), status=201)


@teacher_only
@require_http_methods(["GET", "PUT", "DELETE"])
def course_detail(request, course_id):
    course = get_object_or_404(Course, pk=course_id)
    if request.method == "GET":
        return JsonResponse(course_data(course))
    if request.method == "DELETE":
        course.is_active = False
        course.save(update_fields=["is_active"])
        return JsonResponse({"message": "Course archived. Existing student and marks records are retained."})
    try:
        values = course_values(payload(request))
    except (ValueError, TypeError) as error:
        return JsonResponse({"error": str(error)}, status=400)
    if Course.objects.filter(Q(name__iexact=values["name"]) | Q(code__iexact=values["code"])).exclude(pk=course.pk).exists():
        return JsonResponse({"error": "A course with that name or code already exists."}, status=400)
    for field, value in values.items():
        setattr(course, field, value)
    course.is_active = True
    course.save()
    return JsonResponse(course_data(course))


@signed_in_only
@require_http_methods(["GET", "POST"])
def marks_collection(request):
    if request.method == "GET":
        marks = Mark.objects.select_related("student", "course").all()
        if request.user.is_staff:
            code = request.GET.get("student_code", "").strip()
            if code:
                marks = marks.filter(student__student_code__iexact=code)
        else:
            student = getattr(request.user, "student_profile", None)
            if not student:
                return JsonResponse({"error": "This account is not linked to a student record."}, status=403)
            marks = marks.filter(student=student, student__is_active=True)
        return JsonResponse([mark_data(mark) for mark in marks], safe=False)
    if not request.user.is_staff:
        return JsonResponse({"error": "Only teachers can enter or update marks."}, status=403)
    try:
        data = payload(request)
        student = Student.objects.get(pk=int(data.get("student_id")), is_active=True)
        course = Course.objects.get(pk=int(data.get("course_id")), is_active=True)
        assessment = str(data.get("assessment", "")).strip()
        if not assessment:
            raise ValueError("Assessment name is required.")
        score = Decimal(str(data.get("score")))
        maximum = Decimal(str(data.get("maximum_score", 100)))
        if maximum <= 0 or score < 0 or score > maximum:
            raise ValueError("Score must be between 0 and the maximum score.")
        if student.course_id != course.id:
            raise ValueError("Choose the student's assigned course.")
        mark, created = Mark.objects.update_or_create(
            student=student, course=course, assessment=assessment,
            defaults={"score": score, "maximum_score": maximum, "feedback": str(data.get("feedback", "")).strip()},
        )
    except (ValueError, TypeError, InvalidOperation, Student.DoesNotExist, Course.DoesNotExist) as error:
        return JsonResponse({"error": str(error) or "Choose a valid student and course."}, status=400)
    return JsonResponse(mark_data(mark), status=201 if created else 200)


@signed_in_only
@require_http_methods(["GET", "PUT", "DELETE"])
def mark_detail(request, mark_id):
    mark = get_object_or_404(Mark.objects.select_related("student", "course"), pk=mark_id)
    if request.method == "GET":
        if not request.user.is_staff and (not getattr(request.user, "student_profile", None) or mark.student.user_id != request.user.id or not mark.student.is_active):
            return JsonResponse({"error": "You can only view your own results."}, status=403)
        return JsonResponse(mark_data(mark))
    if not request.user.is_staff:
        return JsonResponse({"error": "Only teachers can change marks."}, status=403)
    if request.method == "DELETE":
        mark.delete()
        return JsonResponse({"message": "Mark removed."})
    data = payload(request)
    try:
        score = Decimal(str(data.get("score")))
        maximum = Decimal(str(data.get("maximum_score", mark.maximum_score)))
        if maximum <= 0 or score < 0 or score > maximum:
            raise ValueError("Score must be between 0 and the maximum score.")
    except (ValueError, TypeError, InvalidOperation) as error:
        return JsonResponse({"error": str(error)}, status=400)
    mark.assessment = str(data.get("assessment", mark.assessment)).strip() or mark.assessment
    mark.score = score
    mark.maximum_score = maximum
    mark.feedback = str(data.get("feedback", mark.feedback)).strip()
    mark.save()
    return JsonResponse(mark_data(mark))
