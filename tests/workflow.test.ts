import { describe, expect, it } from "vitest";
import type { ClayControls } from "../src/clay-profile";
import type { GcodeStats, Warning } from "../src/domain";
import {
  canAccessStep,
  canDownload,
  canSlice,
  createInitialWorkflowStore,
  hasCurrentSlice,
  isSliceStale,
  workflowReducer,
  type SliceResult,
  type UploadedModel,
  type WorkflowStore,
} from "../src/workflow";

const controls: ClayControls = {
  layerHeight: 1,
  lineWidth: 1.5,
  printSpeed: 25,
  vaseMode: true,
};

const stats: GcodeStats = {
  lineCount: 12,
  layerCount: 1,
  estTimeMin: 1,
  estFilamentMm: 3,
  heatingCommands: [],
};

type Asset = { label: string };

function model(label = "vase"): UploadedModel<Asset> {
  return {
    file: { name: `${label}.stl`, size: 84, type: "model/stl" },
    buffer: new ArrayBuffer(84),
    asset: { label },
  };
}

function result(revision: number, warnings: Warning[] = []): SliceResult {
  return {
    revision,
    gcode: "G1 X1 E1",
    stats,
    warnings,
  };
}

function initial(): WorkflowStore<Asset> {
  return createInitialWorkflowStore<Asset>({ machineId: "ender3-clay", controls });
}

function withModel(): WorkflowStore<Asset> {
  return workflowReducer(initial(), { type: "uploadSucceeded", model: model() });
}

function withSlice(warnings: Warning[] = []): WorkflowStore<Asset> {
  const loaded = workflowReducer(withModel(), { type: "engineReady" });
  const slicing = workflowReducer(loaded, {
    type: "sliceStarted",
    requestId: "request-1",
    revision: loaded.inputRevision,
  });
  return workflowReducer(slicing, {
    type: "sliceSucceeded",
    requestId: "request-1",
    revision: loaded.inputRevision,
    result: result(loaded.inputRevision, warnings),
  });
}

