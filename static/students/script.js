const API = "/api/";
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { archived: false, students: [], courses: [], marks: [], studentQuery: "", courseFilter: "" };
let searchTimer;
let currentUser = null;

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]);
}

function initials(name = "") {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase() || "S";
}

async function api(path, options = {}) {
  const method = (options.method || "GET").toUpperCase();
  const csrf = document.cookie.split(";").map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith("csrftoken="))?.split("=").slice(1).join("=");
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(["GET", "HEAD", "OPTIONS"].includes(method) || !csrf ? {} : { "X-CSRFToken": decodeURIComponent(csrf) }), ...options.headers },
  });
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { data = { error: "The server returned an unexpected response." }; }
  if (!response.ok) throw new Error(data.error || `Request failed (${response.status}).`);
  return data;
}

function jsonBody(value) { return JSON.stringify(value); }
function showMessage(id, text, success = false) {
  const node = $(`#${id}`);
  node.textContent = text;
  node.classList.toggle("success", success);
}

function switchView(view) {
  $$(".nav-link").forEach((button) => button.classList.toggle("active", button.dataset.view === view));
  $$(".view-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `view-${view}`));
  const labels = { students: ["Students", "PEOPLE & RECORDS", "Student directory", "Manage student profiles, enrollment and contact details."],
    courses: ["Courses", "LEARNING PROGRAMS", "Course catalog", "Create courses and keep enrollment organized."],
    marks: ["Marks & results", "ACADEMIC PROGRESS", "Marks & results", "Record assessment results and give students a clear view of progress."] }[view];
  $("#breadcrumb-current").textContent = labels[0];
  $("#page-eyebrow").textContent = labels[1];
  $("#page-title").textContent = labels[2];
  $("#page-subtitle").textContent = labels[3];
  $("#add-student-button").classList.toggle("hidden", view !== "students");
  document.body.classList.remove("nav-open");
  if (view === "students") loadStudents();
  if (view === "courses") loadCourses();
  if (view === "marks" && currentUser?.role === "student") loadStudentPortal();
  else if (view === "marks") loadMarks();
}

function enterWorkspace(user) {
  currentUser = user;
  document.body.classList.add("logged-in");
  document.body.classList.toggle("student-mode", user.role === "student");
  const name = user.name || user.username;
  const initialsText = initials(name).slice(0, 2);
  $("#profile-name").textContent = name;
  $("#profile-role").textContent = user.role === "teacher" ? "Teacher account" : "Student account";
  $("#profile-avatar").textContent = initialsText;
  $("#top-avatar").textContent = initialsText;
  $("#role-badge").innerHTML = `<i></i> ${user.role === "teacher" ? "TEACHER ACCOUNT" : "STUDENT ACCOUNT"}`;
  const student = user.role === "student";
  $(".nav-link[data-view='students']").classList.toggle("hidden", student);
  $(".nav-link[data-view='courses']").classList.toggle("hidden", student);
  $(".nav-link[data-view='marks']").innerHTML = `<span class="nav-icon">▥</span>${student ? "My results" : "Marks & results"}`;
  $("#teacher-marks-workspace").classList.toggle("hidden", student);
  $("#student-portal").classList.toggle("hidden", !student);
  $("#view-marks .role-pill").classList.toggle("hidden", student);
  if (student) {
    $("#view-marks .section-heading h2").textContent = "My results";
    $("#view-marks .section-heading p").textContent = "Your personal profile and assessment results.";
    switchView("marks");
    $("#breadcrumb-current").textContent = "My results";
    $("#page-eyebrow").textContent = "STUDENT PORTAL";
    $("#page-title").textContent = "My learning";
    $("#page-subtitle").textContent = "Your course enrollment and academic progress.";
    loadStudentPortal();
  } else {
    $("#view-marks .section-heading h2").textContent = "Marks & results";
    $("#view-marks .section-heading p").textContent = "Record assessment scores and review student progress.";
    switchView("students");
    Promise.all([loadStudents(), loadCourses(), loadMarks()]);
  }
}

function showAuth(register = false) {
  $("#login-form").classList.toggle("hidden", register);
  $("#register-form").classList.toggle("hidden", !register);
  $("#register-prompt").classList.toggle("hidden", register);
  $("#login-prompt").classList.toggle("hidden", !register);
  $("#auth-eyebrow").textContent = register ? "STUDENT ACCESS" : "WELCOME BACK";
  $("#auth-title").textContent = register ? "Create your student account" : "Sign in to your workspace";
  $("#auth-subtitle").textContent = register ? "Use the student ID and email from your registration." : "Use your teacher or student account to continue.";
}

async function loadStudentPortal() {
  try {
    const [student, marks] = await Promise.all([api("student/me/"), api("marks/")]);
    $("#portal-name").textContent = student.name;
    $("#portal-course").textContent = `${student.course} · ${student.age ? `Age ${student.age}` : "Student profile"}`;
    $("#portal-code").textContent = student.student_code;
    $("#portal-avatar").textContent = initials(student.name);
    $("#portal-email").textContent = student.email;
    $("#portal-phone").textContent = student.phone || "Not provided";
    $("#portal-dob").textContent = student.date_of_birth || "Not provided";
    $("#portal-address").textContent = student.address || "Not provided";
    $("#my-mark-count").textContent = marks.length;
    $("#stat-marks").textContent = marks.length;
    $("#my-marks").innerHTML = marks.length ? marks.map((mark) => `<tr><td><span class="student-name">${escapeHtml(mark.assessment)}</span></td><td>${escapeHtml(mark.course)}</td><td><span class="score-chip">${mark.score} / ${mark.maximum_score} · ${mark.percentage}%</span></td><td>${escapeHtml(mark.feedback || "—")}</td></tr>`).join("") : '<tr><td colspan="4" class="empty">No marks have been added yet.</td></tr>';
  } catch (error) {
    $("#my-marks").innerHTML = `<tr><td colspan="4" class="empty">${escapeHtml(error.message)}</td></tr>`;
  }
}

async function boot() {
  try {
    const session = await api("auth/session/");
    if (session.authenticated) enterWorkspace(session);
    else document.body.classList.remove("logged-in");
  } catch { document.body.classList.remove("logged-in"); }
}

$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const user = await api("auth/session/", { method: "POST", body: jsonBody({ username: $("#login-identifier").value.trim(), password: $("#login-password").value }) });
    showMessage("login-message", "");
    enterWorkspace(user);
  } catch (error) { showMessage("login-message", error.message); }
  finally { button.disabled = false; }
});

