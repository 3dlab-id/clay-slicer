import type { Bounds3, Segment, Toolpath } from "../domain";

export const MAX_VISIBLE_SEGMENTS = 1_000_000;

export interface ToolpathPositions {
  current: Float32Array;
  previous: Float32Array;
  visibleSegmentCount: number;
  capped: boolean;
}

export function lastLayerIndex(toolpath: Toolpath): number {
  return Math.max(0, toolpath.layers.length - 1);
}

export function clampLayerIndex(toolpath: Toolpath, layerIndex: number): number {
  if (toolpath.layers.length === 0) return 0;
  return Math.min(Math.max(Math.trunc(layerIndex), 0), toolpath.layers.length - 1);
}

export function countToolpathSegments(toolpath: Toolpath): number {
  return toolpath.layers.reduce((count, layer) => count + layer.length, 0);
}

function packSegments(segments: readonly Segment[]): Float32Array {
  const positions = new Float32Array(segments.length * 2 * 3);
  let offset = 0;
  for (const segment of segments) {
    positions[offset++] = segment.start.x;
    positions[offset++] = segment.start.y;
    positions[offset++] = segment.start.z;
    positions[offset++] = segment.end.x;
    positions[offset++] = segment.end.y;
    positions[offset++] = segment.end.z;
  }
  return positions;
}

function packLayers(layers: readonly Segment[][], lastExclusive: number): Float32Array {
  let segmentCount = 0;
  for (let index = 0; index < lastExclusive; index += 1) {
    segmentCount += layers[index]?.length ?? 0;
  }

  const positions = new Float32Array(segmentCount * 2 * 3);
  let offset = 0;
  for (let index = 0; index < lastExclusive; index += 1) {
    for (const segment of layers[index] ?? []) {
      positions[offset++] = segment.start.x;
      positions[offset++] = segment.start.y;
      positions[offset++] = segment.start.z;
      positions[offset++] = segment.end.x;
      positions[offset++] = segment.end.y;
      positions[offset++] = segment.end.z;
    }
  }
  return positions;
}

export function buildToolpathPositions(
  toolpath: Toolpath,
  layerIndex: number,
  showThroughCurrent: boolean,
  maxVisibleSegments = MAX_VISIBLE_SEGMENTS,
): ToolpathPositions {
  const currentIndex = clampLayerIndex(toolpath, layerIndex);
  const currentLayer = toolpath.layers[currentIndex] ?? [];
  let throughCurrentCount = currentLayer.length;
  if (showThroughCurrent) {
    for (let index = 0; index < currentIndex; index += 1) {
      throughCurrentCount += toolpath.layers[index]?.length ?? 0;
    }
  }
  const capped = showThroughCurrent && throughCurrentCount > maxVisibleSegments;

  return {
    current: packSegments(currentLayer),
    previous: showThroughCurrent && !capped
      ? packLayers(toolpath.layers, currentIndex)
      : new Float32Array(),
    visibleSegmentCount: capped ? currentLayer.length : throughCurrentCount,
    capped,
  };
}

export function getToolpathBounds(toolpath: Toolpath): Bounds3 | undefined {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;

  const includePoint = (point: Segment["start"]) => {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !Number.isFinite(point.z)) {
      return;
    }
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    minZ = Math.min(minZ, point.z);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
    maxZ = Math.max(maxZ, point.z);
  };

  for (const layer of toolpath.layers) {
    for (const { start, end } of layer) {
      includePoint(start);
      includePoint(end);
    }
  }

  if (!Number.isFinite(minX)) return undefined;
  return {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
    size: { x: maxX - minX, y: maxY - minY, z: maxZ - minZ },
  };
}
