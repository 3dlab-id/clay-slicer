import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { MachinePreset } from "../machines";
import { createBedFootprintPositions, createBedVolumePositions } from "../lib/bed-geometry";
import { createThreeViewport } from "../lib/three-viewport";

export type ModelFitStatus = "fits" | "does-not-fit";

export interface ModelPreviewProps {
  geometry: THREE.BufferGeometry;
  preset: MachinePreset;
  fitStatus: ModelFitStatus;
}

function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
  else material.dispose();
}

function modelBounds(geometry: THREE.BufferGeometry): THREE.Box3 {
  if (geometry.boundingBox) return geometry.boundingBox.clone();
  const positions = geometry.getAttribute("position");
  if (!positions) return new THREE.Box3();
  return new THREE.Box3().setFromBufferAttribute(positions as THREE.BufferAttribute);
}

function bedSummary(preset: MachinePreset): string {
  const { bed } = preset;
  return bed.shape === "rect"
    ? `${bed.width} × ${bed.depth} × ${bed.maxHeight} mm rectangular build volume`
    : `Ø${bed.diameter} × ${bed.maxHeight} mm circular build volume`;
}

export function ModelPreview({ geometry, preset, fitStatus }: ModelPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const bounds = useMemo(() => modelBounds(geometry), [geometry]);
  const size = useMemo(() => bounds.getSize(new THREE.Vector3()), [bounds]);
  const fitText = fitStatus === "fits"
    ? "Model fits the selected build volume."
    : "Model does not fit the selected build volume.";
  const canvasLabel = `3D model preview for ${preset.name}`;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    setPreviewError(null);

    let viewport: ReturnType<typeof createThreeViewport> | undefined;
    try {
      viewport = createThreeViewport(container, canvasLabel);
    } catch {
      setPreviewError("3D preview is unavailable in this browser. Model details remain available below.");
      return;
    }

    const material = new THREE.MeshStandardMaterial({
      color: fitStatus === "fits" ? 0xb96842 : 0xb9382f,
      roughness: 0.88,
      metalness: 0,
    });
    const mesh = new THREE.Mesh(geometry, material);
    const ambient = new THREE.AmbientLight(0xffffff, 1.2);
    const directional = new THREE.DirectionalLight(0xffffff, 2.2);
    directional.position.set(1, -1, 2).multiplyScalar(Math.max(size.length(), 20));

    const footprintGeometry = new THREE.BufferGeometry();
    footprintGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(createBedFootprintPositions(preset.bed), 3),
    );
    const footprintMaterial = new THREE.LineBasicMaterial({
      color: fitStatus === "fits" ? 0x296888 : 0xb23c22,
    });
    const footprint = new THREE.LineSegments(footprintGeometry, footprintMaterial);

    const volumeGeometry = new THREE.BufferGeometry();
    volumeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(createBedVolumePositions(preset.bed), 3),
    );
    const volumeMaterial = new THREE.LineBasicMaterial({
      color: fitStatus === "fits" ? 0x7190a0 : 0xb23c22,
      transparent: true,
      opacity: 0.32,
    });
    const volume = new THREE.LineSegments(volumeGeometry, volumeMaterial);

    const bedSize = preset.bed.shape === "rect"
      ? Math.max(preset.bed.width, preset.bed.depth)
      : preset.bed.diameter;
    const grid = new THREE.GridHelper(bedSize, Math.max(10, Math.round(bedSize / 10)), 0x82909a, 0xd1d7da);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.01;

    viewport.scene.add(grid, footprint, volume, ambient, directional, mesh);
    const fitBounds = bounds.clone();
    const halfWidth = preset.bed.shape === "rect" ? preset.bed.width / 2 : preset.bed.diameter / 2;
    const halfDepth = preset.bed.shape === "rect" ? preset.bed.depth / 2 : preset.bed.diameter / 2;
    fitBounds.expandByPoint(new THREE.Vector3(-halfWidth, -halfDepth, 0));
    fitBounds.expandByPoint(new THREE.Vector3(
      halfWidth,
      halfDepth,
      Math.max(size.z, preset.bed.maxHeight),
    ));
    viewport.fitToBox(fitBounds);
    viewport.invalidate();

    return () => {
      viewport?.scene.remove(grid, footprint, volume, ambient, directional, mesh);
      footprintGeometry.dispose();
      footprintMaterial.dispose();
      volumeGeometry.dispose();
      volumeMaterial.dispose();
      grid.geometry.dispose();
      disposeMaterial(grid.material);
      material.dispose();
      viewport?.dispose();
    };
  }, [bounds, canvasLabel, fitStatus, geometry, preset, size]);

  return (
    <section aria-label="Model preview">
      <div
        ref={containerRef}
        data-testid="model-preview-viewport"
        style={{ minHeight: 360, position: "relative", width: "100%" }}
      />
      {previewError && <p role="alert">{previewError}</p>}
      <p>
        Model dimensions: {size.x.toFixed(2)} × {size.y.toFixed(2)} × {size.z.toFixed(2)} mm.
        {" "}Selected bed: {bedSummary(preset)}.
      </p>
      <p role="status" data-fit-status={fitStatus}>{fitText}</p>
    </section>
  );
}
