import { fireEvent, render, screen } from "@testing-library/react";
import * as THREE from "three";
import type { Segment, Toolpath } from "../../src/domain";
import { ToolpathPreview } from "../../src/components/ToolpathPreview";
import * as viewportModule from "../../src/lib/three-viewport";
import { MAX_VISIBLE_SEGMENTS } from "../../src/lib/toolpath-geometry";

const bed = { shape: "rect", width: 100, depth: 80, maxHeight: 120 } as const;

function segment(z: number): Segment {
  return {
    start: { x: 0, y: 0, z },
    end: { x: 10, y: 5, z },
    extrusionMm: 1,
    sourceLine: z,
  };
}

function path(layerCount: number): Toolpath {
  return {
    layers: Array.from({ length: layerCount }, (_, index) => [segment(index + 1)]),
    layerZ: Array.from({ length: layerCount }, (_, index) => index + 1),
  };
}

function viewportMock(container: HTMLElement, accessibleName: string) {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute("aria-label", accessibleName);
  container.append(canvas);
  return {
    scene: { add: vi.fn(), remove: vi.fn() },
    camera: new THREE.PerspectiveCamera(),
    renderer: { domElement: canvas },
    controls: {},
    invalidate: vi.fn(),
    fitToBox: vi.fn(),
    fitToObject: vi.fn(),
    dispose: vi.fn(() => canvas.remove()),
  } as unknown as viewportModule.ThreeViewport;
}

describe("ToolpathPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to the final layer and supports first, middle, and last slider values", () => {
    const viewports: viewportModule.ThreeViewport[] = [];
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation((container, name) => {
      const viewport = viewportMock(container, name);
      viewports.push(viewport);
      return viewport;
    });
    render(<ToolpathPreview toolpath={path(3)} bed={bed} />);

    const slider = screen.getByRole("slider");
    expect(slider).toHaveValue("2");
    expect(slider).toHaveAttribute("aria-valuetext", "Layer 3 of 3");
    fireEvent.change(slider, { target: { value: "0" } });
    expect(slider).toHaveValue("0");
    expect(slider).toHaveAttribute("aria-valuetext", "Layer 1 of 3");
    fireEvent.change(slider, { target: { value: "1" } });
    expect(slider).toHaveValue("1");
    fireEvent.change(slider, { target: { value: "2" } });
    expect(slider).toHaveValue("2");
    expect(viewports.some((viewport) => vi.mocked(viewport.dispose).mock.calls.length > 0)).toBe(true);
  });

  it("toggles between all-through-current and current-only modes", () => {
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation(viewportMock);
    render(<ToolpathPreview toolpath={path(3)} bed={bed} />);

    const toggle = screen.getByRole("checkbox", { name: /show all layers through current/i });
    expect(toggle).toBeChecked();
    expect(screen.getByText(/3 visible extrusion segments from 3 total/i)).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).not.toBeChecked();
    expect(screen.getByText(/1 visible extrusion segments from 3 total/i)).toBeInTheDocument();
  });

  it("resets layer and display mode when a different toolpath arrives", () => {
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation(viewportMock);
    const view = render(<ToolpathPreview toolpath={path(3)} bed={bed} />);
    fireEvent.change(screen.getByRole("slider"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("checkbox"));

    view.rerender(<ToolpathPreview toolpath={path(2)} bed={bed} />);
    expect(screen.getByRole("slider")).toHaveValue("1");
    expect(screen.getByRole("checkbox")).toBeChecked();
    expect(screen.getByText(/layer 2 of 2/i)).toBeInTheDocument();
  });

  it("shows an empty notice without constructing a viewport", () => {
    const createViewport = vi.spyOn(viewportModule, "createThreeViewport");
    render(<ToolpathPreview toolpath={{ layers: [[], []], layerZ: [1, 2] }} bed={bed} />);
    expect(screen.getByRole("status")).toHaveTextContent(/no drawable extrusion moves/i);
    expect(createViewport).not.toHaveBeenCalled();
  });

  it("falls back locally when WebGL construction fails", () => {
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });
    render(<ToolpathPreview toolpath={path(1)} bed={bed} />);
    expect(screen.getByRole("alert")).toHaveTextContent(/3d toolpath preview is unavailable/i);
    expect(screen.getByText(/1 visible extrusion segments/i)).toBeInTheDocument();
  });

  it("caps an oversized all-layer display and shows a performance notice", () => {
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation(viewportMock);
    const repeated = segment(1);
    const oversized: Toolpath = {
      layers: [new Array<Segment>(MAX_VISIBLE_SEGMENTS).fill(repeated), [segment(2)]],
      layerZ: [1, 2],
    };
    render(<ToolpathPreview toolpath={oversized} bed={bed} />);

    expect(screen.getByRole("status")).toHaveTextContent(/display limit.*current layer only/i);
    expect(screen.getByText(/1 visible extrusion segments from 1,000,001 total/i)).toBeInTheDocument();
  });

  it("disposes generated GPU resources on unmount", () => {
    let viewport: viewportModule.ThreeViewport | undefined;
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation((container, name) => {
      viewport = viewportMock(container, name);
      return viewport;
    });
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");
    const view = render(<ToolpathPreview toolpath={path(2)} bed={bed} />);
    view.unmount();
    expect(viewport?.dispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).toHaveBeenCalled();
  });
});
