import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ModelAnalysis, Toolpath } from "../src/domain";

const mocks = vi.hoisted(() => ({
  loadKiri: vi.fn(),
  sliceToGcode: vi.fn(),
  parseAndAnalyzeStl: vi.fn(),
  disposeModelAsset: vi.fn(),
  getGcodeStats: vi.fn(),
  parseToolpath: vi.fn(),
  downloadGcode: vi.fn(),
}));

vi.mock("../src/kiri-loader", () => ({ loadKiri: mocks.loadKiri }));
vi.mock("../src/kiri", () => ({ sliceToGcode: mocks.sliceToGcode }));
vi.mock("../src/model-analysis", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/model-analysis")>();
  return {
    ...actual,
    parseAndAnalyzeStl: mocks.parseAndAnalyzeStl,
    disposeModelAsset: mocks.disposeModelAsset,
  };
});
vi.mock("../src/gcode-stats", () => ({ getGcodeStats: mocks.getGcodeStats }));
vi.mock("../src/gcode-toolpath", () => ({ parseToolpath: mocks.parseToolpath }));
vi.mock("../src/download", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/download")>();
  return { ...actual, downloadGcode: mocks.downloadGcode };
});
vi.mock("../src/components/ModelPreview", () => ({
  ModelPreview: () => <div data-testid="model-preview">Model preview</div>,
}));
vi.mock("../src/components/ToolpathPreview", () => ({
  ToolpathPreview: () => <div data-testid="toolpath-preview">Toolpath preview</div>,
}));

import { App } from "../src/App";

const stats = {
  lineCount: 24,
  layerCount: 2,
  estTimeMin: 1.5,
  estFilamentMm: 12,
  heatingCommands: [],
};

const toolpath: Toolpath = {
  layers: [[{
    start: { x: 0, y: 0, z: 1 },
    end: { x: 1, y: 0, z: 1 },
    extrusionMm: 1,
    sourceLine: 1,
  }]],
  layerZ: [1],
};

function analysis(overrides: Partial<ModelAnalysis> = {}): ModelAnalysis {
  return {
    bounds: {
      min: { x: -10, y: -5, z: 0 },
      max: { x: 10, y: 5, z: 5 },
      size: { x: 20, y: 10, z: 5 },
    },
    triangleCount: 12,
    sourceBytes: 100,
    overhangFraction: 0,
    isHuge: false,
    ...overrides,
  };
}

function asset(overrides: Partial<ModelAnalysis> = {}) {
  return {
    geometry: { dispose: vi.fn() },
    analysis: analysis(overrides),
  };
}

function stlFile(name = "vase.stl") {
  const file = new File(["stl"], name, { type: "model/stl" });
  const arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(100));
  Object.defineProperty(file, "arrayBuffer", { value: arrayBuffer });
  return { file, arrayBuffer };
}

async function renderReady() {
  const user = userEvent.setup();
  render(<App />);
  await screen.findByText(/engine ready/i);
  return user;
}

async function upload(user: ReturnType<typeof userEvent.setup>, name = "vase.stl") {
  const selected = stlFile(name);
  await user.upload(screen.getByLabelText(/choose an stl file/i), selected.file);
  await screen.findByRole("heading", { name: /configure the clay print/i });
  return selected;
}

async function slice(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /^slice model$/i }));
  await screen.findByRole("heading", { name: /preview the slice/i });
  await screen.findByText(/24/);
}

