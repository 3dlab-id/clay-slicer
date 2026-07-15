import type { SliceResult } from "../workflow";
import { StatsPanel } from "./StatsPanel";
import { WarningsPanel } from "./WarningsPanel";

export function DownloadStep({
  result,
  filename,
  canDownload,
  fitAcknowledged,
  onFitAcknowledged,
  onDownload,
}: {
  result: SliceResult;
  filename: string;
  canDownload: boolean;
  fitAcknowledged: boolean;
  onFitAcknowledged(acknowledged: boolean): void;
  onDownload(): void;
}) {
  const fitWarnings = result.warnings.filter(
    ({ id }) => id === "fit-footprint" || id === "fit-height",
  );
  return (
    <section className="step-panel download-step" aria-labelledby="download-heading">
      <h2 id="download-heading" tabIndex={-1}>Download Clay G-code</h2>
      <p>Review the final checks before saving <strong className="filename">{filename}</strong>.</p>
      <div className="result-panels">
        <StatsPanel stats={result.stats} />
        <WarningsPanel warnings={result.warnings} />
      </div>
      {fitWarnings.length > 0 && (
        <fieldset className="fit-acknowledgement">
          <legend>Oversized Model Acknowledgement</legend>
          <ul>
            {fitWarnings.map((warning) => <li key={warning.id}>{warning.message}</li>)}
          </ul>
          <label className="checkbox-row">
            <input
              type="checkbox"
              name="fitAcknowledged"
              checked={fitAcknowledged}
              onChange={(event) => onFitAcknowledged(event.target.checked)}
            />
            I understand this model exceeds the selected build volume and want to download it anyway.
          </label>
        </fieldset>
      )}
      <button className="primary" type="button" disabled={!canDownload}
        aria-describedby={!canDownload ? "download-blocking-reason" : undefined}
        onClick={onDownload}>
        Download G-code
      </button>
      <p id="download-blocking-reason" role="status" aria-live="polite"
        className={!canDownload ? "alert warning" : "status-region"}>
        {!canDownload ? "Download is unavailable until all blocking checks are resolved." : ""}
      </p>
    </section>
  );
}
