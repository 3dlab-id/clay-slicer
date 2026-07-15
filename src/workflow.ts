import type { ClayControls } from "./clay-profile";
import type { GcodeStats, Toolpath, Warning } from "./domain";

export type EngineState = "loading" | "ready" | "failed";
export type WorkflowState = "empty" | "modelLoaded" | "slicing" | "sliced" | "sliceError";
export type WizardStep = "upload" | "configure" | "preview" | "download";

export interface SliceResult {
  revision: number;
  gcode: string;
  stats: GcodeStats;
  warnings: Warning[];
  toolpath?: Toolpath;
  toolpathError?: string;
}

export interface UploadedModel<ModelAsset> {
  file: {
    name: string;
    size: number;
    type: string;
  };
  buffer: ArrayBuffer;
  asset: ModelAsset;
}

export interface WorkflowStore<ModelAsset = unknown> {
  engineState: EngineState;
  engineError: string | null;
  engineRetryGeneration: number;
  workflowState: WorkflowState;
  step: WizardStep;
  uploadError: string | null;
  model: UploadedModel<ModelAsset> | null;
  machineId: string;
  controls: ClayControls;
  inputRevision: number;
  sliceResult: SliceResult | null;
  sliceError: string | null;
  sliceLog: string[];
  activeSlice: { requestId: string; revision: number } | null;
  fitAcknowledgedRevision: number | null;
}

export type WorkflowAction<ModelAsset = unknown> =
  | { type: "engineReady" }
  | { type: "engineFailed"; error: string }
  | { type: "engineRetry" }
  | { type: "uploadStarted" }
  | { type: "uploadFailed"; error: string }
  | { type: "uploadSucceeded"; model: UploadedModel<ModelAsset> }
  | { type: "machineChanged"; machineId: string; controls: ClayControls }
  | { type: "controlsChanged"; controls: ClayControls }
  | { type: "sliceStarted"; requestId: string; revision: number }
  | { type: "sliceLogAdded"; requestId: string; message: string; limit?: number }
  | { type: "sliceSucceeded"; requestId: string; revision: number; result: SliceResult }
  | { type: "sliceFailed"; requestId: string; revision: number; error: string }
  | { type: "stepRequested"; step: WizardStep }
  | { type: "fitAcknowledged"; acknowledged: boolean };

export function createInitialWorkflowStore<ModelAsset = unknown>(args: {
  machineId: string;
  controls: ClayControls;
}): WorkflowStore<ModelAsset> {
  return {
    engineState: "loading",
    engineError: null,
    engineRetryGeneration: 0,
    workflowState: "empty",
    step: "upload",
    uploadError: null,
    model: null,
    machineId: args.machineId,
    controls: args.controls,
    inputRevision: 0,
    sliceResult: null,
    sliceError: null,
    sliceLog: [],
    activeSlice: null,
    fitAcknowledgedRevision: null,
  };
}

export function isSliceStale(state: WorkflowStore): boolean {
  return state.sliceResult !== null && (
    state.workflowState !== "sliced" || state.sliceResult.revision !== state.inputRevision
  );
}

export function hasCurrentSlice(state: WorkflowStore): boolean {
  return (
    state.workflowState === "sliced" &&
    state.sliceResult !== null &&
    state.sliceResult.revision === state.inputRevision
  );
}

export function canSlice(state: WorkflowStore): boolean {
  return (
    state.engineState === "ready" &&
    state.model !== null &&
    state.workflowState !== "slicing"
  );
}

export function canAccessStep(state: WorkflowStore, step: WizardStep): boolean {
  if (step === "upload") return true;
  if (step === "configure") return state.model !== null;
  return hasCurrentSlice(state);
}

export function canDownload(state: WorkflowStore): boolean {
  if (!hasCurrentSlice(state)) return false;

  const errors = state.sliceResult!.warnings.filter((warning) => warning.severity === "error");
  const fitErrors = errors.filter(
    (warning) => warning.id === "fit-footprint" || warning.id === "fit-height",
  );
  const blockingErrors = errors.filter(
    (warning) => warning.id !== "fit-footprint" && warning.id !== "fit-height",
  );

  if (blockingErrors.length > 0) return false;
  return (
    fitErrors.length === 0 || state.fitAcknowledgedRevision === state.sliceResult!.revision
  );
}

