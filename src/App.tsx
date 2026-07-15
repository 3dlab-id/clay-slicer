import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { clayProcess, type ClayControls } from "./clay-profile";
import { ConfigureStep } from "./components/ConfigureStep";
import { DownloadStep } from "./components/DownloadStep";
import { PreviewStep } from "./components/PreviewStep";
import { UploadStep } from "./components/UploadStep";
import { WizardSteps } from "./components/WizardSteps";
import { buildGcodeFilename, downloadGcode } from "./download";
import { getGcodeStats } from "./gcode-stats";
import { evaluateGuardrails, evaluateModelGuardrails } from "./guardrails";
import { loadKiri } from "./kiri-loader";
import { sliceToGcode } from "./kiri";
import { getMachinePreset, machinePresets } from "./machines";
import {
  disposeModelAsset,
  parseAndAnalyzeStl,
  type ModelAsset,
} from "./model-analysis";
import { parseToolpath } from "./gcode-toolpath";
import {
  canAccessStep,
  canDownload,
  canSlice,
  createInitialWorkflowStore,
  hasCurrentSlice,
  isSliceStale,
  workflowReducer,
  type UploadedModel,
} from "./workflow";

const INITIAL_PRESET = machinePresets[0]!;
const ENGINE_LOG_LIMIT = 50;
const STEP_HEADING_ID = {
  upload: "upload-heading",
  configure: "configure-heading",
  preview: "preview-heading",
  download: "download-heading",
} as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function App() {
  const [state, dispatch] = useReducer(
    workflowReducer<ModelAsset>,
    undefined,
    () => createInitialWorkflowStore<ModelAsset>({
      machineId: INITIAL_PRESET.id,
      controls: { ...INITIAL_PRESET.defaultControls },
    }),
  );
  const [hugePreviewApproved, setHugePreviewApproved] = useState(false);
  const [uploading, setUploading] = useState(false);
  const assetRef = useRef<ModelAsset | null>(null);
  const uploadGeneration = useRef(0);
  const sliceGeneration = useRef(0);
  const mounted = useRef(true);
  const pendingStepFocus = useRef<keyof typeof STEP_HEADING_ID | null>(null);
  const pendingEngineRetryFocus = useRef(false);
  const pendingSliceRetryFocus = useRef(false);
  const preset = getMachinePreset(state.machineId) ?? INITIAL_PRESET;
  const preSliceWarnings = useMemo(() => state.model
    ? evaluateModelGuardrails({
      model: state.model.asset.analysis,
      preset,
      controls: state.controls,
    })
    : [], [preset, state.controls, state.model]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      uploadGeneration.current += 1;
      if (assetRef.current) disposeModelAsset(assetRef.current);
      assetRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void loadKiri({ retry: state.engineRetryGeneration > 0 }).then(
      () => { if (active) dispatch({ type: "engineReady" }); },
      (error: unknown) => {
        if (active) dispatch({ type: "engineFailed", error: errorMessage(error) });
      },
    );
    return () => { active = false; };
  }, [state.engineRetryGeneration]);

  useEffect(() => {
    if (pendingStepFocus.current !== state.step) return;
    document.getElementById(STEP_HEADING_ID[state.step])?.focus();
    pendingStepFocus.current = null;
  }, [state.step]);

  useEffect(() => {
    if (state.engineState === "failed" && pendingEngineRetryFocus.current) {
      document.querySelector<HTMLElement>("[data-engine-retry]")?.focus();
      pendingEngineRetryFocus.current = false;
    } else if (state.engineState === "ready") {
      pendingEngineRetryFocus.current = false;
    }
  }, [state.engineState]);

  useEffect(() => {
    if (state.sliceError && pendingSliceRetryFocus.current) {
      document.querySelector<HTMLElement>("[data-slice-retry]")?.focus();
      pendingSliceRetryFocus.current = false;
    }
  }, [state.sliceError]);

  async function handleFile(file: File) {
    const generation = ++uploadGeneration.current;
    if (assetRef.current) disposeModelAsset(assetRef.current);
    assetRef.current = null;
    setHugePreviewApproved(false);
    setUploading(true);
    dispatch({ type: "uploadStarted" });

    try {
      const buffer = await file.arrayBuffer();
      const asset = parseAndAnalyzeStl(buffer, file.size);
      if (!mounted.current || generation !== uploadGeneration.current) {
        disposeModelAsset(asset);
        return;
      }

      assetRef.current = asset;
      setHugePreviewApproved(!asset.analysis.isHuge);
      const model: UploadedModel<ModelAsset> = {
        file: { name: file.name, size: file.size, type: file.type },
        buffer,
        asset,
      };
      pendingStepFocus.current = "configure";
      dispatch({ type: "uploadSucceeded", model });
    } catch (error) {
      if (mounted.current && generation === uploadGeneration.current) {
        dispatch({ type: "uploadFailed", error: errorMessage(error) });
      }
    } finally {
      if (mounted.current && generation === uploadGeneration.current) setUploading(false);
    }
  }

  function handleMachineChange(machineId: string) {
    const nextPreset = getMachinePreset(machineId);
    if (!nextPreset) return;
    dispatch({
      type: "machineChanged",
      machineId,
      controls: { ...nextPreset.defaultControls },
    });
  }

  function handleControlsChange(controls: ClayControls) {
    dispatch({ type: "controlsChanged", controls });
  }

  async function handleSlice() {
    const model = state.model;
    if (!model || !canSlice(state)) return;
    const requestId = `slice-${++sliceGeneration.current}`;
    const revision = state.inputRevision;
    const selectedPreset = preset;
    const controls = { ...state.controls };
    pendingSliceRetryFocus.current = state.workflowState === "sliceError" || isSliceStale(state);
    pendingStepFocus.current = "preview";
    dispatch({ type: "sliceStarted", requestId, revision });

    try {
      const gcode = await sliceToGcode({
        stl: model.buffer,
        device: selectedPreset.device,
        process: clayProcess(controls, selectedPreset.processDefaults),
        onLog: (message) => dispatch({
          type: "sliceLogAdded",
          requestId,
          message,
          limit: ENGINE_LOG_LIMIT,
        }),
      });
      const stats = getGcodeStats(gcode);
      const warnings = evaluateGuardrails({
        model: model.asset.analysis,
        preset: selectedPreset,
        controls,
        stats,
      });
      let toolpath;
      let toolpathError: string | undefined;
      try {
        const parsed = parseToolpath(gcode, { layerHeightHint: controls.layerHeight });
        if (parsed.layers.some((layer) => layer.length > 0)) toolpath = parsed;
        else toolpathError = "No drawable extrusion moves were found.";
      } catch (error) {
        toolpathError = errorMessage(error);
      }

      dispatch({
        type: "sliceSucceeded",
        requestId,
        revision,
        result: {
          revision,
          gcode,
          stats,
          warnings,
          toolpath,
          toolpathError,
        },
      });
      pendingSliceRetryFocus.current = false;
    } catch (error) {
      dispatch({ type: "sliceFailed", requestId, revision, error: errorMessage(error) });
    }
  }

  const stale = isSliceStale(state);
  const currentResult = hasCurrentSlice(state) ? state.sliceResult : null;
  const filename = buildGcodeFilename(state.model?.file.name ?? "model", state.machineId);
  const downloadAllowed = Boolean(currentResult?.gcode.trim()) && canDownload(state);

  function navigateTo(step: keyof typeof STEP_HEADING_ID) {
    if (!canAccessStep(state, step)) return;
    pendingStepFocus.current = step;
    dispatch({ type: "stepRequested", step });
  }

  function retryEngine() {
    pendingEngineRetryFocus.current = true;
    dispatch({ type: "engineRetry" });
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className="app-header">
        <div>
          <p className="eyebrow">3D Lab Bali</p>
          <h1>Clay Slicer</h1>
          <p>Prepare cold-extrusion clay G-code entirely in your browser.</p>
        </div>
        <span className={`engine-status ${state.engineState}`} aria-live="polite">
          Engine {state.engineState}
        </span>
      </header>

      <WizardSteps
        current={state.step}
        canAccess={(step) => canAccessStep(state, step)}
        onSelect={navigateTo}
      />

      <main id="main-content">
        {state.step === "upload" && (
          <UploadStep model={state.model} error={state.uploadError} loading={uploading} onFile={handleFile} />
        )}
        {state.step === "configure" && state.model && (
          <ConfigureStep
            asset={state.model.asset}
            fileName={state.model.file.name}
            fileSize={state.model.file.size}
            presets={machinePresets}
            preset={preset}
            controls={state.controls}
            warnings={preSliceWarnings}
            engineState={state.engineState}
            engineError={state.engineError}
            showHugePreview={hugePreviewApproved}
            isSlicing={state.workflowState === "slicing"}
            hasPriorSlice={state.sliceResult !== null}
            previewStale={stale}
            onApproveHugePreview={() => setHugePreviewApproved(true)}
            onMachineChange={handleMachineChange}
            onControlsChange={handleControlsChange}
            onRetryEngine={retryEngine}
            onSlice={handleSlice}
          />
        )}
        {state.step === "preview" && state.model && (
          <PreviewStep
            asset={state.model.asset}
            preset={preset}
            result={state.sliceResult}
            workflowState={state.workflowState}
            stale={stale}
            sliceError={state.sliceError}
            log={state.sliceLog}
            canSlice={canSlice(state)}
            modelFitError={preSliceWarnings.some(
              ({ id }) => id === "fit-footprint" || id === "fit-height",
            )}
            onSlice={handleSlice}
            onDownloadStep={() => navigateTo("download")}
          />
        )}
        {state.step === "download" && currentResult && state.model && (
          <DownloadStep
            result={currentResult}
            filename={filename}
            canDownload={downloadAllowed}
            fitAcknowledged={state.fitAcknowledgedRevision === currentResult.revision}
            onFitAcknowledged={(acknowledged) => dispatch({
              type: "fitAcknowledged",
              acknowledged,
            })}
            onDownload={() => downloadGcode({
              gcode: currentResult.gcode,
              modelName: state.model!.file.name,
              machineId: state.machineId,
            })}
          />
        )}
      </main>

      <footer>
        Presets are starting points for calibration. Confirm output on your clay printer before use.
      </footer>
    </div>
  );
}
