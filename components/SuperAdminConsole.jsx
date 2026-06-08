"use client";

import { useEffect, useState } from "react";

const YEAR_LEVELS = ["Year 7", "Year 8", "Year 9", "Year 10", "Year 11", "Year 12"];
const ROLE_OPTIONS = ["admin", "teacher", "student", "parent", "support"];

const EMPTY_CREATE_FORM = {
  role: "teacher",
  schoolId: "",
  name: "",
  email: "",
  username: "",
  password: "",
  yearLevel: "Year 7",
};

export default function SuperAdminConsole() {
  const [schools, setSchools] = useState([]);
  const [families, setFamilies] = useState([]);
  const [users, setUsers] = useState([]);
  const [schoolId, setSchoolId] = useState("");
  const [role, setRole] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
  const [editingUser, setEditingUser] = useState(null);
  const [editForm, setEditForm] = useState(null);

  async function loadSchools() {
    const response = await fetch("/api/superadmin/schools", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load schools.");
    }
    setSchools(payload.schools || []);
  }

  async function loadFamilies() {
    const response = await fetch("/api/superadmin/families", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load families.");
    }
    setFamilies(payload.families || []);
  }

  async function loadUsers(nextSchoolId = schoolId, nextRole = role, nextSearch = search) {
    const params = new URLSearchParams();
    if (nextSchoolId) {
      params.set("schoolId", nextSchoolId);
    }
    if (nextRole) {
      params.set("role", nextRole);
    }
    if (nextSearch.trim()) {
      params.set("search", nextSearch.trim());
    }

    const response = await fetch(`/api/superadmin/users?${params.toString()}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load users.");
    }
    setUsers(payload.users || []);
  }

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        await Promise.all([loadSchools(), loadFamilies()]);
        if (active) {
          await loadUsers();
        }
      } catch (loadError) {
        if (active) {
          setError(loadError.message);
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  async function applyFilters(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    setNotice("");
    try {
      await loadUsers();
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(user) {
    setEditingUser(user);
    setEditForm({
      schoolId: user.schoolId ? String(user.schoolId) : "",
      role: user.role,
      name: user.name,
      email: user.email,
      username: user.username || "",
      password: "",
    });
    setNotice("");
    setError("");
  }

  function cancelEdit() {
    setEditingUser(null);
    setEditForm(null);
  }

  async function saveEdit(event) {
    event.preventDefault();
    if (!editingUser || !editForm) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const response = await fetch(`/api/superadmin/users/${editingUser.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        schoolId: editForm.role === "support" ? null : editForm.schoolId,
        role: editForm.role,
        name: editForm.name,
        email: editForm.email,
        username: editForm.username,
        password: editForm.password || undefined,
      }),
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error || "Could not update account.");
      return;
    }

    setNotice(`Updated ${payload.user.username || payload.user.email}.`);
    cancelEdit();
    await loadUsers();
  }

  async function removeUser(user) {
    const warning =
      user.role === "teacher" || user.role === "admin"
        ? `Delete ${user.name}? Their classes, quizzes, and linked data will be removed.`
        : user.role === "student"
          ? `Delete ${user.name}? Their submissions and class enrolments will be removed.`
          : `Delete ${user.name}? This cannot be undone.`;

    if (!window.confirm(warning)) {
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    const response = await fetch(`/api/superadmin/users/${user.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error || "Could not delete account.");
      return;
    }

    if (editingUser?.id === user.id) {
      cancelEdit();
    }

    setNotice(`Deleted ${user.username || user.email}.`);
    await loadUsers();
  }

  async function createUser(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");

    const response = await fetch("/api/superadmin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        role: createForm.role,
        schoolId: createForm.role === "support" ? null : createForm.schoolId,
        name: createForm.name,
        email: createForm.email,
        username: createForm.username,
        password: createForm.password,
        yearLevel: createForm.yearLevel,
      }),
    });
    const payload = await response.json();
    setSaving(false);

    if (!response.ok) {
      setError(payload.error || "Could not create account.");
      return;
    }

    setCreateForm(EMPTY_CREATE_FORM);
    setNotice(`Created ${payload.user.username || payload.user.email}.`);
    await loadUsers();
  }

  return (
    <div className="superadmin-console">
      <section className="panel">
        <p className="eyebrow">Schools</p>
        <h2>All tenants</h2>
        {loading && !schools.length ? <p className="muted">Loading schools...</p> : null}
        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>School</th>
                <th>Join code</th>
                <th>Admins</th>
                <th>Teachers</th>
                <th>Students</th>
                <th>Total users</th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr key={school.id}>
                  <td>{school.name}</td>
                  <td>
                    <code>{school.joinCode}</code>
                  </td>
                  <td>{school.adminCount}</td>
                  <td>{school.teacherCount}</td>
                  <td>{school.studentCount}</td>
                  <td>{school.userCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <p className="eyebrow">Families</p>
        <h2>Homeschool tenants</h2>
        <div className="table-wrap">
          <table className="table table-stacked">
            <thead>
              <tr>
                <th>Family</th>
                <th>Join code</th>
                <th>Parents</th>
                <th>Students</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {families.map((family) => (
                <tr key={family.id}>
                  <td>{family.name}</td>
                  <td>
                    <code>{family.joinCode}</code>
                  </td>
                  <td>{family.parentCount}</td>
                  <td>{family.studentCount}</td>
                  <td>{family.subscriptionStatus || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!families.length ? <p className="muted">No families registered yet.</p> : null}
      </section>

      <section className="panel">
        <p className="eyebrow">Create account</p>
        <h2>Add a user</h2>
        <form className="superadmin-user-form" onSubmit={createUser}>
          <div className="row superadmin-form-grid">
            <div className="field">
              <label htmlFor="create-role">Role</label>
              <select
                id="create-role"
                onChange={(event) => setCreateForm((current) => ({ ...current, role: event.target.value }))}
                value={createForm.role}
              >
                {ROLE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            {createForm.role !== "support" ? (
              <div className="field">
                <label htmlFor="create-school">School</label>
                <select
                  id="create-school"
                  onChange={(event) => setCreateForm((current) => ({ ...current, schoolId: event.target.value }))}
                  required
                  value={createForm.schoolId}
                >
                  <option value="">Select school</option>
                  {schools.map((school) => (
                    <option key={school.id} value={school.id}>
                      {school.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
            {createForm.role === "student" ? (
              <div className="field">
                <label htmlFor="create-year">Year level</label>
                <select
                  id="create-year"
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
            ) : null}
            <div className="field">
              <label htmlFor="create-name">Name</label>
              <input
                id="create-name"
                onChange={(event) => setCreateForm((current) => ({ ...current, name: event.target.value }))}
                required
                type="text"
                value={createForm.name}
              />
            </div>
            <div className="field">
              <label htmlFor="create-email">Email</label>
              <input
                id="create-email"
                onChange={(event) => setCreateForm((current) => ({ ...current, email: event.target.value }))}
                required
                type="email"
                value={createForm.email}
              />
            </div>
            <div className="field">
              <label htmlFor="create-username">Username</label>
              <input
                id="create-username"
                onChange={(event) => setCreateForm((current) => ({ ...current, username: event.target.value }))}
                placeholder="Optional for teachers"
                type="text"
                value={createForm.username}
              />
            </div>
            <div className="field">
              <label htmlFor="create-password">Password</label>
              <input
                id="create-password"
                minLength={8}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                required
                type="password"
                value={createForm.password}
              />
            </div>
          </div>
          <button className="button" disabled={saving} type="submit">
            {saving ? "Saving..." : "Create account"}
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">Users</p>
        <h2>Everyone across schools</h2>
        <form className="row superadmin-filters" onSubmit={applyFilters}>
          <div className="field">
            <label htmlFor="superadmin-school-filter">School</label>
            <select id="superadmin-school-filter" onChange={(event) => setSchoolId(event.target.value)} value={schoolId}>
              <option value="">All schools</option>
              {schools.map((school) => (
                <option key={school.id} value={school.id}>
                  {school.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="superadmin-role-filter">Role</label>
            <select id="superadmin-role-filter" onChange={(event) => setRole(event.target.value)} value={role}>
              <option value="">All roles</option>
              {ROLE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="superadmin-search">Search</label>
            <input
              id="superadmin-search"
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name, email, or username"
              type="search"
              value={search}
            />
          </div>
          <button className="button secondary" disabled={loading} type="submit">
            {loading ? "Loading..." : "Apply filters"}
          </button>
        </form>

        {error ? <div className="message error">{error}</div> : null}
        {notice ? <div className="message success">{notice}</div> : null}

        {editingUser && editForm ? (
          <form className="superadmin-edit-panel" onSubmit={saveEdit}>
            <h3>Edit {editingUser.name}</h3>
            <div className="row superadmin-form-grid">
              <div className="field">
                <label htmlFor="edit-role">Role</label>
                <select
                  id="edit-role"
                  onChange={(event) => setEditForm((current) => ({ ...current, role: event.target.value }))}
                  value={editForm.role}
                >
                  {ROLE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              {editForm.role !== "support" ? (
                <div className="field">
                  <label htmlFor="edit-school">School</label>
                  <select
                    id="edit-school"
                    onChange={(event) => setEditForm((current) => ({ ...current, schoolId: event.target.value }))}
                    required
                    value={editForm.schoolId}
                  >
                    <option value="">Select school</option>
                    {schools.map((school) => (
                      <option key={school.id} value={school.id}>
                        {school.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="edit-name">Name</label>
                <input
                  id="edit-name"
                  onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))}
                  required
                  type="text"
                  value={editForm.name}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-email">Email</label>
                <input
                  id="edit-email"
                  onChange={(event) => setEditForm((current) => ({ ...current, email: event.target.value }))}
                  required
                  type="email"
                  value={editForm.email}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-username">Username</label>
                <input
                  id="edit-username"
                  onChange={(event) => setEditForm((current) => ({ ...current, username: event.target.value }))}
                  required
                  type="text"
                  value={editForm.username}
                />
              </div>
              <div className="field">
                <label htmlFor="edit-password">New password</label>
                <input
                  id="edit-password"
                  minLength={8}
                  onChange={(event) => setEditForm((current) => ({ ...current, password: event.target.value }))}
                  placeholder="Leave blank to keep current"
                  type="password"
                  value={editForm.password}
                />
              </div>
            </div>
            <div className="row">
              <button className="button" disabled={saving} type="submit">
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button className="button secondary" disabled={saving} onClick={cancelEdit} type="button">
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
                <th>Email</th>
                <th>Username</th>
                <th>Role</th>
                <th>School</th>
                <th>Join code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>{user.username || "—"}</td>
                  <td>{user.role}</td>
                  <td>{user.schoolName || user.familyName || "—"}</td>
                  <td>
                    {user.schoolJoinCode ? (
                      <code>{user.schoolJoinCode}</code>
                    ) : user.familyJoinCode ? (
                      <code>{user.familyJoinCode}</code>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <div className="row superadmin-row-actions">
                      <button className="button secondary" disabled={saving} onClick={() => startEdit(user)} type="button">
                        Edit
                      </button>
                      <button className="button danger-button" disabled={saving} onClick={() => removeUser(user)} type="button">
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !users.length ? <p className="muted">No users match these filters.</p> : null}
      </section>
    </div>
  );
}
