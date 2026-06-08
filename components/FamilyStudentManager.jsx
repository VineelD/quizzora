"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_YEAR_LEVEL, YEAR_LEVELS } from "../lib/year-levels.js";

const emptyForm = (yearLevel = DEFAULT_YEAR_LEVEL) => ({
  name: "",
  username: "",
  email: "",
  password: "",
  yearLevel,
  learningNeeds: "",
});

export default function FamilyStudentManager({ students: initialStudents }) {
  const router = useRouter();
  const [students, setStudents] = useState(initialStudents);
  const [createForm, setCreateForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);

  function setStatus(text, tone = "info") {
    setMessage({ text, tone });
  }

  function startEdit(student) {
    setEditingId(student.id);
    setEditForm({
      name: student.name,
      username: student.username,
      email: student.email,
      password: "",
      yearLevel: student.year_level || DEFAULT_YEAR_LEVEL,
      learningNeeds: student.learning_needs || "",
    });
    setStatus("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditForm(emptyForm());
    setStatus("");
  }

  async function createStudent(event) {
    event.preventDefault();
    setLoading(true);
    setStatus("");

    const response = await fetch("/api/family/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(createForm),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not create student.", "error");
      return;
    }

    setStudents((current) => [...current, payload.student]);
    setCreateForm(emptyForm(createForm.yearLevel));
    setStatus(`Created student ${payload.student.username}.`, "success");
    router.refresh();
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/family/students/${editingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editForm),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not update student.", "error");
      return;
    }

    setStudents((current) => current.map((item) => (item.id === editingId ? payload.student : item)));
    cancelEdit();
    setStatus("Student updated.", "success");
    router.refresh();
  }

  async function removeStudent(student) {
    if (!window.confirm(`Remove ${student.name}? Their submissions and progress will be deleted.`)) {
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/family/students/${student.id}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not delete student.", "error");
      return;
    }

    setStudents((current) => current.filter((item) => item.id !== student.id));
    setStatus(`Removed ${student.username}.`, "success");
    router.refresh();
  }

  return (
    <>
      <section className="panel">
        <p className="eyebrow">Children</p>
        <h2>Add a student account</h2>
        <form className="grid" onSubmit={createStudent}>
          <div className="field">
            <label htmlFor="family-student-name">Name</label>
            <input
              id="family-student-name"
              onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
              required
              type="text"
              value={createForm.name}
            />
          </div>
          <div className="field">
            <label htmlFor="family-student-username">Username</label>
            <input
              id="family-student-username"
              onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
              required
              type="text"
              value={createForm.username}
            />
          </div>
          <div className="field">
            <label htmlFor="family-student-email">Email</label>
            <input
              id="family-student-email"
              onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
              required
              type="email"
              value={createForm.email}
            />
          </div>
          <div className="field">
            <label htmlFor="family-student-password">Password</label>
            <input
              id="family-student-password"
              minLength={8}
              onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
              required
              type="password"
              value={createForm.password}
            />
          </div>
          <div className="field">
            <label htmlFor="family-student-year">Year level</label>
            <select
              id="family-student-year"
              onChange={(event) => setCreateForm((current) => ({ ...current, yearLevel: event.target.value }))}
              value={createForm.yearLevel}
            >
              {YEAR_LEVELS.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          <div className="field form-span-all">
            <label htmlFor="family-student-needs">Learning notes (optional)</label>
            <textarea
              id="family-student-needs"
              onChange={(event) => setCreateForm((current) => ({ ...current, learningNeeds: event.target.value }))}
              rows={3}
              value={createForm.learningNeeds}
            />
          </div>
          <button className="button primary form-span-all" disabled={loading} type="submit">
            {loading ? "Saving..." : "Create student"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Student accounts</h2>
        {message.text ? <div className={`message ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : ""}`}>{message.text}</div> : null}

        {editingId ? (
          <form className="grid family-edit-panel" onSubmit={saveStudent}>
            <div className="field">
              <label htmlFor="edit-family-student-name">Name</label>
              <input
                id="edit-family-student-name"
                onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                required
                type="text"
                value={editForm.name}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-family-student-username">Username</label>
              <input
                id="edit-family-student-username"
                onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))}
                required
                type="text"
                value={editForm.username}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-family-student-email">Email</label>
              <input
                id="edit-family-student-email"
                onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                required
                type="email"
                value={editForm.email}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-family-student-password">New password</label>
              <input
                id="edit-family-student-password"
                minLength={8}
                onChange={(event) => setEditForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="Leave blank to keep current"
                type="password"
                value={editForm.password}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-family-student-year">Year level</label>
              <select
                id="edit-family-student-year"
                onChange={(event) => setEditForm((current) => ({ ...current, yearLevel: event.target.value }))}
                value={editForm.yearLevel}
              >
                {YEAR_LEVELS.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
            <div className="field form-span-all">
              <label htmlFor="edit-family-student-needs">Learning notes</label>
              <textarea
                id="edit-family-student-needs"
                onChange={(event) => setEditForm((current) => ({ ...current, learningNeeds: event.target.value }))}
                rows={3}
                value={editForm.learningNeeds}
              />
            </div>
            <div className="row form-span-all">
              <button className="button primary" disabled={loading} type="submit">
                Save changes
              </button>
              <button className="button secondary" disabled={loading} onClick={cancelEdit} type="button">
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>Name</th>
                <th>Username</th>
                <th>Email</th>
                <th>Year</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {students.map((student) => (
                <tr key={student.id}>
                  <td>{student.name}</td>
                  <td>{student.username}</td>
                  <td>{student.email}</td>
                  <td>{student.year_level || "—"}</td>
                  <td>
                    <div className="row">
                      <button className="button secondary" disabled={loading} onClick={() => startEdit(student)} type="button">
                        Edit
                      </button>
                      <button className="button danger-button" disabled={loading} onClick={() => removeStudent(student)} type="button">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!students.length ? <p className="muted">No student accounts yet. Create one above so your child can sign in.</p> : null}
      </section>
    </>
  );
}
