import { render, screen } from "@testing-library/react";
import * as THREE from "three";
import { ModelPreview } from "../../src/components/ModelPreview";
import { getMachinePreset } from "../../src/machines";
import * as viewportModule from "../../src/lib/three-viewport";

function geometry(): THREE.BufferGeometry {
  const result = new THREE.BufferGeometry();
  result.setAttribute("position", new THREE.Float32BufferAttribute([
    -10, -5, 0,
    10, -5, 0,
    0, 5, 5,
  ], 3));
  result.computeBoundingBox();
  return result;
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

describe("ModelPreview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("shows an accessible canvas, dimensions, bed summary, and textual fit state", () => {
    let viewport: viewportModule.ThreeViewport | undefined;
    const createViewport = vi.spyOn(viewportModule, "createThreeViewport")
      .mockImplementation((container, name) => {
        viewport = viewportMock(container, name);
        return viewport;
      });
    const modelGeometry = geometry();

    render(<ModelPreview
      geometry={modelGeometry}
      preset={getMachinePreset("ender3-clay")!}
      fitStatus="does-not-fit"
    />);

    expect(screen.getByRole("img", { name: /3d model preview for ender-3 clay/i })).toBeInTheDocument();
    expect(screen.getByText(/model dimensions: 20\.00 × 10\.00 × 5\.00 mm/i)).toBeInTheDocument();
    expect(screen.getByText(/234 × 234 × 245 mm rectangular build volume/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/does not fit/i);
    expect(createViewport).toHaveBeenCalledTimes(1);
    const fitBounds = vi.mocked(viewport!.fitToBox).mock.calls[0]![0];
    expect(fitBounds.max.z).toBe(245);
  });

  it("converts WebGL construction failure into a local notice", () => {
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation(() => {
      throw new Error("WebGL unavailable");
    });

    render(<ModelPreview
      geometry={geometry()}
      preset={getMachinePreset("wasp-style")!}
      fitStatus="fits"
    />);

    expect(screen.getByRole("alert")).toHaveTextContent(/3d preview is unavailable/i);
    expect(screen.getByText(/Ø200 × 400 mm circular build volume/i)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/model fits/i);
  });

  it("cleans up viewport-owned resources without disposing parent geometry", () => {
    let viewport: viewportModule.ThreeViewport | undefined;
    vi.spyOn(viewportModule, "createThreeViewport").mockImplementation((container, name) => {
      viewport = viewportMock(container, name);
      return viewport;
    });
    const modelGeometry = geometry();
    const parentDispose = vi.spyOn(modelGeometry, "dispose");
    const helperDispose = vi.spyOn(THREE.BufferGeometry.prototype, "dispose");

    const view = render(<ModelPreview
      geometry={modelGeometry}
      preset={getMachinePreset("eazao-style")!}
      fitStatus="fits"
    />);
    view.unmount();

    expect(viewport?.dispose).toHaveBeenCalledTimes(1);
    expect(helperDispose).toHaveBeenCalled();
    expect(parentDispose).not.toHaveBeenCalled();
  });
});

describe("fitCameraToBox", () => {
  it("ignores empty bounds and safely frames zero-radius bounds", () => {
    const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 1000);
    const initialPosition = camera.position.clone();
    const controls = { target: new THREE.Vector3(), update: vi.fn(() => true) };

    viewportModule.fitCameraToBox(camera, new THREE.Box3(), controls);
    expect(camera.position).toEqual(initialPosition);
    expect(controls.update).not.toHaveBeenCalled();

    const point = new THREE.Vector3(2, 3, 4);
    viewportModule.fitCameraToBox(camera, new THREE.Box3(point, point), controls);
    expect(camera.position.toArray().every(Number.isFinite)).toBe(true);
    expect(camera.near).toBeGreaterThan(0);
    expect(camera.far).toBeGreaterThan(camera.near);
    expect(controls.target).toEqual(point);
    expect(controls.update).toHaveBeenCalledTimes(1);
  });
});
