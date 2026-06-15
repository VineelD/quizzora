import Link from "next/link";
import { isDonationConfigured, DONATION_URL } from "../lib/donation.js";
import { OPERATOR_PRODUCT_NAME, operatorContextLine, operatorDisplayLine } from "../lib/operator.js";

export default function SiteFooter() {
  const region = process.env.DATA_REGION_LABEL || "Australia (operator-hosted on-premises)";

  return (
    <footer className="site-footer">
      <p className="muted">
        Open-source education platform (AGPL-3.0). Free for schools and families. Student data hosted in {region}.
        &copy; {new Date().getFullYear()} {OPERATOR_PRODUCT_NAME} — {operatorDisplayLine()} ({operatorContextLine()}).
      </p>
      <div className="row">
        <Link href="/pricing">Free access</Link>
        {isDonationConfigured() ? (
          <a href={DONATION_URL} rel="noopener noreferrer" target="_blank">
            Optional support
          </a>
        ) : null}
        <Link href="/legal/privacy">Privacy</Link>
        <Link href="/terms">Terms</Link>
        <Link href="/legal/data-retention">Data retention</Link>
        <Link href="/api/health" prefetch={false}>
          Status
        </Link>
      </div>
    </footer>
  );
}
