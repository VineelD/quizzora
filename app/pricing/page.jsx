import Link from "next/link";
import LearningShowcase from "../../components/LearningShowcase.jsx";
import SiteFooter from "../../components/SiteFooter.jsx";
import { formatPlanCap, getPublicPricing } from "../../lib/pricing-display.js";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "../../lib/operator.js";

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
        <p className="eyebrow">Pricing</p>
        <h1>Plans that sustain the platform</h1>
        <p className="hero-copy">
          Quizzora is an open-source education project (AGPL-3.0). Subscriptions on quizzora.org cover
          Australian on-premises hosting, OpenAI for quiz generation and Study Coach, and continued
          development — not a paywall on the source. One subscription per school or family on the hosted
          service. Operated by {operatorDisplayLine()}.
        </p>
        <p className="muted">
          Prefer to run your own instance? You can self-host the AGPL-licensed codebase. Hosted plans below
          fund the quizzora.org service for schools and families who want us to operate it.
        </p>
      </section>

      <section className="panel">
        <p className="eyebrow">Schools</p>
        <h2>School pricing</h2>
      </section>

      <section className="billing-plans pricing-page-plans">
        <article className="card billing-card">
          <h3>{pricing.trial.planName}</h3>
          <p className="pricing-price">{pricing.trialDays}-day free trial</p>
          <p className="muted">Card required at signup. Charged on day {pricing.trialDays} unless you cancel anytime.</p>
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.trial.maxTeachers)} teachers</li>
            <li>Up to {formatPlanCap(pricing.trial.maxStudents)} students</li>
            <li>Up to {formatPlanCap(pricing.trial.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>CSV import & export, guardian links, Sudoku</li>
          </ul>
          <Link className="button secondary" href="/">
            Start free trial
          </Link>
        </article>

        <article className="card billing-card pricing-card-featured">
          <h3>{pricing.paid.planName}</h3>
          <p className="pricing-price">{pricing.monthlyLabel}</p>
          <p className="muted">{pricing.yearlyLabel}</p>
          {pricing.yearlyDiscountPercent ? (
            <p className="muted">Yearly billing saves about {pricing.yearlyDiscountPercent}% vs monthly.</p>
          ) : null}
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.paid.maxTeachers)} teachers</li>
            <li>Up to {formatPlanCap(pricing.paid.maxStudents)} students</li>
            <li>{formatPlanCap(pricing.paid.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>Full feature set for your school</li>
          </ul>
          <p className="muted">Choose monthly or yearly when you register your school.</p>
        </article>
      </section>

      <section className="panel">
        <p className="eyebrow">Families</p>
        <h2>Homeschool &amp; family pricing</h2>
        <p className="hero-copy">
          Parents create child accounts, generate AI quizzes, and assign work at home. Use a family code the same way
          schools use a join code.
        </p>
      </section>

      <section className="billing-plans pricing-page-plans">
        <article className="card billing-card">
          <h3>{pricing.familyTrial.planName}</h3>
          <p className="pricing-price">{pricing.trialDays}-day free trial</p>
          <p className="muted">Card required at signup. Charged on day {pricing.trialDays} unless you cancel anytime.</p>
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.familyTrial.maxParents)} parents</li>
            <li>Up to {formatPlanCap(pricing.familyTrial.maxStudents)} children</li>
            <li>Up to {formatPlanCap(pricing.familyTrial.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>Quiz library reuse, Sudoku, exports</li>
          </ul>
          <Link className="button secondary" href="/">
            Start family trial
          </Link>
        </article>

        <article className="card billing-card pricing-card-featured">
          <h3>{pricing.familyPaid.planName}</h3>
          <p className="pricing-price">{pricing.familyMonthlyLabel}</p>
          <p className="muted">{pricing.familyYearlyLabel}</p>
          <ul className="pricing-features">
            <li>Up to {formatPlanCap(pricing.familyPaid.maxParents)} parents</li>
            <li>Up to {formatPlanCap(pricing.familyPaid.maxStudents)} children</li>
            <li>{formatPlanCap(pricing.familyPaid.maxAiQuizzesPerMonth)} AI quizzes / month</li>
            <li>Full family learning workspace</li>
          </ul>
          <p className="muted">Choose monthly or yearly when you register your family.</p>
        </article>
      </section>

      <LearningShowcase />

      <section className="panel contact-panel">
        <p className="eyebrow">Contact</p>
        <h2>Questions or a school demo?</h2>
        <p className="hero-copy">
          Email us at{" "}
          <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a> for onboarding help, security
          questionnaires, or a walkthrough for your leadership team.
        </p>
        <div className="row">
          <a className="button primary" href={`mailto:${OPERATOR_CONTACT_EMAIL}?subject=Quizzora%20school%20demo`}>
            Request a demo
          </a>
          <Link className="button secondary" href="/">
            Register your school
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