describe("workflow reducer", () => {
  it("tracks engine readiness independently and preserves an uploaded model on failure/retry", () => {
    const loaded = withModel();
    const failed = workflowReducer(loaded, { type: "engineFailed", error: "CDN unavailable" });
    const retrying = workflowReducer(failed, { type: "engineRetry" });

    expect(failed.model).toBe(loaded.model);
    expect(failed.workflowState).toBe("modelLoaded");
    expect(failed.engineState).toBe("failed");
    expect(retrying.model).toBe(loaded.model);
    expect(retrying.engineState).toBe("loading");
    expect(retrying.engineError).toBeNull();
    expect(retrying.engineRetryGeneration).toBe(1);
  });

  it("accepts an upload, advances to Configure, and clears prior slice state", () => {
    const old = withSlice();
    const next = workflowReducer(old, { type: "uploadSucceeded", model: model("replacement") });

    expect(next.workflowState).toBe("modelLoaded");
    expect(next.step).toBe("configure");
    expect(next.model?.asset.label).toBe("replacement");
    expect(next.inputRevision).toBe(old.inputRevision + 1);
    expect(next.sliceResult).toBeNull();
    expect(next.sliceError).toBeNull();
    expect(next.sliceLog).toEqual([]);
    expect(next.fitAcknowledgedRevision).toBeNull();
  });

  it("clears the retained model as soon as a replacement upload starts", () => {
    const loaded = withModel();
    const started = workflowReducer(loaded, { type: "uploadStarted" });
    const failed = workflowReducer(started, { type: "uploadFailed", error: "Invalid STL" });

    expect(failed.step).toBe("upload");
    expect(failed.uploadError).toBe("Invalid STL");
    expect(failed.model).toBeNull();
    expect(failed.workflowState).toBe("empty");
    expect(started.inputRevision).toBe(loaded.inputRevision + 1);
    expect(failed.sliceResult).toBeNull();
    expect(failed.activeSlice).toBeNull();
  });

  it("invalidates but retains a result when controls or machine change", () => {
    const sliced = withSlice();
    const acknowledged = workflowReducer(sliced, {
      type: "fitAcknowledged",
      acknowledged: true,
    });
    const changedControls = workflowReducer(acknowledged, {
      type: "controlsChanged",
      controls: { ...controls, printSpeed: 30 },
    });
    const changedMachine = workflowReducer(changedControls, {
      type: "machineChanged",
      machineId: "wasp-style",
      controls: { ...controls, layerHeight: 0.8 },
    });

    expect(changedControls.sliceResult).toBe(sliced.sliceResult);
    expect(changedControls.workflowState).toBe("modelLoaded");
    expect(changedControls.inputRevision).toBe(sliced.inputRevision + 1);
    expect(changedControls.fitAcknowledgedRevision).toBeNull();
    expect(isSliceStale(changedControls)).toBe(true);
    expect(changedMachine.inputRevision).toBe(changedControls.inputRevision + 1);
    expect(changedMachine.machineId).toBe("wasp-style");
    expect(changedMachine.controls.layerHeight).toBe(0.8);
  });

  it("does not increment the revision for identical settings", () => {
    const loaded = withModel();

    expect(
      workflowReducer(loaded, { type: "controlsChanged", controls: { ...controls } }),
    ).toBe(loaded);
    expect(
      workflowReducer(loaded, {
        type: "machineChanged",
        machineId: loaded.machineId,
        controls: { ...controls },
      }),
    ).toBe(loaded);
  });

  it("captures the request and revision when slicing starts", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    const slicing = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "request-7",
      revision: loaded.inputRevision,
    });

    expect(slicing.workflowState).toBe("slicing");
    expect(slicing.step).toBe("preview");
    expect(slicing.activeSlice).toEqual({
      requestId: "request-7",
      revision: loaded.inputRevision,
    });
  });

  it("ignores late success after the input revision changes", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    const slicing = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "old-request",
      revision: loaded.inputRevision,
    });
    const changed = workflowReducer(slicing, {
      type: "controlsChanged",
      controls: { ...controls, lineWidth: 2 },
    });
    const late = workflowReducer(changed, {
      type: "sliceSucceeded",
      requestId: "old-request",
      revision: loaded.inputRevision,
      result: result(loaded.inputRevision),
    });

    expect(late).toBe(changed);
    expect(late.sliceResult).toBeNull();
    expect(late.workflowState).toBe("modelLoaded");
  });

  it("ignores a mismatched success result revision", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    const slicing = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "request-1",
      revision: loaded.inputRevision,
    });
    const invalid = workflowReducer(slicing, {
      type: "sliceSucceeded",
      requestId: "request-1",
      revision: loaded.inputRevision,
      result: result(loaded.inputRevision + 1),
    });

    expect(invalid).toBe(slicing);
  });

  it("keeps model and settings after a current slice failure so retry remains possible", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    const slicing = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "request-1",
      revision: loaded.inputRevision,
    });
    const failed = workflowReducer(slicing, {
      type: "sliceFailed",
      requestId: "request-1",
      revision: loaded.inputRevision,
      error: "Engine failed",
    });

    expect(failed.workflowState).toBe("sliceError");
    expect(failed.sliceError).toBe("Engine failed");
    expect(failed.model).toBe(loaded.model);
    expect(failed.controls).toBe(loaded.controls);
    expect(canSlice(failed)).toBe(true);
  });

  it("stores a toolpath parser error as a successful result", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    const slicing = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "request-1",
      revision: loaded.inputRevision,
    });
    const parsed = result(loaded.inputRevision);
    parsed.toolpathError = "Unsupported command";
    const sliced = workflowReducer(slicing, {
      type: "sliceSucceeded",
      requestId: "request-1",
      revision: loaded.inputRevision,
      result: parsed,
    });

    expect(sliced.workflowState).toBe("sliced");
    expect(sliced.sliceResult?.gcode).toBeTruthy();
    expect(sliced.sliceResult?.toolpath).toBeUndefined();
    expect(sliced.sliceResult?.toolpathError).toBe("Unsupported command");
  });

  it("bounds logs for the active request and ignores logs from old requests", () => {
    const loaded = workflowReducer(withModel(), { type: "engineReady" });
    let state = workflowReducer(loaded, {
      type: "sliceStarted",
      requestId: "request-1",
      revision: loaded.inputRevision,
    });
    state = workflowReducer(state, {
      type: "sliceLogAdded",
      requestId: "request-1",
      message: "one",
      limit: 2,
    });
    state = workflowReducer(state, {
      type: "sliceLogAdded",
      requestId: "request-1",
      message: "two",
      limit: 2,
    });
    state = workflowReducer(state, {
      type: "sliceLogAdded",
      requestId: "request-1",
      message: "three",
      limit: 2,
    });
    const ignored = workflowReducer(state, {
      type: "sliceLogAdded",
      requestId: "old-request",
      message: "old",
    });

    expect(state.sliceLog).toEqual(["two", "three"]);
    expect(ignored).toBe(state);
  });
});

