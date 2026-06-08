"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { DEFAULT_YEAR_LEVEL } from "../lib/year-levels.js";

const emptyForm = (yearLevel = DEFAULT_YEAR_LEVEL) => ({
  name: "",
  username: "",
  email: "",
  password: "",
  yearLevel,
  guardianEmail: "",
  learningNeeds: "",
});

export default function StudentManager({ yearLevels, students }) {
  const router = useRouter();
  const [createForm, setCreateForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(emptyForm());
  const [csvText, setCsvText] = useState("");
  const [sendInvite, setSendInvite] = useState(true);
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);

  function setStatus(text, tone = "info") {
    setMessage({ text, tone });
  }

  function updateCreateField(field, value) {
    setCreateForm((current) => ({ ...current, [field]: value }));
  }

  function updateEditField(field, value) {
    setEditForm((current) => ({ ...current, [field]: value }));
  }

  function startEdit(student) {
    setEditingId(student.id);
    setEditForm({
      name: student.name,
      username: student.username,
      email: student.email,
      password: "",
      yearLevel: student.year_level || DEFAULT_YEAR_LEVEL,
      guardianEmail: student.guardian_email || "",
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

    const response = await fetch("/api/teacher/students", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...createForm, sendInvite }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not create student.", "error");
      return;
    }

    setStatus(`Created student ${payload.student.username}.`, "success");
    setCreateForm(emptyForm(createForm.yearLevel));
    router.refresh();
  }

  async function saveStudent(event) {
    event.preventDefault();
    if (!editingId) {
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/teacher/students/${editingId}`, {
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

    setStatus(`Updated ${payload.student.username}.`, "success");
    cancelEdit();
    router.refresh();
  }

  async function importCsv(event) {
    event.preventDefault();
    if (!csvText.trim()) {
      setStatus("Paste CSV content first.", "error");
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch("/api/teacher/students/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ csv: csvText }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Import failed.", "error");
      return;
    }

    const errorNote = payload.errors?.length ? ` ${payload.errors.length} row(s) failed.` : "";
    setStatus(`Imported ${payload.created} student(s).${errorNote}`, payload.errors?.length ? "error" : "success");
    setCsvText("");
    router.refresh();
  }

  async function sendGuardianLink(student) {
    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/teacher/students/${student.id}/guardian-link`, { method: "POST" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not email guardian.", "error");
      return;
    }

    setStatus(`Guardian link sent to ${payload.email}.`, "success");
  }

  function downloadTemplate() {
    const template =
      "name,username,email,password,year_level,guardian_email,learning_needs\nAlex Student,alex.student,alex@school.edu.au,ChangeMe123!,Year 7,parent@example.com,\n";
    const blob = new Blob([template], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "students-template.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function removeStudent(student) {
    const confirmed = window.confirm(
      `Delete ${student.name} (${student.username})? This removes their account, profile, and quiz submissions.`,
    );
    if (!confirmed) {
      return;
    }

    setLoading(true);
    setStatus("");

    const response = await fetch(`/api/teacher/students/${student.id}`, { method: "DELETE" });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setStatus(payload.error || "Could not delete student.", "error");
      return;
    }

    if (editingId === student.id) {
      cancelEdit();
    }
    setStatus(`Deleted ${student.username}.`, "success");
    router.refresh();
  }

  return (
    <section className="panel">
      <div>
        <p className="eyebrow">Learner administration</p>
        <h2>Student accounts and profiles</h2>
        <p className="muted">
          Create, update, and remove student accounts. Usernames and emails must be unique within your school.
        </p>
      </div>

      <form className="form-grid" onSubmit={createStudent}>
        <label>
          Full name
          <input value={createForm.name} onChange={(event) => updateCreateField("name", event.target.value)} required />
        </label>
        <label>
          Username
          <input
            autoComplete="off"
            value={createForm.username}
            onChange={(event) => updateCreateField("username", event.target.value)}
            required
          />
        </label>
        <label>
          Initial password
          <input
            autoComplete="new-password"
            minLength={8}
            onChange={(event) => updateCreateField("password", event.target.value)}
            required
            type="password"
            value={createForm.password}
          />
        </label>
        <label>
          Student email
          <input
            type="email"
            value={createForm.email}
            onChange={(event) => updateCreateField("email", event.target.value)}
            required
          />
        </label>
        <label>
          Year level
          <select
            value={createForm.yearLevel}
            onChange={(event) => updateCreateField("yearLevel", event.target.value)}
            required
          >
            {yearLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
        <label>
          Guardian email
          <input
            type="email"
            value={createForm.guardianEmail}
            onChange={(event) => updateCreateField("guardianEmail", event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label>
          Learning notes
          <input
            value={createForm.learningNeeds}
            onChange={(event) => updateCreateField("learningNeeds", event.target.value)}
            placeholder="Optional"
          />
        </label>
        <label className="checkbox-row form-span-all">
          <input checked={sendInvite} onChange={(event) => setSendInvite(event.target.checked)} type="checkbox" />
          Email login details to the student
        </label>
        <button className="button primary" disabled={loading} type="submit">
          {loading ? "Saving..." : "Create student"}
        </button>
      </form>

      <form className="form-grid csv-import-panel" onSubmit={importCsv}>
        <div className="form-span-all">
          <p className="eyebrow">Bulk import</p>
          <h3>CSV upload</h3>
          <p className="muted">
            Header row: name, username, email, password (required). Optional: year_level, guardian_email, learning_needs.
          </p>
        </div>
        <label className="form-span-all">
          CSV content
          <textarea rows={5} value={csvText} onChange={(event) => setCsvText(event.target.value)} />
        </label>
        <div className="row form-span-all">
          <button className="button secondary" disabled={loading} type="button" onClick={downloadTemplate}>
            Download template
          </button>
          <button className="button primary" disabled={loading} type="submit">
            {loading ? "Importing..." : "Import students"}
          </button>
        </div>
      </form>

      {editingId ? (
        <form className="form-grid student-edit-panel" onSubmit={saveStudent}>
          <div className="form-span-all">
            <p className="eyebrow">Edit student</p>
            <h3>Update account</h3>
            <p className="muted">Leave password blank to keep the current password.</p>
          </div>
          <label>
            Full name
            <input value={editForm.name} onChange={(event) => updateEditField("name", event.target.value)} required />
          </label>
          <label>
            Username
            <input
              autoComplete="off"
              value={editForm.username}
              onChange={(event) => updateEditField("username", event.target.value)}
              required
            />
          </label>
          <label>
            New password
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => updateEditField("password", event.target.value)}
              placeholder="Leave blank to keep current"
              type="password"
              value={editForm.password}
            />
          </label>
          <label>
            Student email
            <input
              type="email"
              value={editForm.email}
              onChange={(event) => updateEditField("email", event.target.value)}
              required
            />
          </label>
          <label>
            Year level
            <select
              value={editForm.yearLevel}
              onChange={(event) => updateEditField("yearLevel", event.target.value)}
              required
            >
              {yearLevels.map((level) => (
                <option key={level} value={level}>
                  {level}
                </option>
              ))}
            </select>
          </label>
          <label>
            Guardian email
            <input
              type="email"
              value={editForm.guardianEmail}
              onChange={(event) => updateEditField("guardianEmail", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <label>
            Learning notes
            <input
              value={editForm.learningNeeds}
              onChange={(event) => updateEditField("learningNeeds", event.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="row form-span-all">
            <button className="button primary" disabled={loading} type="submit">
              {loading ? "Saving..." : "Save changes"}
            </button>
            <button className="button secondary" disabled={loading} onClick={cancelEdit} type="button">
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {message.text ? (
        <div className={`message ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : ""}`}>
          {message.text}
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="table table-stacked">
        <thead>
          <tr>
            <th>Student</th>
            <th>Username</th>
            <th>Year level</th>
            <th>Profile</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td data-label="Student">
                <strong>{student.name}</strong>
                <br />
                <span className="muted">{student.email}</span>
              </td>
              <td data-label="Username">{student.username}</td>
              <td data-label="Year level">{student.year_level || "Not set"}</td>
              <td data-label="Profile">
                <div className="profile-chips">
                  {student.guardian_email ? <span className="tag">Guardian: {student.guardian_email}</span> : null}
                  {student.learning_needs ? <span className="tag">Notes: {student.learning_needs}</span> : null}
                </div>
              </td>
              <td data-label="Actions">
                <div className="row table-actions">
                  <button
                    className="button secondary"
                    disabled={loading}
                    onClick={() => startEdit(student)}
                    type="button"
                  >
                    Edit
                  </button>
                  {student.guardian_email ? (
                    <button
                      className="button secondary"
                      disabled={loading}
                      onClick={() => sendGuardianLink(student)}
                      type="button"
                    >
                      Guardian link
                    </button>
                  ) : null}
                  <button
                    className="button secondary danger-button"
                    disabled={loading}
                    onClick={() => removeStudent(student)}
                    type="button"
                  >
                    Delete
                  </button>
                </div>
              </td>
            </tr>
          ))}
          {students.length === 0 ? (
            <tr>
              <td colSpan="5" data-label="">
                No students yet.
              </td>
            </tr>
          ) : null}
        </tbody>
        </table>
      </div>
    </section>
  );
}
