import Link from "next/link";
import { redirect } from "next/navigation";
import AuthForm from "../components/AuthForm.jsx";
import DonationNotice from "../components/DonationNotice.jsx";
import LearningShowcase from "../components/LearningShowcase.jsx";
import SiteFooter from "../components/SiteFooter.jsx";
import { getSession } from "../lib/auth.js";
import { getSchoolBilling } from "../lib/billing.js";
import { getFamilyBilling } from "../lib/family-billing.js";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME, operatorContextLine, operatorDisplayLine } from "../lib/operator.js";

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
    redirect("/family");
  }
  if (user?.role === "admin") {
    redirect("/admin");
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
            Free access
          </Link>
          <span className="tag nav-tag">Educator and student portal</span>
        </div>
      </nav>

      <div className="landing-main-grid">
        <div className="landing-left-column">
          <section className="panel contact-panel landing-contact">
            <p className="eyebrow">Free for schools and families</p>
            <h2>Bring Quizzora to your school or home</h2>
            <p className="hero-copy">
              Register at no cost — run by {operatorDisplayLine()} as a {operatorContextLine()}. Email{" "}
              <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a> for a demo walkthrough if you
              would like one.
            </p>
            <div className="row">
              <a
                className="button primary"
                href={`mailto:${OPERATOR_CONTACT_EMAIL}?subject=Quizzora%20demo`}
              >
                Request a demo
              </a>
              <Link className="button secondary" href="/pricing">
                Learn more
              </Link>
            </div>
          </section>

          <DonationNotice className="panel donation-notice landing-donation" />

          <section className="hero hero-with-visual landing-hero">
            <div className="hero-copy-block">
              <p className="eyebrow">Open-source Australian curriculum practice</p>
              <h1>Every student deserves curriculum-aligned practice — with software schools can trust.</h1>
              <p className="hero-copy">
                Quizzora helps teachers assign Years 7–12 quizzes (including VCE) and gives students a focused Study
                Coach before graded work unlocks. Open source under AGPL-3.0; hosted data stays on-premises in Australia.
              </p>
              <div className="row">
                <span className="tag">Australian curriculum</span>
                <span className="tag">Open source AGPL</span>
                <span className="tag">Free access</span>
                <span className="tag">Data in Australia</span>
              </div>
              <p className="muted landing-cta-links">
                <Link href="/pricing">Access details &amp; optional support</Link>
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
