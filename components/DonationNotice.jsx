import { getDonationCapLabel, getDonationShortMessage, isDonationConfigured, DONATION_URL } from "../lib/donation.js";

export default function DonationNotice({ className = "panel donation-notice", showLink = true }) {
  return (
    <section className={className}>
      <p className="eyebrow">Voluntary support</p>
      <h2>Free for schools and families</h2>
      <p className="hero-copy">{getDonationShortMessage()}</p>
      <p className="muted">
        Quizzora is run as a voluntary hobby project to help learners understand curriculum concepts — not as a
        commercial service. Hosting and AI costs are covered personally; a small optional contribution helps keep the
        lights on.
      </p>
      {showLink && isDonationConfigured() ? (
        <p className="row">
          <a className="button secondary" href={DONATION_URL} rel="noopener noreferrer" target="_blank">
            Donate up to {getDonationCapLabel()}
          </a>
        </p>
      ) : showLink ? (
        <p className="muted">
          Donation link not configured on this instance. Contact the operator if you would like to contribute.
        </p>
      ) : null}
    </section>
  );
}
