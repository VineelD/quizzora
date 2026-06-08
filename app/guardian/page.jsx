import Link from "next/link";
import SiteFooter from "../../components/SiteFooter.jsx";
import GuardianProgress from "../../components/GuardianProgress.jsx";

export default async function GuardianPage({ searchParams }) {
  const params = await searchParams;
  const token = params?.token || "";

  return (
    <main className="shell" id="main-content">
      <nav className="nav">
        <Link className="brand" href="/">
          <span className="brand-mark">G</span>
          <span>Guardian view</span>
        </Link>
      </nav>

      <section className="panel">
        <p className="eyebrow">Read-only</p>
        <h1>Student progress</h1>
        <p className="hero-copy">This page shows assignments and scores for your child. Links expire after 72 hours.</p>
      </section>

      <GuardianProgress token={token} />
      <SiteFooter />
    </main>
  );
}