$("#register-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const user = await api("auth/student-register/", { method: "POST", body: jsonBody({ student_code: $("#register-code").value.trim(), email: $("#register-email").value.trim(), password: $("#register-password").value }) });
    showMessage("register-message", "");
    enterWorkspace(user);
  } catch (error) { showMessage("register-message", error.message); }
  finally { button.disabled = false; }
});

async function signOut() {
  try { await api("auth/session/", { method: "DELETE" }); }
  finally { currentUser = null; document.body.classList.remove("logged-in", "student-mode", "nav-open"); $("#login-password").value = ""; }
}

$("#show-register").addEventListener("click", () => showAuth(true));
$("#show-login").addEventListener("click", () => showAuth(false));
$("#signout-button").addEventListener("click", signOut);
$("#mobile-signout").addEventListener("click", signOut);

function renderCourseOptions() {
  const active = state.courses.filter((course) => course.is_active);
  const filter = $("#course-filter");
  const previousFilter = filter.value;
  filter.innerHTML = `<option value="">All courses</option>${active.map((course) => `<option value="${course.id}">${escapeHtml(course.name)}</option>`).join("")}`;
  filter.value = active.some((course) => String(course.id) === previousFilter) ? previousFilter : "";

  const studentCourse = $("#student-course");
  const selectedCourse = studentCourse.value;
  studentCourse.innerHTML = `<option value="">Select a course</option>${active.map((course) => `<option value="${course.id}">${escapeHtml(course.code)} · ${escapeHtml(course.name)}</option>`).join("")}`;
  if (active.some((course) => String(course.id) === selectedCourse)) studentCourse.value = selectedCourse;

  const studentSelect = $("#mark-student");
  const selectedStudent = studentSelect.value;
  studentSelect.innerHTML = `<option value="">Choose a student</option>${state.students.filter((student) => student.is_active).map((student) => `<option value="${student.id}" data-course="${student.course_id}">${escapeHtml(student.student_code)} · ${escapeHtml(student.name)}</option>`).join("")}`;
  if (state.students.some((student) => String(student.id) === selectedStudent)) studentSelect.value = selectedStudent;
}

