import { redirect } from "next/navigation";
import { OPERATOR_CONTACT_EMAIL, OPERATOR_PRODUCT_NAME } from "../../lib/operator.js";
import { isMaintenanceModeEnabled } from "../../lib/maintenance-mode.js";

export const metadata = {
  title: "Maintenance",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  if (!isMaintenanceModeEnabled()) {
    redirect("/");
  }

  return (
    <main className="shell landing-shell" id="main-content">
      <nav className="nav landing-nav">
        <a className="brand" href="/maintenance">
          <span className="brand-mark" aria-hidden="true">
            <img
              className="brand-logo"
              src="/brand/quizzora-logo.svg"
              alt=""
              width="28"
              height="28"
            />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
        </a>
        <span className="tag nav-tag">Maintenance</span>
      </nav>

      <section className="panel staging-gate-panel">
        <h1>We&apos;ll be back soon</h1>
        <p className="hero-copy">
          {OPERATOR_PRODUCT_NAME} is undergoing scheduled maintenance. Please check back shortly.
        </p>
        <p className="hero-copy">
          Questions? Email{" "}
          <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a>.
        </p>
      </section>
    </main>
  );
}
