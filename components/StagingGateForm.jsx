"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StagingGateForm({ nextPath = "/" }) {
  const router = useRouter();
  const [username, setUsername] = useState("tester");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch("/api/staging-gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        setMessage(data.error || "Invalid tester username or password.");
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setMessage("Network error. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="login-card staging-gate-card" onSubmit={handleSubmit}>
      <p className="eyebrow">Staging access</p>
      <h2>Tester sign-in</h2>
      <p className="muted">Shared credentials are required before you can use this test site.</p>

      <div className="field">
        <label htmlFor="staging-gate-username">Username</label>
        <input
          id="staging-gate-username"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          required
        />
      </div>

      <div className="field">
        <label htmlFor="staging-gate-password">Password</label>
        <input
          id="staging-gate-password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </div>

      {message ? <div className="message error">{message}</div> : null}

      <button className="button primary" disabled={busy} type="submit">
        {busy ? "Signing in…" : "Continue to test site"}
      </button>
    </form>
  );
}
