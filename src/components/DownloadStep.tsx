import type { SliceResult } from "../workflow";
import { StatsPanel } from "./StatsPanel";
import { WarningsPanel } from "./WarningsPanel";

export function DownloadStep({
  result,
  filename,
  canDownload,
  onDownload,
}: {
  result: SliceResult;
  filename: string;
  canDownload: boolean;
  onDownload(): void;
}) {
  return (
    <section className="step-panel download-step" aria-labelledby="download-heading">
      <h2 id="download-heading">Download clay G-code</h2>
      <p>Review the final checks before saving <strong>{filename}</strong>.</p>
      <div className="result-panels">
        <StatsPanel stats={result.stats} />
        <WarningsPanel warnings={result.warnings} />
      </div>
      <button className="primary" type="button" disabled={!canDownload} onClick={onDownload}>
        Download G-code
      </button>
      {!canDownload && (
        <p className="alert warning">Download is unavailable until all blocking checks are resolved.</p>
      )}
    </section>
  );
}
