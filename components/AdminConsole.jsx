"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { OPERATOR_PRODUCT_NAME } from "../lib/operator.js";

export default function AdminConsole({ school, teachers: initialTeachers }) {
  const router = useRouter();
  const [teachers, setTeachers] = useState(initialTeachers);
  const [joinCode, setJoinCode] = useState(school.join_code || "");
  const [schoolForm, setSchoolForm] = useState({
    name: school.name,
    allowLateSubmissions: Boolean(school.allow_late_submissions),
  });
  const [teacherForm, setTeacherForm] = useState({ name: "", email: "", password: "" });
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);

  function setStatus(text, tone = "info") {
    setMessage({ text, tone });
  }

  async function rotateJoinCode() {
    setLoading(true);
    setStatus("");
    const response = await fetch("/api/admin/school/join-code", { method: "POST" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(payload.error || "Could not regenerate code.", "error");
      return;
    }
    setJoinCode(payload.school.join_code);
    setStatus("New school code generated. Share it with teachers who need to join.", "success");
    router.refresh();
  }

  async function saveSchool(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    const response = await fetch("/api/admin/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(schoolForm),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not save settings.", "error");
      return;
    }

    setStatus("School settings saved.", "success");
    router.refresh();
  }

  async function addTeacher(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    const response = await fetch("/api/admin/teachers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teacherForm),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not create teacher.", "error");
      return;
    }

    setTeachers((current) => [...current, payload.teacher]);
    setTeacherForm({ name: "", email: "", password: "" });
    setStatus(`Created teacher ${payload.teacher.username}.`, "success");
    router.refresh();
  }

  async function removeTeacher(teacher) {
    if (teacher.role === "admin") {
      return;
    }

    const confirmed = window.confirm(`Remove teacher ${teacher.name}? Their classes and students will be deleted.`);
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/admin/teachers/${teacher.id}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not delete teacher.", "error");
      return;
    }

    setTeachers((current) => current.filter((item) => item.id !== teacher.id));
    setStatus(`Removed ${teacher.username}.`, "success");
    router.refresh();
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow">School settings</p>
        <h2>{schoolForm.name}</h2>
        <p className="muted">
          Manage your {OPERATOR_PRODUCT_NAME} subscription from the billing page.
        </p>

        <div className="school-code-panel">
          <p className="eyebrow">Teacher onboarding</p>
          <h3>School code</h3>
          <p className="muted">
            Teachers choose <strong>Register → Join school</strong> and enter this code. Everyone signing in needs it if
            the same email exists at another school.
          </p>
          <div className="row">
            <code className="join-code-display">{joinCode || "—"}</code>
            {school.slug ? <span className="tag">Slug: {school.slug}</span> : null}
            <button className="button secondary" disabled={loading} onClick={rotateJoinCode} type="button">
              Generate new code
            </button>
          </div>
        </div>

        <p className="muted">
          <a className="button secondary" href="/admin/billing">
            Subscription & billing
          </a>
        </p>

        <form className="form-grid" onSubmit={saveSchool}>
          <label>
            School name
            <input
              value={schoolForm.name}
              onChange={(event) => setSchoolForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label className="checkbox-row">
            <input
              checked={schoolForm.allowLateSubmissions}
              onChange={(event) =>
                setSchoolForm((current) => ({ ...current, allowLateSubmissions: event.target.checked }))
              }
              type="checkbox"
            />
            Allow late submissions after due date
          </label>
          <button className="button primary" disabled={loading} type="submit">
            {loading ? "Saving..." : "Save settings"}
          </button>
        </form>
      </section>

      <section className="panel" id="staff">
        <p className="eyebrow">Staff</p>
        <h2>Teachers</h2>

        <form className="form-grid" onSubmit={addTeacher}>
          <label>
            Full name
            <input
              value={teacherForm.name}
              onChange={(event) => setTeacherForm((current) => ({ ...current, name: event.target.value }))}
              required
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={teacherForm.email}
              onChange={(event) => setTeacherForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </label>
          <label>
            Initial password
            <input
              minLength={8}
              onChange={(event) => setTeacherForm((current) => ({ ...current, password: event.target.value }))}
              required
              type="password"
              value={teacherForm.password}
            />
          </label>
          <button className="button secondary" disabled={loading} type="submit">
            {loading ? "Creating..." : "Add teacher"}
          </button>
        </form>

        {message.text ? (
          <div className={`message ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : ""}`}>
            {message.text}
          </div>
        ) : null}

        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Role</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => (
                <tr key={teacher.id}>
                  <td data-label="Name">
                    <strong>{teacher.name}</strong>
                    <br />
                    <span className="muted">{teacher.email}</span>
                  </td>
                  <td data-label="Username">{teacher.username}</td>
                  <td data-label="Role">{teacher.role}</td>
                  <td data-label="Actions">
                    {teacher.role === "teacher" ? (
                      <button
                        className="button secondary danger-button"
                        disabled={loading}
                        onClick={() => removeTeacher(teacher)}
                        type="button"
                      >
                        Remove
                      </button>
                    ) : (
                      <span className="muted">Primary admin</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
