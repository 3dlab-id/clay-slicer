import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

const FALLBACK_WIDTH = 640;
const FALLBACK_HEIGHT = 480;
const CAMERA_DIRECTION = new THREE.Vector3(1, -0.8, 0.8).normalize();

export interface ThreeViewport {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  invalidate(): void;
  fitToBox(box: THREE.Box3): void;
  fitToObject(object: THREE.Object3D): void;
  dispose(): void;
}

export function fitCameraToBox(
  camera: THREE.PerspectiveCamera,
  box: THREE.Box3,
  controls?: Pick<OrbitControls, "target" | "update">,
): void {
  if (box.isEmpty()) return;

  const center = box.getCenter(new THREE.Vector3());
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const radius = Math.max(sphere.radius, 1e-3);
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
  const limitingFov = Math.max(1e-3, Math.min(verticalFov, horizontalFov));
  const distance = (radius * 1.25) / Math.sin(limitingFov / 2);

  camera.position.copy(center).addScaledVector(CAMERA_DIRECTION, distance);
  camera.near = Math.max(distance / 10_000, 0.001);
  camera.far = Math.max(distance * 100, 1000);
  camera.updateProjectionMatrix();

  if (controls) {
    controls.target.copy(center);
    controls.update();
  } else {
    camera.lookAt(center);
  }
}

function containerSize(container: HTMLElement): { width: number; height: number } {
  const bounds = container.getBoundingClientRect();
  return {
    width: Math.max(1, bounds.width || container.clientWidth || FALLBACK_WIDTH),
    height: Math.max(1, bounds.height || container.clientHeight || FALLBACK_HEIGHT),
  };
}

export function createThreeViewport(
  container: HTMLElement,
  accessibleName: string,
): ThreeViewport {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute("aria-label", accessibleName);
  renderer.domElement.style.display = "block";
  renderer.domElement.style.width = "100%";
  renderer.domElement.style.height = "100%";
  container.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xf3f1ed);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.01, 10_000);
  camera.up.set(0, 0, 1);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;

  let disposed = false;
  const invalidate = () => {
    if (!disposed) renderer.render(scene, camera);
  };
  const resize = () => {
    if (disposed) return;
    const { width, height } = containerSize(container);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    invalidate();
  };
  controls.addEventListener("change", invalidate);

  let resizeObserver: ResizeObserver | undefined;
  let usesWindowResize = false;
  if (typeof ResizeObserver === "function") {
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
  } else {
    usesWindowResize = true;
    window.addEventListener("resize", resize);
  }
  resize();

  return {
    scene,
    camera,
    renderer,
    controls,
    invalidate,
    fitToBox(box) {
      fitCameraToBox(camera, box, controls);
      invalidate();
    },
    fitToObject(object) {
      fitCameraToBox(camera, new THREE.Box3().setFromObject(object), controls);
      invalidate();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      controls.removeEventListener("change", invalidate);
      resizeObserver?.disconnect();
      if (usesWindowResize) window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