async function loadCourses() {
  try {
    state.courses = await api("courses/?all=1");
    renderCourses();
    renderCourseOptions();
    $("#stat-courses").textContent = state.courses.filter((course) => course.is_active).length;
  } catch (error) { $("#course-list").innerHTML = `<div class="empty-card">${escapeHtml(error.message)}</div>`; }
}

function renderCourses() {
  const list = $("#course-list");
  if (!state.courses.length) {
    list.innerHTML = '<div class="empty-card">No courses yet. Add a course to start enrolling students.</div>';
    return;
  }
  list.innerHTML = state.courses.map((course) => `
    <article class="course-card">
      <div class="course-card-top"><span class="course-mark">${escapeHtml(course.code.slice(0, 4))}</span><span class="status-pill ${course.is_active ? "" : "archived"}">${course.is_active ? "Active" : "Archived"}</span></div>
      <h3>${escapeHtml(course.name)}</h3><p>${escapeHtml(course.description || "A course in your academic catalog.")}</p>
      <div class="course-card-meta"><span>${course.student_count} enrolled</span><span>${escapeHtml(course.code)}</span></div>
      <div class="row-actions"><button class="tiny-button" data-course-action="edit" data-id="${course.id}" type="button">${course.is_active ? "Edit course" : "Restore"}</button>${course.is_active ? `<button class="tiny-button danger" data-course-action="archive" data-id="${course.id}" type="button">Archive</button>` : ""}</div>
    </article>`).join("");
}

async function loadStudents() {
  const list = $("#student-list");
  list.innerHTML = '<tr><td colspan="6" class="empty">Loading student records…</td></tr>';
  try {
    const query = new URLSearchParams();
    if (state.studentQuery) query.set("q", state.studentQuery);
    if (state.courseFilter) query.set("course", state.courseFilter);
    if (state.archived) query.set("archived", "1");
    state.students = await api(`students/?${query}`);
    renderCourseOptions();
    renderStudents();
    const total = state.students.filter((student) => student.is_active).length;
    $("#stat-students").textContent = total;
    $("#nav-student-count").textContent = total;
    $("#student-count").textContent = state.students.length;
  } catch (error) { list.innerHTML = `<tr><td class="empty" colspan="6">${escapeHtml(error.message)}</td></tr>`; }
}

function renderStudents() {
  const list = $("#student-list");
  const count = state.students.length;
  $("#student-summary").textContent = `Showing ${count} ${state.archived ? "archived " : ""}student${count === 1 ? "" : "s"}`;
  if (!count) {
    list.innerHTML = `<tr><td class="empty" colspan="6">${state.studentQuery || state.courseFilter ? "No students match these filters." : state.archived ? "No archived students." : "No students yet. Add your first student to begin."}</td></tr>`;
    return;
  }
  list.innerHTML = state.students.map((student) => `
    <tr>
      <td><div class="student-cell"><span class="avatar">${escapeHtml(initials(student.name))}</span><span><span class="student-name">${escapeHtml(student.name)}</span><span class="student-email">${escapeHtml(student.email)}</span></span></div></td>
      <td><span class="id-tag">${escapeHtml(student.student_code)}</span></td>
      <td><span class="course-name">${escapeHtml(student.course)}</span><span class="course-code-tag">${escapeHtml(student.course_code)}</span></td>
      <td>${escapeHtml(student.phone || "—")}<span class="student-sub">${student.age ? `Age ${student.age}` : "Contact details"}</span></td>
      <td><span class="status-pill ${student.is_active ? "" : "archived"}">${student.is_active ? "Active" : "Archived"}</span></td>
      <td><div class="row-actions"><button class="tiny-button" data-student-action="edit" data-id="${student.id}" type="button">${student.is_active ? "Edit" : "Restore"}</button>${student.is_active ? `<button class="tiny-button danger" data-student-action="archive" data-id="${student.id}" type="button">Archive</button>` : ""}</div></td>
    </tr>`).join("");
}

function resetStudentForm() {
  $("#student-form").reset();
  $("#student-id").value = "";
  $("#student-form-title").textContent = "Register a student";
  $("#student-form-kicker").textContent = "NEW RECORD";
  $("#save-student").textContent = "Save student";
  showMessage("student-message", "");
}

