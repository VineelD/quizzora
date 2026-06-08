import Link from "next/link";
import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "../lib/operator.js";

export default function SiteFooter() {
  const region = process.env.DATA_REGION_LABEL || "Australia (operator-hosted on-premises)";

  return (
    <footer className="site-footer">
      <p className="muted">
        Open-source education platform (AGPL-3.0). Student data hosted in {region}. &copy;{" "}
        {new Date().getFullYear()} {OPERATOR_PRODUCT_NAME} — {operatorDisplayLine()}
      </p>
      <div className="row">
        <Link href="/pricing">Pricing</Link>
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
