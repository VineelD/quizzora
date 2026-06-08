import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm.jsx";
import LearningShowcase from "../components/LearningShowcase.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { getSession } from "../lib/auth.js";
import { getSchoolBilling } from "../lib/billing.js";
import { getFamilyBilling } from "../lib/family-billing.js";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME } from "../lib/operator.js";

export default async function HomePage({ searchParams }) {
  const user = await getSession();
  const params = await searchParams;
  const authError = params?.authError ? String(params.authError) : "";
  const signedOut = params?.signedOut === "1";
  if (user?.role === "superadmin") {
    redirect("/superadmin");
  }
  if (user?.role === "support") {
    redirect("/support");
  }
  if (user?.role === "parent") {
    const billing = user.family_id ? getFamilyBilling(user.family_id) : null;
    redirect(billing?.pendingCheckout ? "/family/billing" : "/family");
  }
  if (user?.role === "admin") {
    const billing = user.school_id ? getSchoolBilling(user.school_id) : null;
    redirect(billing?.pendingCheckout ? "/admin/billing" : "/admin");
  }
  if (user?.role === "teacher") {
    redirect("/teacher");
  }
  if (user?.role === "student") {
    redirect("/student");
  }

  return (
    <main className="shell landing-shell landing-layout" id="main-content">
      <nav className="nav landing-nav">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
        </a>
        <div className="row">
          <Link className="button secondary" href="/pricing">
            Pricing
          </Link>
          <span className="tag nav-tag">Educator and student portal</span>
        </div>
      </nav>

      <div className="landing-main-grid">
        <div className="landing-left-column">
          <section className="panel contact-panel landing-contact">
            <p className="eyebrow">Contact</p>
            <h2>Bring Quizzora to your school</h2>
            <p className="hero-copy">
              Start with a free trial or email{" "}
              <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a> for a demo walkthrough with your
              leadership team.
            </p>
            <div className="row">
              <a
                className="button primary"
                href={`mailto:${OPERATOR_CONTACT_EMAIL}?subject=Quizzora%20school%20demo`}
              >
                Request a demo
              </a>
              <Link className="button secondary" href="/pricing">
                See pricing
              </Link>
            </div>
          </section>

          <section className="hero hero-with-visual landing-hero">
            <div className="hero-copy-block">
              <p className="eyebrow">Australian curriculum assessment platform</p>
              <h1>Create structured quizzes, collect student submissions, and track progress in one place.</h1>
              <p className="hero-copy">
                Teachers generate Year 7–12 assessments, assign them to classes, and instantly review completion and
                marks. Students log in to a focused portal to complete their work with zero distractions.
              </p>
              <div className="row">
                <span className="tag">Educator console</span>
                <span className="tag">Student workspace</span>
                <span className="tag">Server-side AI generation</span>
              </div>
              <p className="muted landing-cta-links">
                <Link href="/pricing">View pricing &amp; trial</Link>
                {" · "}
                <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>Contact support</a>
              </p>
            </div>
            <div className="hero-visual-card">
              <img
                className="hero-visual-image"
                src="/images/learning-classroom.webp"
                alt="Students collaborating in an Australian classroom"
                width="640"
                height="420"
                loading="eager"
              />
            </div>
          </section>

          <div className="landing-showcase-wrap">
            <LearningShowcase />
          </div>

          <div className="landing-footer-wrap">
            <SiteFooter />
          </div>
        </div>

        <aside className="landing-portal-group" aria-label="Secure portal">
          <AuthForm authError={authError} signedOut={signedOut} />
        </aside>
      </div>
    </main>
  );
}