function openStudentDialog(student = null) {
  resetStudentForm();
  if (student) {
    $("#student-id").value = student.id;
    $("#name").value = student.name;
    $("#email").value = student.email;
    $("#phone").value = student.phone;
    $("#gender").value = student.gender;
    $("#date-of-birth").value = student.date_of_birth;
    $("#address").value = student.address;
    $("#student-course").value = student.course_id;
    $("#student-form-title").textContent = student.is_active ? "Update student details" : "Restore student record";
    $("#student-form-kicker").textContent = `STUDENT ID · ${student.student_code}`;
    $("#save-student").textContent = student.is_active ? "Save changes" : "Restore student";
  }
  $("#student-dialog").showModal();
}

$("#student-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const id = $("#student-id").value;
  const student = state.students.find((item) => String(item.id) === id);
  const values = {
    name: $("#name").value.trim(), email: $("#email").value.trim(), phone: $("#phone").value.trim(),
    gender: $("#gender").value, date_of_birth: $("#date-of-birth").value,
    address: $("#address").value.trim(), course_id: $("#student-course").value,
    ...(student ? { is_active: true } : {}),
  };
  const button = $("#save-student");
  button.disabled = true;
  try {
    const result = await api(id ? `students/${id}/` : "students/", { method: id ? "PUT" : "POST", body: jsonBody(values) });
    $("#student-dialog").close();
    resetStudentForm();
    await Promise.all([loadStudents(), loadCourses()]);
    if (!id) window.alert(`Student registered. Their new student ID is ${result.student_code}.`);
  } catch (error) { showMessage("student-message", error.message); }
  finally { button.disabled = false; }
});

function openCourseDialog(course = null) {
  $("#course-form").reset();
  $("#course-id").value = "";
  $("#course-form-title").textContent = "Add a course";
  showMessage("course-message", "");
  if (course) {
    $("#course-id").value = course.id;
    $("#course-name").value = course.name;
    $("#course-code").value = course.code;
    $("#course-description").value = course.description;
    $("#course-form-title").textContent = course.is_active ? "Update course" : "Restore course";
  }
  $("#course-dialog").showModal();
}

$("#course-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const id = $("#course-id").value;
  const values = { name: $("#course-name").value.trim(), code: $("#course-code").value.trim(), description: $("#course-description").value.trim() };
  try {
    await api(id ? `courses/${id}/` : "courses/", { method: id ? "PUT" : "POST", body: jsonBody(values) });
    $("#course-dialog").close();
    await Promise.all([loadCourses(), loadStudents()]);
  } catch (error) { showMessage("course-message", error.message); }
});

async function loadMarks() {
  try {
    state.marks = await api("marks/");
    renderMarks();
    $("#stat-marks").textContent = state.marks.length;
    renderCourseOptions();
  } catch (error) { $("#marks-list").innerHTML = `<tr><td class="empty" colspan="4">${escapeHtml(error.message)}</td></tr>`; }
}

function renderMarks() {
  const list = $("#marks-list");
  if (!state.marks.length) {
    list.innerHTML = '<tr><td class="empty" colspan="4">No assessments have been recorded yet.</td></tr>';
    return;
  }
  list.innerHTML = state.marks.map((mark) => `
    <tr><td><span class="student-name">${escapeHtml(mark.student_name)}</span><span class="student-sub">${escapeHtml(mark.student_code)}</span></td>
      <td><span class="student-name">${escapeHtml(mark.assessment)}</span><span class="student-sub">${escapeHtml(mark.course)}</span></td>
      <td><span class="score-chip">${mark.score} / ${mark.maximum_score}</span><div class="percentage-bar"><i style="width:${Math.min(mark.percentage, 100)}%"></i></div></td>
      <td><div class="row-actions"><button class="tiny-button" data-mark-action="edit" data-id="${mark.id}" type="button">Edit</button><button class="tiny-button danger" data-mark-action="delete" data-id="${mark.id}" type="button">Delete</button></div></td></tr>`).join("");
}

$("#mark-student").addEventListener("change", (event) => {
  const courseId = event.target.selectedOptions[0]?.dataset.course;
  if (courseId) {
    const student = state.students.find((item) => String(item.id) === event.target.value);
    if (student) $("#assessment").placeholder = `${student.course} assessment`;
  }
});

