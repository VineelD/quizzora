import { formatSessionIdentity } from "../lib/session-identity.js";

export default function SessionIdentityBadge({ user }) {
  const identity = formatSessionIdentity(user);
  const contextLine = identity.tenantLine
    ? `${identity.roleLabel} · ${identity.tenantLine}`
    : identity.roleLabel;

  return (
    <div className="session-identity" title={identity.summary}>
      <span className="session-identity-name">{identity.name}</span>
      <span className="session-identity-context">{contextLine}</span>
    </div>
  );
}
