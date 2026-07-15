import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import type { Bed, Toolpath } from "../domain";
import { createBedFootprintPositions } from "../lib/bed-geometry";
import { createThreeViewport } from "../lib/three-viewport";
import {
  buildToolpathPositions,
  clampLayerIndex,
  countToolpathSegments,
  getToolpathBounds,
  lastLayerIndex,
} from "../lib/toolpath-geometry";

export interface ToolpathPreviewProps {
  toolpath: Toolpath;
  bed: Bed;
}

interface LayerState {
  toolpath: Toolpath;
  layerIndex: number;
  showThroughCurrent: boolean;
}

function bedSummary(bed: Bed): string {
  return bed.shape === "rect"
    ? `${bed.width} × ${bed.depth} mm rectangular bed`
    : `${bed.diameter} mm diameter circular bed`;
}

function addLineSegments(
  scene: THREE.Scene,
  positions: Float32Array,
  color: number,
  opacity = 1,
): { line: THREE.LineSegments; geometry: THREE.BufferGeometry; material: THREE.LineBasicMaterial } | undefined {
  if (positions.length === 0) return undefined;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
  });
  const line = new THREE.LineSegments(geometry, material);
  scene.add(line);
  return { line, geometry, material };
}

export function ToolpathPreview({ toolpath, bed }: ToolpathPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [layerState, setLayerState] = useState<LayerState>(() => ({
    toolpath,
    layerIndex: lastLayerIndex(toolpath),
    showThroughCurrent: true,
  }));

  const isCurrentToolpath = layerState.toolpath === toolpath;
  const layerIndex = isCurrentToolpath
    ? clampLayerIndex(toolpath, layerState.layerIndex)
    : lastLayerIndex(toolpath);
  const showThroughCurrent = isCurrentToolpath ? layerState.showThroughCurrent : true;
  const segmentCount = useMemo(() => countToolpathSegments(toolpath), [toolpath]);
  const bounds = useMemo(() => getToolpathBounds(toolpath), [toolpath]);
  const positions = useMemo(
    () => buildToolpathPositions(toolpath, layerIndex, showThroughCurrent),
    [layerIndex, showThroughCurrent, toolpath],
  );

  useEffect(() => {
    setLayerState({
      toolpath,
      layerIndex: lastLayerIndex(toolpath),
      showThroughCurrent: true,
    });
  }, [toolpath]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || segmentCount === 0 || !bounds) return;
    setPreviewError(null);

    let viewport: ReturnType<typeof createThreeViewport> | undefined;
    try {
      viewport = createThreeViewport(container, "3D clay toolpath preview");
    } catch {
      setPreviewError("3D toolpath preview is unavailable in this browser. Layer details remain available below.");
      return;
    }

    const previous = addLineSegments(viewport.scene, positions.previous, 0x6d8794, 0.38);
    const current = addLineSegments(viewport.scene, positions.current, 0xe16119);
    const footprint = addLineSegments(
      viewport.scene,
      createBedFootprintPositions(bed),
      0x296888,
      0.8,
    );

    const bedSize = bed.shape === "rect" ? Math.max(bed.width, bed.depth) : bed.diameter;
    const grid = new THREE.GridHelper(
      bedSize,
      Math.max(10, Math.round(bedSize / 10)),
      0x82909a,
      0xd1d7da,
    );
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.01;
    viewport.scene.add(grid);

    const fitBounds = new THREE.Box3(
      new THREE.Vector3(bounds.min.x, bounds.min.y, bounds.min.z),
      new THREE.Vector3(bounds.max.x, bounds.max.y, bounds.max.z),
    );
    const halfWidth = bed.shape === "rect" ? bed.width / 2 : bed.diameter / 2;
    const halfDepth = bed.shape === "rect" ? bed.depth / 2 : bed.diameter / 2;
    fitBounds.expandByPoint(new THREE.Vector3(-halfWidth, -halfDepth, 0));
    fitBounds.expandByPoint(new THREE.Vector3(halfWidth, halfDepth, 0));
    viewport.fitToBox(fitBounds);
    viewport.invalidate();

    return () => {
      for (const entry of [previous, current, footprint]) {
        if (!entry) continue;
        viewport?.scene.remove(entry.line);
        entry.geometry.dispose();
        entry.material.dispose();
      }
      viewport?.scene.remove(grid);
      grid.geometry.dispose();
      const materials = Array.isArray(grid.material) ? grid.material : [grid.material];
      materials.forEach((material) => material.dispose());
      viewport?.dispose();
    };
  }, [bed, bounds, positions, segmentCount]);

  if (segmentCount === 0 || !bounds) {
    return (
      <section aria-label="Toolpath preview">
        <p role="status">No drawable extrusion moves were found in this toolpath.</p>
      </section>
    );
  }

  const layerCount = toolpath.layers.length;
  const layerNumber = layerIndex + 1;

  return (
    <section aria-label="Toolpath preview">
      <div
        ref={containerRef}
        data-testid="toolpath-preview-viewport"
        style={{ minHeight: 360, position: "relative", width: "100%" }}
      />
      {previewError && <p role="alert">{previewError}</p>}
      {positions.capped && (
        <p role="status">
          Toolpath exceeds the display limit; showing the current layer only for performance.
        </p>
      )}
      <label htmlFor="toolpath-layer">
        Layer {layerNumber} of {layerCount}
      </label>
      <input
        id="toolpath-layer"
        type="range"
        min={0}
        max={Math.max(0, layerCount - 1)}
        step={1}
        value={layerIndex}
        aria-valuetext={`Layer ${layerNumber} of ${layerCount}`}
        onChange={(event) => setLayerState({
          toolpath,
          layerIndex: Number(event.target.value),
          showThroughCurrent,
        })}
      />
      <label>
        <input
          type="checkbox"
          checked={showThroughCurrent}
          onChange={(event) => setLayerState({
            toolpath,
            layerIndex,
            showThroughCurrent: event.target.checked,
          })}
        />
        Show all layers through current
      </label>
      <p>
        {positions.visibleSegmentCount.toLocaleString()} visible extrusion segments from
        {" "}{segmentCount.toLocaleString()} total. Selected bed: {bedSummary(bed)}.
      </p>
    </section>
  );
}