describe("workflow selectors", () => {
  it("allows slicing only with a model and ready idle engine", () => {
    const empty = initial();
    const loaded = withModel();
    const ready = workflowReducer(loaded, { type: "engineReady" });
    const slicing = workflowReducer(ready, {
      type: "sliceStarted",
      requestId: "request-1",
      revision: ready.inputRevision,
    });

    expect(canSlice(empty)).toBe(false);
    expect(canSlice(loaded)).toBe(false);
    expect(canSlice(ready)).toBe(true);
    expect(canSlice(slicing)).toBe(false);
  });

  it("gates Preview and Download steps on a current, non-stale result", () => {
    const loaded = withModel();
    const sliced = withSlice();
    const stale = workflowReducer(sliced, {
      type: "controlsChanged",
      controls: { ...controls, layerHeight: 1.1 },
    });

    expect(canAccessStep(loaded, "upload")).toBe(true);
    expect(canAccessStep(loaded, "configure")).toBe(true);
    expect(canAccessStep(loaded, "preview")).toBe(false);
    expect(canAccessStep(sliced, "preview")).toBe(true);
    expect(canAccessStep(sliced, "download")).toBe(true);
    expect(canAccessStep(stale, "preview")).toBe(false);
    expect(canAccessStep(stale, "download")).toBe(false);
    expect(hasCurrentSlice(stale)).toBe(false);
  });

  it("makes a prior result non-current while re-slicing and after failure", () => {
    const sliced = withSlice();
    const slicing = workflowReducer(sliced, {
      type: "sliceStarted",
      requestId: "request-2",
      revision: sliced.inputRevision,
    });
    const failed = workflowReducer(slicing, {
      type: "sliceFailed",
      requestId: "request-2",
      revision: sliced.inputRevision,
      error: "Re-slice failed",
    });

    expect(slicing.sliceResult).toBe(sliced.sliceResult);
    expect(isSliceStale(slicing)).toBe(true);
    expect(hasCurrentSlice(slicing)).toBe(false);
    expect(canAccessStep(slicing, "download")).toBe(false);
    expect(canDownload(slicing)).toBe(false);
    expect(failed.sliceResult).toBe(sliced.sliceResult);
    expect(isSliceStale(failed)).toBe(true);
    expect(hasCurrentSlice(failed)).toBe(false);
    expect(canAccessStep(failed, "download")).toBe(false);
    expect(canDownload(failed)).toBe(false);
  });

  it("ignores requests to navigate to inaccessible steps", () => {
    const loaded = withModel();
    const blocked = workflowReducer(loaded, { type: "stepRequested", step: "download" });
    const upload = workflowReducer(loaded, { type: "stepRequested", step: "upload" });

    expect(blocked).toBe(loaded);
    expect(upload.step).toBe("upload");
  });

  it("requires fit acknowledgement for the current result only", () => {
    const fitError: Warning = {
      id: "fit-footprint",
      severity: "error",
      title: "Does not fit",
      message: "The model exceeds the bed.",
    };
    const sliced = withSlice([fitError]);
    const acknowledged = workflowReducer(sliced, {
      type: "fitAcknowledged",
      acknowledged: true,
    });
    const changed = workflowReducer(acknowledged, {
      type: "controlsChanged",
      controls: { ...controls, printSpeed: 26 },
    });

    expect(canDownload(sliced)).toBe(false);
    expect(canDownload(acknowledged)).toBe(true);
    expect(acknowledged.fitAcknowledgedRevision).toBe(sliced.inputRevision);
    expect(canDownload(changed)).toBe(false);
    expect(changed.fitAcknowledgedRevision).toBeNull();
  });

  it("always blocks heating and unknown error warnings", () => {
    const heating: Warning = {
      id: "heating-commands",
      severity: "error",
      title: "Heating command found",
      message: "Remove heater commands.",
    };
    const unknown: Warning = {
      id: "future-safety-error",
      severity: "error",
      title: "Unsafe output",
      message: "The output is unsafe.",
    };

    for (const warning of [heating, unknown]) {
      const sliced = withSlice([warning]);
      const acknowledged = workflowReducer(sliced, {
        type: "fitAcknowledged",
        acknowledged: true,
      });
      expect(canDownload(acknowledged)).toBe(false);
    }
  });

  it("allows download with current non-error warnings and successful degraded toolpath", () => {
    const advisory: Warning = {
      id: "overhang-advisory",
      severity: "warn",
      title: "Overhang",
      message: "Review this advisory.",
    };
    const sliced = withSlice([advisory]);

    expect(canDownload(sliced)).toBe(true);
  });
});
