import Link from "next/link";
import { Suspense } from "react";
import ResetPasswordForm from "../../../components/ResetPasswordForm.jsx";

export default function ResetPasswordPage() {
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark">7</span>
          <span>LittleCode Learning</span>
        </Link>
      </nav>

      <section className="hero">
        <Suspense fallback={<div className="login-card">Loading...</div>}>
          <ResetPasswordForm />
        </Suspense>
      </section>
    </main>
  );
}
