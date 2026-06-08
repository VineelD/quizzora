"use client";

import { useSearchParams } from "next/navigation";
import { useState } from "react";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage("");

    const response = await fetch("/api/auth/reset-password", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password, confirmPassword }),
    });
    const payload = await response.json();
    setLoading(false);

    if (!response.ok) {
      setMessage(payload.error || "Could not reset password.");
      return;
    }

    window.location.assign(payload.user.role === "teacher" ? "/teacher" : "/student");
  }

  if (!token) {
    return (
      <div className="login-card">
        <div className="message danger">This reset link is missing or invalid.</div>
      </div>
    );
  }

  return (
    <form className="login-card" onSubmit={handleSubmit} autoComplete="off">
      <div>
        <p className="eyebrow">Secure portal</p>
        <h2>Choose a new password</h2>
        <p className="muted">Enter a new password with at least 8 characters.</p>
      </div>

      <div className="field">
        <label htmlFor="reset-password">New password</label>
        <input
          autoComplete="new-password"
          id="reset-password"
          minLength={8}
          onChange={(event) => setPassword(event.target.value)}
          required
          type="password"
          value={password}
        />
      </div>

      <div className="field">
        <label htmlFor="reset-confirm-password">Confirm password</label>
        <input
          autoComplete="new-password"
          id="reset-confirm-password"
          minLength={8}
          onChange={(event) => setConfirmPassword(event.target.value)}
          required
          type="password"
          value={confirmPassword}
        />
      </div>

      {message ? <div className="message danger">{message}</div> : null}

      <button className="button primary" disabled={loading} type="submit">
        {loading ? "Saving..." : "Update password"}
      </button>
    </form>
  );
}
