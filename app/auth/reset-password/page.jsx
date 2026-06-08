import Link from "next/link";
import { Suspense } from "react";
import ResetPasswordForm from "../../../components/ResetPasswordForm.jsx";
import { OPERATOR_PRODUCT_NAME } from "../../../lib/operator.js";

export default function ResetPasswordPage() {
  return (
    <main className="shell">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
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
