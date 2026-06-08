import Link from "next/link";

import SiteFooter from "../../../components/SiteFooter.jsx";

import { DATA_HOSTING_REGION, getDataHostingParagraphs } from "../../../lib/data-hosting.js";

import {

  OPERATOR_CONTACT_EMAIL,

  OPERATOR_PRODUCT_NAME,

  operatorDisplayLine,

} from "../../../lib/operator.js";



export default function PrivacyPage() {

  const hostingParagraphs = getDataHostingParagraphs();



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

        <h1>Privacy policy</h1>

        <p className="hero-copy">

          Last updated: June 2026. This policy applies to schools using {OPERATOR_PRODUCT_NAME}, operated by{" "}

          {operatorDisplayLine()}.

        </p>



        <h2>Who we are</h2>

        <p>

          {OPERATOR_PRODUCT_NAME} ({operatorDisplayLine()}). Support and privacy:{" "}

          <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a>.

        </p>



        <h2>What we collect</h2>

        <p>

          Account details (name, email, username), class and assessment data, quiz responses, and optional guardian

          contact information.

        </p>



        <h2>Why we collect it</h2>

        <p>To provide curriculum-aligned assessments, teacher reporting, and secure access for students and staff at your school.</p>



        <h2>Subprocessors</h2>

        <p>

          We use third-party services only where necessary to operate the platform: Stripe for payment processing, email

          delivery (for example Resend or configured SMTP) for transactional messages, and OpenAI for AI quiz generation

          and study features. Data is sent to these providers only to perform the relevant function. Some providers may

          process data outside Australia. We take reasonable steps to protect personal information when using these

          services. We do not sell personal information to third parties for marketing purposes.

        </p>



        <h2>Where data is stored</h2>

        {hostingParagraphs.map((paragraph) => (

          <p key={paragraph.slice(0, 48)}>{paragraph}</p>

        ))}

        <p>

          Schools should confirm that on-premises hosting in {DATA_HOSTING_REGION} meets their own privacy and

          jurisdiction requirements.

        </p>



        <h2>How we safeguard data</h2>

        <p>

          No method of transmission or storage is completely secure. We cannot guarantee absolute security, but we work

          to protect information using measures appropriate to the nature of the data and the service.

        </p>



        <h2>Retention</h2>

        <p>

          Schools may request export or deletion of student accounts. Assessment records are retained while the account is

          active unless the school requests removal. See our <Link href="/legal/data-retention">data retention</Link>{" "}

          page.

        </p>



        <h2>Payments (Stripe)</h2>

        <p>

          {OPERATOR_PRODUCT_NAME} processes school subscriptions using{" "}

          <a href="https://stripe.com/checkout" target="_blank" rel="noreferrer">

            Stripe Checkout

          </a>{" "}

          and manages billing through{" "}

          <a href="https://stripe.com/payments/customer-portal" target="_blank" rel="noreferrer">

            Stripe Customer Portal

          </a>

          . We do not store or process raw card details (PAN) on our servers. PCI compliance for hosted card collection

          is handled by Stripe.

        </p>



        <h2>Contact</h2>

        <p>

          For privacy requests, contact your school administrator or email{" "}

          <a href={`mailto:${OPERATOR_CONTACT_EMAIL}`}>{OPERATOR_CONTACT_EMAIL}</a>.

        </p>

      </section>



      <SiteFooter />

    </main>

  );

}

