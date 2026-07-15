import type { ClayControls } from "../clay-profile";
import type { Warning } from "../domain";
import type { MachinePreset } from "../machines";
import type { ModelAsset } from "../model-analysis";
import type { EngineState } from "../workflow";
import { ModelPreview } from "./ModelPreview";
import { WarningsPanel } from "./WarningsPanel";

function bedLabel(preset: MachinePreset): string {
  const { bed } = preset;
  return bed.shape === "rect"
    ? `${bed.width} × ${bed.depth} × ${bed.maxHeight} mm rectangular bed`
    : `Ø${bed.diameter} × ${bed.maxHeight} mm circular bed`;
}

export function ConfigureStep({
  asset,
  fileName,
  fileSize,
  presets,
  preset,
  controls,
  warnings,
  engineState,
  engineError,
  showHugePreview,
  isSlicing,
  hasPriorSlice,
  previewStale,
  onApproveHugePreview,
  onMachineChange,
  onControlsChange,
  onRetryEngine,
  onSlice,
}: {
  asset: ModelAsset;
  fileName: string;
  fileSize: number;
  presets: readonly MachinePreset[];
  preset: MachinePreset;
  controls: ClayControls;
  warnings: Warning[];
  engineState: EngineState;
  engineError: string | null;
  showHugePreview: boolean;
  isSlicing: boolean;
  hasPriorSlice: boolean;
  previewStale: boolean;
  onApproveHugePreview(): void;
  onMachineChange(id: string): void;
  onControlsChange(controls: ClayControls): void;
  onRetryEngine(): void;
  onSlice(): void;
}) {
  const update = <K extends keyof ClayControls>(key: K, value: ClayControls[K]) => {
    onControlsChange({ ...controls, [key]: value });
  };
  const hasFitError = warnings.some(({ id }) => id === "fit-footprint" || id === "fit-height");

  return (
    <section className="step-panel configure-layout" aria-labelledby="configure-heading">
      <div>
        <h2 id="configure-heading" tabIndex={-1}>Configure the Clay Print</h2>
        <p className="seed-note">Machine presets are calibration seeds. Verify settings on your printer.</p>
        <div className="model-summary compact-summary">
          <strong>{fileName}</strong>
          <span>{(fileSize / 1024).toFixed(1)} KB · {asset.analysis.triangleCount.toLocaleString()} triangles</span>
        </div>
        <label htmlFor="machine-preset">Clay printer</label>
        <select
          id="machine-preset"
          name="machineId"
          autoComplete="off"
          value={preset.id}
          onChange={(event) => onMachineChange(event.target.value)}
        >
          {presets.map((machine) => <option key={machine.id} value={machine.id}>{machine.name}</option>)}
        </select>
        <p><strong>{bedLabel(preset)}</strong> · {preset.nozzleDiameter.toFixed(1)} mm nozzle</p>
        <p>{preset.description}</p>
        <p>
          Model dimensions: {asset.analysis.bounds.size.x.toFixed(2)} ×
          {" "}{asset.analysis.bounds.size.y.toFixed(2)} ×
          {" "}{asset.analysis.bounds.size.z.toFixed(2)} mm
        </p>

        <div className="control-grid">
          <label htmlFor="layer-height">Layer height <output>{controls.layerHeight.toFixed(2)} mm</output></label>
          <input id="layer-height" name="layerHeight" autoComplete="off" type="range" min="0.3" max="2" step="0.05"
            value={controls.layerHeight} onChange={(event) => update("layerHeight", Number(event.target.value))} />
          <label htmlFor="line-width">Line width <output>{controls.lineWidth.toFixed(2)} mm</output></label>
          <input id="line-width" name="lineWidth" autoComplete="off" type="range" min="0.8" max="3" step="0.05"
            value={controls.lineWidth} onChange={(event) => update("lineWidth", Number(event.target.value))} />
          <label htmlFor="print-speed">Print speed <output>{controls.printSpeed} mm/s</output></label>
          <input id="print-speed" name="printSpeed" autoComplete="off" type="range" min="5" max="60" step="1"
            value={controls.printSpeed} onChange={(event) => update("printSpeed", Number(event.target.value))} />
          <label className="checkbox-row">
            <input type="checkbox" name="vaseMode" checked={controls.vaseMode}
              onChange={(event) => update("vaseMode", event.target.checked)} />
            Vase mode (continuous single wall)
          </label>
        </div>

        <p className="status-region" role="status" aria-live="polite">
          {engineState === "loading" ? "Loading slicing engine…" : ""}
        </p>
        {engineState === "failed" && (
          <div role="alert" className="alert error">
            <p>{engineError}</p>
            <button type="button" data-engine-retry onClick={onRetryEngine}>Retry engine</button>
          </div>
        )}
        {previewStale && (
          <p role="alert" className="alert warning">
            Preview out of date. Re-slice with the current machine and settings before download.
          </p>
        )}
        <button className="primary" type="button"
          disabled={engineState !== "ready" || isSlicing || (asset.analysis.isHuge && !showHugePreview)}
          onClick={onSlice}>
          {isSlicing ? "Slicing…" : hasPriorSlice ? "Re-slice model" : "Slice model"}
        </button>
        <WarningsPanel warnings={warnings} />
      </div>

      <div className="preview-card">
        {asset.analysis.isHuge && !showHugePreview ? (
          <div className="large-model-gate">
            <h3>Large model preview paused</h3>
            <p>Rendering {asset.analysis.triangleCount.toLocaleString()} triangles may slow this device.</p>
            <button type="button" onClick={onApproveHugePreview}>Continue with large model</button>
          </div>
        ) : (
          <ModelPreview
            geometry={asset.geometry}
            preset={preset}
            fitStatus={hasFitError ? "does-not-fit" : "fits"}
          />
        )}
      </div>
    </section>
  );
}
