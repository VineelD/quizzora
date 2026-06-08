"use client";

import { useEffect, useState } from "react";

const STATUS_OPTIONS = ["", "open", "in_progress", "resolved", "closed"];

function statusLabel(status) {
  return status.replace(/_/g, " ");
}

export default function SupportConsole() {
  const [tickets, setTickets] = useState([]);
  const [stats, setStats] = useState(null);
  const [staff, setStaff] = useState([]);
  const [filters, setFilters] = useState({ status: "open", search: "", priority: "" });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reply, setReply] = useState("");
  const [updateForm, setUpdateForm] = useState({ status: "open", priority: "normal", assignedToUserId: "" });

  async function loadQueue(nextFilters = filters) {
    const params = new URLSearchParams();
    if (nextFilters.status) {
      params.set("status", nextFilters.status);
    }
    if (nextFilters.priority) {
      params.set("priority", nextFilters.priority);
    }
    if (nextFilters.search.trim()) {
      params.set("search", nextFilters.search.trim());
    }

    const response = await fetch(`/api/support/tickets?${params.toString()}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load support queue.");
    }

    setTickets(payload.tickets || []);
    setStats(payload.stats || null);
    setStaff(payload.staff || []);
  }

  async function loadTicket(ticketId) {
    const response = await fetch(`/api/tickets/${ticketId}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load ticket.");
    }

    const ticket = payload.ticket;
    setSelectedTicket(ticket);
    setSelectedId(ticketId);
    setUpdateForm({
      status: ticket.status,
      priority: ticket.priority,
      assignedToUserId: ticket.assignedToUserId ? String(ticket.assignedToUserId) : "",
    });
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        await loadQueue();
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
    try {
      await loadQueue(filters);
    } catch (loadError) {
      setError(loadError.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveTicketUpdate(event) {
    event.preventDefault();
    if (!selectedId) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tickets/${selectedId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: updateForm.status,
          priority: updateForm.priority,
          assignedToUserId: updateForm.assignedToUserId ? Number(updateForm.assignedToUserId) : null,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not update ticket.");
      }
      setSelectedTicket(payload.ticket);
      await loadQueue();
      setNotice("Ticket updated.");
    } catch (updateError) {
      setError(updateError.message);
    } finally {
      setSaving(false);
    }
  }

  async function sendReply(event) {
    event.preventDefault();
    if (!selectedId) {
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/tickets/${selectedId}/messages`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not send reply.");
      }
      setReply("");
      setSelectedTicket(payload.ticket);
      await loadQueue();
      setNotice("Reply sent to the school user.");
    } catch (replyError) {
      setError(replyError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="support-console">
      <section className="panel">
        <div className="grid">
          <div className="metric">
            <strong>{stats?.open ?? 0}</strong>
            <span>Open</span>
          </div>
          <div className="metric">
            <strong>{stats?.in_progress ?? 0}</strong>
            <span>In progress</span>
          </div>
          <div className="metric">
            <strong>{stats?.resolved ?? 0}</strong>
            <span>Resolved</span>
          </div>
          <div className="metric">
            <strong>{stats?.total ?? 0}</strong>
            <span>Total</span>
          </div>
        </div>

        <form className="support-filters row" onSubmit={applyFilters}>
          <label className="field">
            <span>Status</span>
            <select
              value={filters.status}
              onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
            >
              {STATUS_OPTIONS.map((value) => (
                <option key={value || "all"} value={value}>
                  {value ? statusLabel(value) : "All statuses"}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Priority</span>
            <select
              value={filters.priority}
              onChange={(event) => setFilters((current) => ({ ...current, priority: event.target.value }))}
            >
              <option value="">All</option>
              <option value="urgent">Urgent</option>
              <option value="normal">Normal</option>
            </select>
          </label>
          <label className="field" style={{ flex: 1 }}>
            <span>Search</span>
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Subject, school, requester"
            />
          </label>
          <button className="button secondary" type="submit">
            Filter
          </button>
        </form>

        {loading ? <p className="muted">Loading queue...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="success">{notice}</p> : null}

        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Subject</th>
                <th>School</th>
                <th>Requester</th>
                <th>Status</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {tickets.map((ticket) => (
                <tr
                  key={ticket.id}
                  className={selectedId === ticket.id ? "selected-row" : ""}
                  onClick={() => loadTicket(ticket.id)}
                  style={{ cursor: "pointer" }}
                >
                  <td>#{ticket.id}</td>
                  <td>
                    <strong>{ticket.subject}</strong>
                    <div className="muted">{ticket.category}</div>
                  </td>
                  <td>{ticket.schoolName || "—"}</td>
                  <td>
                    {ticket.createdByName}
                    <div className="muted">{ticket.createdByRole}</div>
                  </td>
                  <td>
                    <span className={`tag support-tag-${ticket.status}`}>{statusLabel(ticket.status)}</span>
                  </td>
                  <td>{new Date(ticket.updatedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {selectedTicket ? (
        <section className="panel support-detail">
          <h2>Ticket #{selectedTicket.id}</h2>
          <p className="hero-copy">{selectedTicket.subject}</p>
          <div className="grid">
            <div className="metric">
              <strong>{selectedTicket.schoolName || "No school"}</strong>
              <span>School</span>
            </div>
            <div className="metric">
              <strong>{selectedTicket.createdByName}</strong>
              <span>
                {selectedTicket.createdByRole} · {selectedTicket.createdByEmail}
              </span>
            </div>
            <div className="metric">
              <strong>{selectedTicket.schoolJoinCode || "—"}</strong>
              <span>School code</span>
            </div>
          </div>

          <form className="support-filters row" onSubmit={saveTicketUpdate}>
            <label className="field">
              <span>Status</span>
              <select
                value={updateForm.status}
                onChange={(event) => setUpdateForm((current) => ({ ...current, status: event.target.value }))}
              >
                {STATUS_OPTIONS.filter(Boolean).map((value) => (
                  <option key={value} value={value}>
                    {statusLabel(value)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Priority</span>
              <select
                value={updateForm.priority}
                onChange={(event) => setUpdateForm((current) => ({ ...current, priority: event.target.value }))}
              >
                <option value="normal">Normal</option>
                <option value="urgent">Urgent</option>
              </select>
            </label>
            <label className="field">
              <span>Assigned to</span>
              <select
                value={updateForm.assignedToUserId}
                onChange={(event) =>
                  setUpdateForm((current) => ({ ...current, assignedToUserId: event.target.value }))
                }
              >
                <option value="">Unassigned</option>
                {staff.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.role})
                  </option>
                ))}
              </select>
            </label>
            <button className="button" disabled={saving} type="submit">
              {saving ? "Saving..." : "Save ticket"}
            </button>
          </form>

          <div className="support-messages">
            {selectedTicket.messages?.map((message) => (
              <article key={message.id} className={`support-message${message.isStaffReply ? " staff" : " user"}`}>
                <header>
                  <strong>{message.authorName}</strong>
                  <span className="muted">
                    {message.isStaffReply ? "Support" : message.authorRole} ·{" "}
                    {new Date(message.createdAt).toLocaleString()}
                  </span>
                </header>
                <p>{message.body}</p>
              </article>
            ))}
          </div>

          <form className="stack" onSubmit={sendReply}>
            <label className="field">
              <span>Reply to school</span>
              <textarea
                required
                rows={4}
                value={reply}
                onChange={(event) => setReply(event.target.value)}
                placeholder="Explain what you changed or what the school should try next."
              />
            </label>
            <button className="button" disabled={saving} type="submit">
              {saving ? "Sending..." : "Send support reply"}
            </button>
          </form>
        </section>
      ) : (
        <section className="panel">
          <p className="muted">Select a ticket from the queue to investigate and reply.</p>
        </section>
      )}
    </div>
  );
}
