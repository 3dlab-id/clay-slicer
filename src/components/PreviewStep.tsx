import { type KeyboardEvent, useEffect, useState } from "react";
import type { MachinePreset } from "../machines";
import type { ModelAsset } from "../model-analysis";
import type { SliceResult, WorkflowState } from "../workflow";
import { ModelPreview } from "./ModelPreview";
import { ToolpathPreview } from "./ToolpathPreview";
import { EngineLog } from "./EngineLog";
import { StatsPanel } from "./StatsPanel";
import { WarningsPanel } from "./WarningsPanel";

type PreviewTab = "model" | "toolpath";

function hasDrawableToolpath(result: SliceResult | null): boolean {
  return Boolean(result?.toolpath?.layers.some((layer) => layer.length > 0));
}

export function PreviewStep({
  asset,
  preset,
  result,
  workflowState,
  stale,
  sliceError,
  log,
  canSlice,
  modelFitError,
  onSlice,
  onDownloadStep,
}: {
  asset: ModelAsset;
  preset: MachinePreset;
  result: SliceResult | null;
  workflowState: WorkflowState;
  stale: boolean;
  sliceError: string | null;
  log: string[];
  canSlice: boolean;
  modelFitError: boolean;
  onSlice(): void;
  onDownloadStep(): void;
}) {
  const toolpathAvailable = hasDrawableToolpath(result);
  const [tab, setTab] = useState<PreviewTab>("model");

  useEffect(() => {
    if (!toolpathAvailable && tab === "toolpath") setTab("model");
  }, [tab, toolpathAvailable]);

  const hasFitError = result?.warnings.some(
    ({ id }) => id === "fit-footprint" || id === "fit-height",
  ) ?? modelFitError;

  const selectTab = (nextTab: PreviewTab) => {
    if (nextTab === "toolpath" && !toolpathAvailable) return;
    setTab(nextTab);
    document.getElementById(`preview-tab-${nextTab}`)?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const enabledTabs: PreviewTab[] = toolpathAvailable ? ["model", "toolpath"] : ["model"];
    const currentIndex = enabledTabs.indexOf(tab);
    let nextIndex: number | undefined;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") nextIndex = (currentIndex + 1) % enabledTabs.length;
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") nextIndex = (currentIndex - 1 + enabledTabs.length) % enabledTabs.length;
    if (event.key === "Home") nextIndex = 0;
    if (event.key === "End") nextIndex = enabledTabs.length - 1;
    if (nextIndex === undefined) return;
    event.preventDefault();
    selectTab(enabledTabs[nextIndex]!);
  };

  return (
    <section className="step-panel" aria-labelledby="preview-heading">
      <div className="step-heading-row">
        <div>
          <h2 id="preview-heading" tabIndex={-1}>Preview the Slice</h2>
          <p>Review model fit, estimated output, and printable toolpaths.</p>
        </div>
        {result && !stale && (
          <button type="button" onClick={onDownloadStep}>Continue to Download</button>
        )}
      </div>

      <p className={workflowState === "slicing" ? "progress status-region" : "status-region"}
        role="status" aria-live="polite">
        {workflowState === "slicing" ? "Slicing model…" : ""}
      </p>
      {stale && (
        <div role="alert" className="alert warning">
          <strong>Preview out of date.</strong> This result is no longer current. Finish or retry
          slicing before download.
        </div>
      )}
      {sliceError && <p role="alert" className="alert error">{sliceError}</p>}
      {(stale || workflowState === "sliceError") && (
        <button className="primary compact" type="button" data-slice-retry disabled={!canSlice} onClick={onSlice}>
          Re-slice model
        </button>
      )}

      {result ? (
        <>
          <div className="preview-tabs" role="tablist" aria-label="Preview type">
            <button id="preview-tab-model" type="button" role="tab"
              aria-selected={tab === "model"} aria-controls="preview-panel"
              tabIndex={tab === "model" ? 0 : -1} onKeyDown={handleTabKeyDown}
              onClick={() => selectTab("model")}>Model</button>
            <button id="preview-tab-toolpath" type="button" role="tab"
              aria-selected={tab === "toolpath"} aria-controls="preview-panel"
              tabIndex={tab === "toolpath" ? 0 : -1} disabled={!toolpathAvailable}
              onKeyDown={handleTabKeyDown} onClick={() => selectTab("toolpath")}>Toolpath</button>
          </div>
          {!toolpathAvailable && (
            <p className="alert warning" role="status" aria-live="polite">
              Toolpath preview unavailable: {result.toolpathError ?? "no drawable extrusion moves were found"}.
              Model preview, estimates, and G-code remain available.
            </p>
          )}
          <div id="preview-panel" role="tabpanel" className="preview-pane"
            aria-labelledby={`preview-tab-${tab}`} tabIndex={0}>
            {tab === "model" ? (
              <ModelPreview geometry={asset.geometry} preset={preset}
                fitStatus={hasFitError ? "does-not-fit" : "fits"} />
            ) : result.toolpath ? (
              <ToolpathPreview toolpath={result.toolpath} bed={preset.bed} />
            ) : null}
          </div>
          <div className="result-panels">
            <StatsPanel stats={result.stats} />
            <WarningsPanel warnings={result.warnings} />
          </div>
        </>
      ) : workflowState !== "slicing" ? (
        <ModelPreview geometry={asset.geometry} preset={preset} fitStatus="fits" />
      ) : null}
      <EngineLog messages={log} />
    </section>
  );
}