function controlsEqual(a: ClayControls, b: ClayControls): boolean {
  return (
    a.layerHeight === b.layerHeight &&
    a.lineWidth === b.lineWidth &&
    a.printSpeed === b.printSpeed &&
    a.vaseMode === b.vaseMode
  );
}

function stateAfterInputChange<ModelAsset>(
  state: WorkflowStore<ModelAsset>,
): Pick<
  WorkflowStore<ModelAsset>,
  | "inputRevision"
  | "workflowState"
  | "sliceError"
  | "sliceLog"
  | "activeSlice"
  | "fitAcknowledgedRevision"
> {
  return {
    inputRevision: state.inputRevision + 1,
    workflowState: state.model ? "modelLoaded" : "empty",
    sliceError: null,
    sliceLog: [],
    activeSlice: null,
    fitAcknowledgedRevision: null,
  };
}

function matchesActiveSlice<ModelAsset>(
  state: WorkflowStore<ModelAsset>,
  requestId: string,
  revision: number,
): boolean {
  return (
    state.activeSlice?.requestId === requestId &&
    state.activeSlice.revision === revision &&
    state.inputRevision === revision
  );
}

export function workflowReducer<ModelAsset>(
  state: WorkflowStore<ModelAsset>,
  action: WorkflowAction<ModelAsset>,
): WorkflowStore<ModelAsset> {
  switch (action.type) {
    case "engineReady":
      return { ...state, engineState: "ready", engineError: null };
    case "engineFailed":
      return { ...state, engineState: "failed", engineError: action.error };
    case "engineRetry":
      return {
        ...state,
        engineState: "loading",
        engineError: null,
        engineRetryGeneration: state.engineRetryGeneration + 1,
      };
    case "uploadStarted":
      return {
        ...state,
        workflowState: "empty",
        step: "upload",
        uploadError: null,
        model: null,
        inputRevision: state.inputRevision + 1,
        sliceResult: null,
        sliceError: null,
        sliceLog: [],
        activeSlice: null,
        fitAcknowledgedRevision: null,
      };
    case "uploadFailed":
      return { ...state, step: "upload", uploadError: action.error };
    case "uploadSucceeded":
      return {
        ...state,
        model: action.model,
        workflowState: "modelLoaded",
        step: "configure",
        uploadError: null,
        inputRevision: state.inputRevision + 1,
        sliceResult: null,
        sliceError: null,
        sliceLog: [],
        activeSlice: null,
        fitAcknowledgedRevision: null,
      };
    case "machineChanged":
      if (action.machineId === state.machineId && controlsEqual(action.controls, state.controls)) {
        return state;
      }
      return {
        ...state,
        machineId: action.machineId,
        controls: action.controls,
        ...stateAfterInputChange(state),
      };
    case "controlsChanged":
      if (controlsEqual(action.controls, state.controls)) return state;
      return {
        ...state,
        controls: action.controls,
        ...stateAfterInputChange(state),
      };
    case "sliceStarted":
      if (action.revision !== state.inputRevision || !canSlice(state)) return state;
      return {
        ...state,
        workflowState: "slicing",
        step: "preview",
        sliceError: null,
        sliceLog: [],
        activeSlice: { requestId: action.requestId, revision: action.revision },
        fitAcknowledgedRevision: null,
      };
    case "sliceLogAdded": {
      if (state.activeSlice?.requestId !== action.requestId) return state;
      const limit = Math.max(1, action.limit ?? 50);
      return { ...state, sliceLog: [...state.sliceLog, action.message].slice(-limit) };
    }
    case "sliceSucceeded":
      if (
        !matchesActiveSlice(state, action.requestId, action.revision) ||
        action.result.revision !== action.revision
      ) {
        return state;
      }
      return {
        ...state,
        workflowState: "sliced",
        step: "preview",
        sliceResult: action.result,
        sliceError: null,
        activeSlice: null,
        fitAcknowledgedRevision: null,
      };
    case "sliceFailed":
      if (!matchesActiveSlice(state, action.requestId, action.revision)) return state;
      return {
        ...state,
        workflowState: "sliceError",
        step: "preview",
        sliceError: action.error,
        activeSlice: null,
        fitAcknowledgedRevision: null,
      };
    case "stepRequested":
      return canAccessStep(state, action.step) ? { ...state, step: action.step } : state;
    case "fitAcknowledged":
      if (!hasCurrentSlice(state)) return state;
      return {
        ...state,
        fitAcknowledgedRevision: action.acknowledged ? state.inputRevision : null,
      };
  }
}
