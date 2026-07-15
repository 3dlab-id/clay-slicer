import type { WizardStep } from "../workflow";

const STEPS: readonly { id: WizardStep; label: string }[] = [
  { id: "upload", label: "Upload" },
  { id: "configure", label: "Configure" },
  { id: "preview", label: "Preview" },
  { id: "download", label: "Download" },
];

export function WizardSteps({
  current,
  canAccess,
  onSelect,
}: {
  current: WizardStep;
  canAccess(step: WizardStep): boolean;
  onSelect(step: WizardStep): void;
}) {
  return (
    <nav className="wizard-nav" aria-label="Slicing steps">
      <ol>
        {STEPS.map((step, index) => (
          <li key={step.id}>
            <button
              type="button"
              className={current === step.id ? "active" : ""}
              aria-current={current === step.id ? "step" : undefined}
              disabled={!canAccess(step.id)}
              onClick={() => onSelect(step.id)}
            >
              <span aria-hidden="true">{index + 1}</span>
              {step.label}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
