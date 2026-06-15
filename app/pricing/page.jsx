import Link from "next/link";
import DonationNotice from "../../components/DonationNotice.jsx";
import LearningShowcase from "../../components/LearningShowcase.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import { formatPlanCap, getPublicPricing } from "../../lib/pricing-display.js";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME, operatorContextLine, operatorDisplayLine } from "../../lib/operator.js";

export default function PricingPage() {
  const pricing = getPublicPricing();

  return (
    <main className="shell landing-shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
        </Link>
        <div className="row">
          <Link className="button secondary" href="/">
            Sign in
          </Link>
        </div>
      </nav>

      <section className="panel pricing-intro">
        <p className="eyebrow">Access</p>
        <h1>Free for schools and families</h1>
        <p className="hero-copy">
          {OPERATOR_PRODUCT_NAME} is an open-source education project (AGPL-3.0) run voluntarily as a hobby by{" "}
          {operatorDisplayLine()} — {operatorContextLine()}. Schools and families can register and use the hosted
          service at quizzora.org without a subscription or payment.
        </p>
        <p className="muted">
          Prefer to run your own instance? Self-host the AGPL-licensed codebase. Optional voluntary support (up to the
          cap below) helps cover hosting and AI costs but is never required for access.
        </p>
      </section>

      <DonationNotice />

      <section className="panel">
        <p className="eyebrow">Schools</p>
        <h2>School access</h2>
        <p className="hero-copy">Register your school, invite teachers with a join code, and assign curriculum-aligned quizzes.</p>
      </section>

      <section className="billing-plans pricing-page-plans">
        <article className="card billing-card pricing-card-featured">
          <h3>{pricing.paid.planName}</h3>
          <p className="pricing-price">No subscription</p>
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.paid.maxTeachers)} teachers</li>
            <li>Up to {formatPlanCap(pricing.paid.maxStudents)} students</li>
            <li>{formatPlanCap(pricing.paid.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>CSV import &amp; export, guardian links, Sudoku</li>
          </ul>
          <Link className="button primary" href="/">
            Register your school
          </Link>
        </article>
      </section>

      <section className="panel">
        <p className="eyebrow">Families</p>
        <h2>Homeschool &amp; family access</h2>
        <p className="hero-copy">
          Parents create child accounts, generate AI quizzes, and assign work at home. Use a family code the same way
          schools use a join code.
        </p>
      </section>

      <section className="billing-plans pricing-page-plans">
        <article className="card billing-card pricing-card-featured">
          <h3>{pricing.familyPaid.planName}</h3>
          <p className="pricing-price">No subscription</p>
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.familyPaid.maxParents)} parents</li>
            <li>Up to {formatPlanCap(pricing.familyPaid.maxStudents)} children</li>
            <li>{formatPlanCap(pricing.familyPaid.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>Quiz library reuse, Sudoku, exports</li>
          </ul>
          <Link className="button primary" href="/">
            Register your family
          </Link>
        </article>
      </section>

      <section className="panel legal-panel">
        <p className="eyebrow">Important</p>
        <h2>Educational hobby — not professional advice</h2>
        <p className="hero-copy">
          {OPERATOR_PRODUCT_NAME} is provided &quot;as is&quot; for educational practice only. AI-generated content may
          be inaccurate. It is not a substitute for qualified teaching, assessment moderation, or professional advice.
          See our <Link href="/terms">Terms</Link> for full disclaimers.
        </p>
      </section>

      <LearningShowcase />

      <section className="panel contact-panel">
        <p className="eyebrow">Contact</p>
        <h2>Questions or a walkthrough?</h2>
        <p className="hero-copy">
          Email{" "}
          <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a> for onboarding help or a demo with
          your leadership team.
        </p>
        <div className="row">
          <a className="button primary" href={`mailto:${OPERATOR_CONTACT_EMAIL}?subject=Quizzora%20demo`}>
            Request a demo
          </a>
          <Link className="button secondary" href="/">
            Get started free
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
