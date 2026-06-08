import Link from "next/link";

import SiteFooter from "../../../components/SiteFooter.jsx";

import { DATA_HOSTING_REGION, getDataHostingParagraphs } from "../../../lib/data-hosting.js";

import { OPERATOR_PRODUCT_NAME, operatorDisplayLine } from "../../../lib/operator.js";



export default function DataRetentionPage() {

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

        <h1>Data retention</h1>

        <p className="hero-copy">

          Last updated: June 2026. Operated by {operatorDisplayLine()}.

        </p>



        <h2>Active accounts</h2>

        <p>

          Student profiles, class memberships, quiz content, and submission results are kept while the student account

          remains active at the school.

        </p>



        <h2>Backups</h2>

        <p>

          {OPERATOR_PRODUCT_NAME} maintains daily encrypted backups of the application database on-premises at the same

          company premises (for example under F:\\QuizzoraBackups\\production). Restore procedures are documented for

          the operations team.

        </p>



        <h2>Deletion</h2>

        <p>

          School administrators may request removal of a student account and associated submissions. Deleted records are

          removed from the live database; backups may retain copies until backup rotation completes.

        </p>



        <h2>Location</h2>

        {hostingParagraphs.map((paragraph) => (

          <p key={paragraph.slice(0, 48)}>{paragraph}</p>

        ))}

        <p>Student data is hosted on-premises in {DATA_HOSTING_REGION}.</p>

      </section>



      <SiteFooter />

    </main>

  );

}

