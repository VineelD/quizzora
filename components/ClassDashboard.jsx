import { formatDueLabel } from "../lib/dates.js";

function formatActivity(value) {
  if (!value) {
    return "No activity yet";
  }
  return formatDueLabel(value);
}

export default function ClassDashboard({ classes }) {
  if (!classes.length) {
    return null;
  }

  return (
    <section className="panel">
      <div>
        <p className="eyebrow">Class overview</p>
        <h2 className="section-title">Progress by year group</h2>
        <p className="muted">Not started, in progress, and submitted counts are per student–assignment slot.</p>
      </div>

      <div className="grid">
        {classes.map((item) => (
          <article className="card dashboard-card" key={item.class_id}>
            <div className="row between">
              <h3 className="panel-title">{item.class_name}</h3>
              <span className="tag">{item.student_count} students</span>
            </div>
            <div className="grid-3 compact-metrics">
              <div className="metric">
                <strong>{item.not_started_count || 0}</strong>
                <span>Not started</span>
              </div>
              <div className="metric">
                <strong>{item.in_progress_count || 0}</strong>
                <span>In progress</span>
              </div>
              <div className="metric">
                <strong>{item.submitted_count || 0}</strong>
                <span>Submitted</span>
              </div>
            </div>
            <p className="muted">
              {item.assignment_count || 0} assignments · Average {item.average_percent || 0}% · Last activity{" "}
              {formatActivity(item.last_activity_at)}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
