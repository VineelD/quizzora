import Link from "next/link";
import SiteFooter from "../../../components/SiteFooter.jsx";
import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "../../../lib/operator.js";
import { getTermsMeta, getTermsSections } from "../../../lib/terms-content.js";

export default function TermsPage() {
  const { lastUpdatedLabel, version } = getTermsMeta();
  const sections = getTermsSections();

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
        </Link>
      </nav>

      <section className="panel legal-panel">
        <p className="eyebrow">Legal</p>
        <h1>Terms and Conditions</h1>
        <p className="hero-copy">
          Last updated: {lastUpdatedLabel} (version {version}). {OPERATOR_PRODUCT_NAME} is provided by{" "}
          {operatorDisplayLine()}.
        </p>
        <p className="muted">
          These Terms govern use of {OPERATOR_PRODUCT_NAME}. For privacy practices, see our{" "}
          <Link href="/legal/privacy">Privacy Policy</Link>.
        </p>

        {sections.map((section) => (
          <article key={section.id} id={section.id}>
            <h2>{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph.slice(0, 48)}>{paragraph}</p>
            ))}
          </article>
        ))}
      </section>

      <SiteFooter />
    </main>
  );
}
