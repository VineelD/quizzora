"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function FamilyConsole({ family, isOwner }) {
  const router = useRouter();
  const [joinCode, setJoinCode] = useState(family.join_code || "");
  const [message, setMessage] = useState({ text: "", tone: "info" });
  const [loading, setLoading] = useState(false);

  function setStatus(text, tone = "info") {
    setMessage({ text, tone });
  }

  async function rotateJoinCode() {
    setLoading(true);
    setStatus("");
    const response = await fetch("/api/family/join-code", { method: "POST" });
    const payload = await response.json();
    setLoading(false);
    if (!response.ok) {
      setStatus(payload.error || "Could not regenerate code.", "error");
      return;
    }
    setJoinCode(payload.family.join_code);
    setStatus("New family code generated. Share it with another parent who needs to join.", "success");
    router.refresh();
  }

  return (
    <section className="panel">
      <p className="eyebrow">Family settings</p>
      <h2>{family.name}</h2>
      <p className="hero-copy">
        Share your family code so another parent can join. Students sign in with the same code if their email is used
        elsewhere.
      </p>

      <div className="school-code-panel">
        <div>
          <p className="muted">Family code</p>
          <p className="pricing-price">
            <code>{joinCode}</code>
          </p>
        </div>
        {isOwner ? (
          <button className="button secondary" disabled={loading} onClick={rotateJoinCode} type="button">
            {loading ? "Working..." : "Generate new code"}
          </button>
        ) : (
          <span className="tag">Co-parent account</span>
        )}
      </div>

      {message.text ? <div className={`message ${message.tone === "error" ? "error" : message.tone === "success" ? "success" : ""}`}>{message.text}</div> : null}
    </section>
  );
}