describe("App wizard integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.loadKiri.mockResolvedValue(undefined);
    mocks.parseAndAnalyzeStl.mockImplementation(() => asset());
    mocks.sliceToGcode.mockResolvedValue("G21\nG1 X1 E1\n");
    mocks.getGcodeStats.mockReturnValue(stats);
    mocks.parseToolpath.mockReturnValue(toolpath);
  });

  it("reads a valid upload once, advances, and shows normalized dimensions", async () => {
    const user = await renderReady();
    const selected = await upload(user, "asymmetric vase.stl");

    expect(selected.arrayBuffer).toHaveBeenCalledOnce();
    expect(mocks.parseAndAnalyzeStl).toHaveBeenCalledWith(expect.any(ArrayBuffer), 3);
    expect(screen.getByText(/model dimensions: 20\.00 × 10\.00 × 5\.00 mm/i)).toBeInTheDocument();
    expect(screen.getByTestId("model-preview")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /configure the clay print/i })).toHaveFocus();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main-content");
  });

  it("keeps an invalid upload on Upload with actionable guidance", async () => {
    mocks.parseAndAnalyzeStl.mockImplementation(() => {
      throw new Error("This STL is invalid or truncated.");
    });
    const user = await renderReady();
    const selected = stlFile("broken.stl");
    await user.upload(screen.getByLabelText(/choose an stl file/i), selected.file);

    expect(await screen.findByRole("alert")).toHaveTextContent(/invalid or truncated/i);
    expect(screen.getByRole("heading", { name: /upload an stl model/i })).toBeInTheDocument();
    expect(selected.arrayBuffer).toHaveBeenCalledOnce();
  });

  it("retries engine loading without losing the uploaded model", async () => {
    mocks.loadKiri.mockRejectedValueOnce(new Error("engine offline")).mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/engine failed/i);
    await upload(user, "kept.stl");
    expect(screen.getByText(/engine offline/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /retry engine/i }));
    await screen.findByText(/engine ready/i);
    expect(screen.getByText(/model dimensions: 20\.00/i)).toBeInTheDocument();
    expect(mocks.loadKiri).toHaveBeenLastCalledWith({ retry: true });
  });

  it("returns focus to Retry engine when a retry fails", async () => {
    mocks.loadKiri.mockRejectedValue(new Error("engine offline"));
    const user = userEvent.setup();
    render(<App />);
    await screen.findByText(/engine failed/i);
    await upload(user);

    await user.click(screen.getByRole("button", { name: /retry engine/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /retry engine/i })).toHaveFocus());
  });

  it("gates wizard steps by available and current data", async () => {
    const user = await renderReady();
    expect(screen.getByRole("button", { name: /configure/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /preview/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();

    await upload(user);
    expect(screen.getByRole("button", { name: /configure/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /preview/i })).toBeDisabled();
    await slice(user);
    expect(screen.getByRole("button", { name: /preview/i })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeEnabled();
  });

  it("resets controls on machine change and marks an existing result stale", async () => {
    const user = await renderReady();
    await upload(user);
    fireEvent.change(screen.getByRole("slider", { name: /layer height/i }), { target: { value: "0.8" } });
    await slice(user);
    await user.click(screen.getByRole("button", { name: /configure/i }));
    await user.selectOptions(screen.getByLabelText(/clay printer/i), "wasp-style");

    expect(screen.getByRole("slider", { name: /layer height/i })).toHaveValue("1");
    expect(screen.getByRole("button", { name: /re-slice model/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();
  });

  it("marks output stale after a control change and disables Download", async () => {
    const user = await renderReady();
    await upload(user);
    await slice(user);
    await user.click(screen.getByRole("button", { name: /configure/i }));
    await user.click(screen.getByLabelText(/vase mode/i));

    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /re-slice model/i })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(/preview out of date/i);
  });

  it("ignores a late slice response after settings change", async () => {
    let resolveSlice!: (gcode: string) => void;
    mocks.sliceToGcode.mockReturnValue(new Promise((resolve) => { resolveSlice = resolve; }));
    const user = await renderReady();
    await upload(user);
    await user.click(screen.getByRole("button", { name: /^slice model$/i }));
    await screen.findByText(/slicing model/i);
    await user.click(screen.getByRole("button", { name: /configure/i }));
    await user.click(screen.getByLabelText(/vase mode/i));

    await act(async () => { resolveSlice("G21\nG1 X1 E1\n"); });
    await waitFor(() => expect(mocks.getGcodeStats).toHaveBeenCalled());
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();
    expect(screen.queryByText(/g-code estimates/i)).not.toBeInTheDocument();
  });

  it("shows an empty-G-code failure as retryable", async () => {
    mocks.sliceToGcode.mockRejectedValue(new Error("Kiri:Moto exported empty G-code. Retry slicing this model."));
    const user = await renderReady();
    await upload(user);
    await user.click(screen.getByRole("button", { name: /^slice model$/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/empty G-code.*retry/i);
    expect(screen.getByRole("button", { name: /re-slice model/i })).toBeEnabled();
  });

  it("returns focus to Re-slice when a slice retry fails", async () => {
    mocks.sliceToGcode.mockRejectedValue(new Error("slice unavailable"));
    const user = await renderReady();
    await upload(user);
    await user.click(screen.getByRole("button", { name: /^slice model$/i }));
    await screen.findByText(/slice unavailable/i);

    await user.click(screen.getByRole("button", { name: /re-slice model/i }));

    await waitFor(() => expect(screen.getByRole("button", { name: /re-slice model/i })).toHaveFocus());
  });

  it("blocks stale download while re-slicing current inputs and after that re-slice fails", async () => {
    const user = await renderReady();
    await upload(user);
    await slice(user);
    await user.click(screen.getByRole("button", { name: /configure/i }));

    let rejectSlice!: (error: Error) => void;
    mocks.sliceToGcode.mockReturnValueOnce(new Promise((_, reject) => {
      rejectSlice = reject;
    }));
    await user.click(screen.getByRole("button", { name: /re-slice model/i }));

    expect(await screen.findByText(/slicing model/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /continue to download/i })).not.toBeInTheDocument();

    await act(async () => rejectSlice(new Error("Re-slice failed")));

    expect(await screen.findByText(/re-slice failed/i)).toHaveAttribute("role", "alert");
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();
    expect(screen.queryByRole("button", { name: /continue to download/i })).not.toBeInTheDocument();
  });

  it("disposes and clears the prior project immediately when a replacement file is invalid", async () => {
    const priorAsset = asset();
    mocks.parseAndAnalyzeStl.mockReturnValueOnce(priorAsset);
    const user = await renderReady();
    await upload(user, "prior.stl");
    await slice(user);
    await user.click(screen.getByRole("button", { name: /upload/i }));

    mocks.parseAndAnalyzeStl.mockImplementationOnce(() => {
      throw new Error("Replacement STL is invalid.");
    });
    const replacement = stlFile("replacement.stl");
    fireEvent.change(screen.getByLabelText(/choose an stl file/i), {
      target: { files: [replacement.file] },
    });

    expect(mocks.disposeModelAsset).toHaveBeenCalledWith(priorAsset);
    expect(screen.queryByText("prior.stl")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /configure/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /preview/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^download$/i })).toBeDisabled();

    expect(await screen.findByRole("alert")).toHaveTextContent(/replacement STL is invalid/i);
    expect(replacement.arrayBuffer).toHaveBeenCalledOnce();
    expect(screen.queryByText("prior.stl")).not.toBeInTheDocument();
  });

  it("isolates toolpath parser failure while preserving stats, model, and download", async () => {
    mocks.parseToolpath.mockImplementation(() => { throw new Error("unsupported arc"); });
    const user = await renderReady();
    await upload(user);
    await slice(user);

    expect(screen.getByText(/toolpath preview unavailable.*unsupported arc/i)).toHaveAttribute("role", "status");
    expect(screen.getByText(/motion time/i)).toBeInTheDocument();
    expect(screen.getByTestId("model-preview")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /continue to download/i }));
    expect(screen.getByRole("button", { name: /^download G-code$/i })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /^download G-code$/i }));
    expect(mocks.downloadGcode).toHaveBeenCalledWith({
      gcode: "G21\nG1 X1 E1\n",
      modelName: "vase.stl",
      machineId: "ender3-clay",
    });
  });

  it("gates oversized downloads with a result-scoped acknowledgement that resets", async () => {
    mocks.parseAndAnalyzeStl.mockImplementation(() => asset({
      bounds: {
        min: { x: -150, y: -5, z: 0 },
        max: { x: 150, y: 5, z: 5 },
        size: { x: 300, y: 10, z: 5 },
      },
    }));
    const user = await renderReady();
    await upload(user);
    await slice(user);
    expect(screen.getByText(/model exceeds the bed footprint/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /continue to download/i }));
    expect(screen.getByRole("heading", { name: /download clay g-code/i })).toHaveFocus();
    expect(screen.getByText(/model exceeds the bed footprint/i)).toBeInTheDocument();
    const acknowledgement = screen.getByRole("checkbox", { name: /exceeds the selected build volume/i });
    expect(acknowledgement).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^download g-code$/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /^download g-code$/i }))
      .toHaveAttribute("aria-describedby", "download-blocking-reason");
    expect(screen.getByRole("status", { name: "" })).toHaveAttribute("id", "download-blocking-reason");
    await user.click(acknowledgement);
    expect(screen.getByRole("button", { name: /^download g-code$/i })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: /configure/i }));
    await user.click(screen.getByLabelText(/vase mode/i));
    await user.click(screen.getByRole("button", { name: /re-slice model/i }));
    await screen.findByText(/24/);
    await user.click(screen.getByRole("button", { name: /continue to download/i }));
    expect(screen.getByRole("checkbox", { name: /exceeds the selected build volume/i })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /^download g-code$/i })).toBeDisabled();
  });

  it("does not let fit acknowledgement override heating command errors", async () => {
    mocks.parseAndAnalyzeStl.mockImplementation(() => asset({
      bounds: {
        min: { x: -150, y: -5, z: 0 },
        max: { x: 150, y: 5, z: 5 },
        size: { x: 300, y: 10, z: 5 },
      },
    }));
    mocks.getGcodeStats.mockReturnValue({
      ...stats,
      heatingCommands: [{ code: "M104", line: 7 }],
    });
    const user = await renderReady();
    await upload(user);
    await slice(user);
    await user.click(screen.getByRole("button", { name: /continue to download/i }));

    expect(screen.getByText(/remove M104 on source line 7/i)).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: /exceeds the selected build volume/i }));
    expect(screen.getByRole("button", { name: /^download g-code$/i })).toBeDisabled();
  });

  it("never enables download for blank G-code", async () => {
    mocks.sliceToGcode.mockResolvedValue("   \n");
    const user = await renderReady();
    await upload(user);
    await slice(user);
    await user.click(screen.getByRole("button", { name: /continue to download/i }));

    await user.click(screen.getByRole("button", { name: /^download g-code$/i }));
    expect(screen.getByRole("button", { name: /^download g-code$/i })).toBeDisabled();
    expect(mocks.downloadGcode).not.toHaveBeenCalled();
  });

  it("supports arrow-key tab navigation with complete tab relationships", async () => {
    const user = await renderReady();
    await upload(user);
    await slice(user);
    const modelTab = screen.getByRole("tab", { name: /model/i });
    modelTab.focus();
    await user.keyboard("{ArrowRight}");

    const toolpathTab = screen.getByRole("tab", { name: /toolpath/i });
    expect(toolpathTab).toHaveFocus();
    expect(toolpathTab).toHaveAttribute("aria-selected", "true");
    expect(modelTab).toHaveAttribute("aria-controls", "preview-panel");
    expect(toolpathTab).toHaveAttribute("aria-controls", "preview-panel");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("id", "preview-panel");
    expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", "preview-tab-toolpath");
  });

  it("requires explicit Continue before mounting a huge model preview", async () => {
    mocks.parseAndAnalyzeStl.mockImplementation(() => asset({
      triangleCount: 500_000,
      isHuge: true,
    }));
    const user = await renderReady();
    await upload(user, "huge.stl");

    expect(screen.queryByTestId("model-preview")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^slice model$/i })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /continue with large model/i }));
    expect(screen.getByTestId("model-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^slice model$/i })).toBeEnabled();
  });
});
