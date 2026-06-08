"use client";

import { useEffect, useState } from "react";
import { detectActiveUserSwitch, resetUserScopedClientState } from "../lib/client-user-scope.js";

const CATEGORIES = [
  { value: "technical", label: "Technical issue" },
  { value: "access", label: "Login or access" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Other" },
];

function statusLabel(status) {
  return status.replace(/_/g, " ");
}

export default function SupportHelpPanel() {
  const [tickets, setTickets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState({ subject: "", body: "", category: "technical" });
  const [reply, setReply] = useState("");

  async function loadTickets() {
    const response = await fetch("/api/tickets", { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load tickets.");
    }
    setTickets(payload.tickets || []);
  }

  async function loadTicket(ticketId) {
    const response = await fetch(`/api/tickets/${ticketId}`, { credentials: "include" });
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.error || "Could not load ticket.");
    }
    setSelectedTicket(payload.ticket);
    setSelectedId(ticketId);
  }

  useEffect(() => {
    let active = true;
    async function bootstrap() {
      setLoading(true);
      setError("");
      try {
        const meResponse = await fetch("/api/me", { credentials: "include" });
        if (meResponse.ok) {
          const mePayload = await meResponse.json();
          if (detectActiveUserSwitch(mePayload.user?.id ?? null)) {
            resetUserScopedClientState();
            setSelectedId(null);
            setSelectedTicket(null);
            setTickets([]);
            setReply("");
            setForm({ subject: "", body: "", category: "technical" });
          }
        }
        await loadTickets();
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

  async function handleCreate(event) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const response = await fetch("/api/tickets", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || "Could not create ticket.");
      }
      setForm({ subject: "", body: "", category: "technical" });
      setNotice("Support ticket submitted. We will reply here when it is picked up.");
      await loadTickets();
      if (payload.ticket?.id) {
        await loadTicket(payload.ticket.id);
      }
    } catch (submitError) {
      setError(submitError.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleReply(event) {
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
      await loadTickets();
      setNotice("Reply sent.");
    } catch (replyError) {
      setError(replyError.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="support-layout">
      <section className="panel">
        <h2>Lodge a ticket</h2>
        <p className="hero-copy">
          Describe what is blocking you. Support staff can see your school or family context and account details with the ticket.
        </p>
        <form className="stack" onSubmit={handleCreate}>
          <label className="field">
            <span>Subject</span>
            <input
              required
              minLength={4}
              value={form.subject}
              onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))}
              placeholder="e.g. Students cannot submit quiz"
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={form.category}
              onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
            >
              {CATEGORIES.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>What happened?</span>
            <textarea
              required
              minLength={10}
              rows={5}
              value={form.body}
              onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))}
              placeholder="Include what you tried, any error messages, and who is affected."
            />
          </label>
          <button className="button" disabled={saving} type="submit">
            {saving ? "Submitting..." : "Submit ticket"}
          </button>
        </form>
      </section>

      <section className="panel">
        <h2>Your tickets</h2>
        {loading ? <p className="muted">Loading tickets...</p> : null}
        {error ? <p className="error">{error}</p> : null}
        {notice ? <p className="success">{notice}</p> : null}

        {!loading && tickets.length === 0 ? (
          <p className="muted">No tickets yet. Submit one if something is blocking your account.</p>
        ) : null}

        <div className="support-ticket-list">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              className={`support-ticket-row${selectedId === ticket.id ? " active" : ""}`}
              onClick={() => loadTicket(ticket.id)}
            >
              <strong>{ticket.subject}</strong>
              <span className="muted">
                {statusLabel(ticket.status)} · {ticket.category} · {new Date(ticket.updatedAt).toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        {selectedTicket ? (
          <div className="support-thread">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <h3>{selectedTicket.subject}</h3>
                <p className="muted">
                  #{selectedTicket.id} · {statusLabel(selectedTicket.status)} · {selectedTicket.category}
                </p>
              </div>
              <span className={`tag support-tag-${selectedTicket.status}`}>{statusLabel(selectedTicket.status)}</span>
            </div>

            <div className="support-messages">
              {selectedTicket.messages?.map((message) => (
                <article
                  key={message.id}
                  className={`support-message${message.isStaffReply ? " staff" : " user"}`}
                >
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

            {!["resolved", "closed"].includes(selectedTicket.status) ? (
              <form className="stack" onSubmit={handleReply}>
                <label className="field">
                  <span>Add an update</span>
                  <textarea
                    required
                    rows={3}
                    value={reply}
                    onChange={(event) => setReply(event.target.value)}
                    placeholder="Reply with more detail if support asked for it."
                  />
                </label>
                <button className="button secondary" disabled={saving} type="submit">
                  {saving ? "Sending..." : "Send reply"}
                </button>
              </form>
            ) : (
              <p className="muted">This ticket is closed. Open a new ticket if you need more help.</p>
            )}
          </div>
        ) : null}
      </section>
    </div>
  );
}
