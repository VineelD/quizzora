"use client";

import Link from "next/link";

export default function AdminOnboarding({ snapshot }) {
  const steps = [
    {
      id: "billing",
      title: "Confirm subscription or trial",
      detail: snapshot.billingActive
        ? `Plan active (${snapshot.billingStatus}).`
        : "Start or renew billing so teachers and students can access the portal.",
      done: snapshot.billingActive,
      href: "/admin/billing",
      action: "Open billing",
    },
    {
      id: "teachers",
      title: "Add at least one teacher",
      detail: snapshot.teacherCount
        ? `${snapshot.teacherCount} teacher account(s) on file.`
        : "Create a teacher account or share your school join code.",
      done: snapshot.teacherCount > 0,
      href: "#staff",
      action: "Add teacher below",
    },
    {
      id: "students",
      title: "Enrol students",
      detail: snapshot.studentCount
        ? `${snapshot.studentCount} student(s) enrolled.`
        : "Add students here in the educator console, or have teachers sign in with their own accounts.",
      done: snapshot.studentCount > 0,
      href: "/teacher",
      action: "Open educator console",
    },
    {
      id: "quiz",
      title: "Assign the first quiz",
      detail: snapshot.assignmentCount
        ? `${snapshot.assignmentCount} assignment(s) created.`
        : "Generate or reuse a quiz and assign it to a year group.",
      done: snapshot.assignmentCount > 0,
      href: "/teacher",
      action: "Create assignment",
    },
  ];

  const completed = steps.filter((step) => step.done).length;
  const allDone = completed === steps.length;

  if (allDone) {
    return (
      <section className="panel onboarding-panel onboarding-complete">
        <p className="eyebrow">Onboarding</p>
        <h2>School setup complete</h2>
        <p className="muted">Your core setup steps are done. Export data anytime from School data below.</p>
      </section>
    );
  }

  return (
    <section className="panel onboarding-panel">
      <div className="row between">
        <div>
          <p className="eyebrow">Getting started</p>
          <h2>Onboarding checklist</h2>
          <p className="muted">
            {completed} of {steps.length} steps complete — finish these to launch with your first class.
          </p>
        </div>
        <span className="tag">{completed}/{steps.length}</span>
      </div>

      <ol className="onboarding-steps">
        {steps.map((step, index) => (
          <li key={step.id} className={step.done ? "onboarding-step done" : "onboarding-step"}>
            <span className="onboarding-step-index" aria-hidden="true">
              {step.done ? "✓" : index + 1}
            </span>
            <div className="onboarding-step-body">
              <strong>{step.title}</strong>
              <p className="muted">{step.detail}</p>
              {!step.done ? (
                step.href.startsWith("#") ? (
                  <a className="button secondary" href={step.href}>
                    {step.action}
                  </a>
                ) : (
                  <Link className="button secondary" href={step.href}>
                    {step.action}
                  </Link>
                )
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
