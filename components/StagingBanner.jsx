import { isStagingEnvironment, stagingLabel } from "../lib/app-env.js";
import { isStagingGateEnabled } from "../lib/staging-gate.js";

export default function StagingBanner() {
  if (!isStagingEnvironment()) {
    return null;
  }

  return (
    <div className="staging-banner" role="status">
      <strong>{stagingLabel()}</strong>
      {isStagingGateEnabled() ? <span>Tester access required.</span> : null}
      <span>Stripe test mode — no real charges. Data may be reset from production.</span>
    </div>
  );
}
