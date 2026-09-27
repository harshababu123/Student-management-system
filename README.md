# StudentDesk

A Django and Vanilla JavaScript academic records app with separate teacher and student access.

## Run locally

```powershell
.\.venv\Scripts\Activate.ps1
python manage.py migrate
python manage.py runserver
```

Open `http://127.0.0.1:8000/`.

## Set up accounts

Create the first teacher account from a terminal:

```powershell
python manage.py createsuperuser
```

Sign in with that account. Django superusers have teacher access. To create additional teacher accounts, use `/admin/` and give each teacher account staff status.

Teachers create courses, register students, and enter or update marks. A student receives a generated ID such as `STU-00001`. They use that ID and their registered email on the sign-in page to create their own password-protected account. Students can then view only their own profile and marks.

## Access rules

- Teachers (Django staff accounts) can manage students and courses, and create, update, or delete marks.
- Students can view their linked profile and their own marks. They cannot access the student directory, course management, or another student's marks.
- API mutations use Django session authentication and CSRF tokens.

## Main API routes

- `POST /api/auth/session/` — sign in; `DELETE` signs out; `GET` checks the current session.
- `POST /api/auth/student-register/` — create a student account using the registered student ID and email.
- `/api/students/` — teacher-only student CRUD; deletion archives the record.
- `/api/courses/` — teacher-only course CRUD; deletion archives the course.
- `/api/marks/` — teachers manage marks; signed-in students can read their own marks.
- `GET /api/student/me/` — the signed-in student's own profile.
