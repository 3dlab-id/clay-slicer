import type { Bed } from "../domain";

export const DEFAULT_CIRCLE_SEGMENTS = 64;

function validateCircleSegments(segments: number): void {
  if (!Number.isInteger(segments) || segments < 3) {
    throw new RangeError("A circular bed requires at least 3 line segments.");
  }
}

function pushSegment(
  positions: number[],
  start: readonly [number, number, number],
  end: readonly [number, number, number],
): void {
  positions.push(...start, ...end);
}

function pushRectLoop(
  positions: number[],
  width: number,
  depth: number,
  z: number,
): void {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const corners = [
    [-halfWidth, -halfDepth, z],
    [halfWidth, -halfDepth, z],
    [halfWidth, halfDepth, z],
    [-halfWidth, halfDepth, z],
  ] as const;
  for (let index = 0; index < corners.length; index += 1) {
    pushSegment(positions, corners[index]!, corners[(index + 1) % corners.length]!);
  }
}

function pushCircleLoop(
  positions: number[],
  diameter: number,
  z: number,
  segments: number,
): void {
  validateCircleSegments(segments);
  const radius = diameter / 2;
  for (let index = 0; index < segments; index += 1) {
    const startAngle = (index / segments) * Math.PI * 2;
    const endAngle = ((index + 1) / segments) * Math.PI * 2;
    pushSegment(
      positions,
      [Math.cos(startAngle) * radius, Math.sin(startAngle) * radius, z],
      [Math.cos(endAngle) * radius, Math.sin(endAngle) * radius, z],
    );
  }
}

export function createBedFootprintPositions(
  bed: Bed,
  circleSegments = DEFAULT_CIRCLE_SEGMENTS,
): Float32Array {
  const positions: number[] = [];
  if (bed.shape === "rect") {
    pushRectLoop(positions, bed.width, bed.depth, 0);
  } else {
    pushCircleLoop(positions, bed.diameter, 0, circleSegments);
  }
  return new Float32Array(positions);
}

export function createBedVolumePositions(
  bed: Bed,
  circleSegments = DEFAULT_CIRCLE_SEGMENTS,
): Float32Array {
  const positions: number[] = [];
  if (bed.shape === "rect") {
    pushRectLoop(positions, bed.width, bed.depth, 0);
    pushRectLoop(positions, bed.width, bed.depth, bed.maxHeight);
    const halfWidth = bed.width / 2;
    const halfDepth = bed.depth / 2;
    for (const [x, y] of [
      [-halfWidth, -halfDepth],
      [halfWidth, -halfDepth],
      [halfWidth, halfDepth],
      [-halfWidth, halfDepth],
    ] as const) {
      pushSegment(positions, [x, y, 0], [x, y, bed.maxHeight]);
    }
  } else {
    pushCircleLoop(positions, bed.diameter, 0, circleSegments);
    pushCircleLoop(positions, bed.diameter, bed.maxHeight, circleSegments);
    const radius = bed.diameter / 2;
    for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      pushSegment(positions, [x, y, 0], [x, y, bed.maxHeight]);
    }
  }
  return new Float32Array(positions);
}
