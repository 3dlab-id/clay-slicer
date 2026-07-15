import type { Warning } from "../domain";

const SEVERITY_LABEL = {
  error: "Error",
  warn: "Warning",
  info: "Information",
} as const;

export function WarningsPanel({ warnings }: { warnings: Warning[] }) {
  if (warnings.length === 0) {
    return <p className="success-note">No feasibility warnings found.</p>;
  }
  return (
    <section className="warnings" aria-label="Feasibility warnings">
      <h3>Feasibility checks</h3>
      <ul>
        {warnings.map((warning) => (
          <li key={warning.id} className={`warning ${warning.severity}`}>
            <strong>{SEVERITY_LABEL[warning.severity]}: {warning.title}</strong>
            <span>{warning.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
