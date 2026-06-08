"use client";

import { useRef, useState } from "react";
import { pauseStudyNarration } from "../lib/study-speech-input.js";

function prepareClientLogout() {
  pauseStudyNarration();
  if (typeof window !== "undefined") {
    window.speechSynthesis?.cancel();
  }
}

export default function LogoutButton() {
  const loggingOutRef = useRef(false);
  const [loggingOut, setLoggingOut] = useState(false);

  async function logout() {
    if (loggingOutRef.current) {
      return;
    }

    loggingOutRef.current = true;
    setLoggingOut(true);
    prepareClientLogout();

    try {
      const response = await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
      if (!response.ok) {
        throw new Error("Could not sign out.");
      }
      window.location.assign("/?signedOut=1");
    } catch {
      loggingOutRef.current = false;
      setLoggingOut(false);
    }
  }

  return (
    <button className="button secondary" disabled={loggingOut} type="button" onClick={logout}>
      {loggingOut ? "Signing out..." : "Log out"}
    </button>
  );
}
