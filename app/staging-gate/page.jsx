import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import StagingGateForm from "../../components/StagingGateForm.jsx";
import { OPERATOR_PRODUCT_NAME } from "../../lib/operator.js";
import { stagingLabel } from "../../lib/app-env.js";
import {
  isStagingGateEnabled,
  STAGING_GATE_COOKIE,
  STAGING_GATE_COOKIE_VALUE,
} from "../../lib/staging-gate.js";

function safeNextPath(value) {
  const path = String(value || "/").trim();
  if (!path.startsWith("/") || path.startsWith("//")) {
    return "/";
  }
  return path;
}

export default async function StagingGatePage({ searchParams }) {
  if (!isStagingGateEnabled()) {
    redirect("/");
  }

  const cookieStore = await cookies();
  const params = await searchParams;
  const nextPath = safeNextPath(params?.next);

  if (cookieStore.get(STAGING_GATE_COOKIE)?.value === STAGING_GATE_COOKIE_VALUE) {
    redirect(nextPath);
  }

  return (
    <main className="shell landing-shell" id="main-content">
      <nav className="nav landing-nav">
        <a className="brand" href="/staging-gate">
          <span className="brand-mark" aria-hidden="true">
            <img className="brand-logo" src="/brand/quizzora-logo.svg" alt="" width="28" height="28" />
          </span>
          <span>{OPERATOR_PRODUCT_NAME}</span>
        </a>
        <span className="tag nav-tag">{stagingLabel()}</span>
      </nav>

      <section className="panel staging-gate-panel">
        <StagingGateForm nextPath={nextPath} />
      </section>
    </main>
  );
}