function resetMarkForm() {
  $("#mark-form").reset();
  $("#mark-id").value = "";
  $("#maximum-score").value = "100";
  $("#save-mark").textContent = "Save assessment";
  $("#cancel-mark").classList.add("hidden");
  showMessage("mark-message", "");
}

$("#mark-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!event.currentTarget.reportValidity()) return;
  const id = $("#mark-id").value;
  const selected = $("#mark-student").selectedOptions[0];
  const values = { student_id: $("#mark-student").value, course_id: selected?.dataset.course,
    assessment: $("#assessment").value.trim(), score: $("#score").value,
    maximum_score: $("#maximum-score").value, feedback: $("#feedback").value.trim() };
  try {
    await api(id ? `marks/${id}/` : "marks/", { method: id ? "PUT" : "POST", body: jsonBody(values) });
    resetMarkForm();
    await loadMarks();
  } catch (error) { showMessage("mark-message", error.message); }
});

document.addEventListener("click", async (event) => {
  const closer = event.target.closest("[data-close]");
  if (closer) { $(`#${closer.dataset.close}`).close(); return; }
  const studentAction = event.target.closest("[data-student-action]");
  const courseAction = event.target.closest("[data-course-action]");
  const markAction = event.target.closest("[data-mark-action]");
  try {
    if (studentAction) {
      const student = state.students.find((item) => String(item.id) === studentAction.dataset.id);
      if (!student) return;
      if (studentAction.dataset.studentAction === "edit") openStudentDialog(student);
      else if (window.confirm(`Archive ${student.name}? Their record and marks will be retained.`)) {
        await api(`students/${student.id}/`, { method: "DELETE" });
        await loadStudents();
      }
    } else if (courseAction) {
      const course = state.courses.find((item) => String(item.id) === courseAction.dataset.id);
      if (!course) return;
      if (courseAction.dataset.courseAction === "edit") openCourseDialog(course);
      else if (window.confirm(`Archive ${course.name}? Existing records will be retained.`)) {
        await api(`courses/${course.id}/`, { method: "DELETE" });
        await Promise.all([loadCourses(), loadStudents()]);
      }
    } else if (markAction) {
      const id = markAction.dataset.id;
      if (markAction.dataset.markAction === "delete") {
        if (window.confirm("Delete this assessment result?")) { await api(`marks/${id}/`, { method: "DELETE" }); await loadMarks(); }
      } else {
        const mark = await api(`marks/${id}/`);
        $("#mark-id").value = mark.id;
        $("#mark-student").value = mark.student_id;
        $("#assessment").value = mark.assessment;
        $("#score").value = mark.score;
        $("#maximum-score").value = mark.maximum_score;
        $("#feedback").value = mark.feedback;
        $("#save-mark").textContent = "Save changes";
        $("#cancel-mark").classList.remove("hidden");
        $("#assessment").focus();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  } catch (error) { window.alert(error.message); }
});

$("#add-student-button").addEventListener("click", () => openStudentDialog());
$("#add-course-button").addEventListener("click", () => openCourseDialog());
$("#cancel-mark").addEventListener("click", resetMarkForm);
$("#archive-toggle").addEventListener("click", (event) => {
  state.archived = !state.archived;
  event.currentTarget.textContent = state.archived ? "View active students" : "View archived";
  loadStudents();
});
$("#refresh-students").addEventListener("click", loadStudents);
$("#student-search").addEventListener("input", (event) => {
  clearTimeout(searchTimer);
  state.studentQuery = event.target.value.trim();
  searchTimer = setTimeout(loadStudents, 200);
});
$("#course-filter").addEventListener("change", (event) => { state.courseFilter = event.target.value; loadStudents(); });
$$(".nav-link").forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));
$("#mobile-menu").addEventListener("click", () => document.body.classList.toggle("nav-open"));
document.addEventListener("click", (event) => {
  if (event.target.matches(".modal")) event.target.close();
  if (document.body.classList.contains("nav-open") && !event.target.closest(".sidebar") && !event.target.closest("#mobile-menu")) document.body.classList.remove("nav-open");
});

const localToday = new Date();
$("#date-of-birth").max = new Date(localToday.getTime() - localToday.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
boot();
