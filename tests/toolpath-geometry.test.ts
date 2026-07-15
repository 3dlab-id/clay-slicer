import type { Segment, Toolpath } from "../src/domain";
import {
  buildToolpathPositions,
  clampLayerIndex,
  countToolpathSegments,
  getToolpathBounds,
  lastLayerIndex,
} from "../src/lib/toolpath-geometry";

function segment(
  start: [number, number, number],
  end: [number, number, number],
): Segment {
  return {
    start: { x: start[0], y: start[1], z: start[2] },
    end: { x: end[0], y: end[1], z: end[2] },
    extrusionMm: 1,
    sourceLine: 1,
  };
}

const first = segment([0, 0, 1], [1, 0, 1]);
const second = segment([1, 0, 2], [1, 1, 2]);
const third = segment([1, 1, 3], [0, 1, 3]);
const toolpath: Toolpath = {
  layers: [[first], [second], [third]],
  layerZ: [1, 2, 3],
};

describe("toolpath geometry", () => {
  it("packs current and prior layer coordinates without per-segment objects", () => {
    const positions = buildToolpathPositions(toolpath, 2, true);
    expect(Array.from(positions.current)).toEqual([1, 1, 3, 0, 1, 3]);
    expect(Array.from(positions.previous)).toEqual([
      0, 0, 1, 1, 0, 1,
      1, 0, 2, 1, 1, 2,
    ]);
    expect(positions.visibleSegmentCount).toBe(3);
    expect(positions.capped).toBe(false);
  });

  it("supports current-layer-only mode and empty layers", () => {
    const withEmpty: Toolpath = { layers: [[first], [], [third]], layerZ: [1, 2, 3] };
    const currentOnly = buildToolpathPositions(withEmpty, 2, false);
    expect(currentOnly.previous).toHaveLength(0);
    expect(currentOnly.current).toHaveLength(6);
    expect(currentOnly.visibleSegmentCount).toBe(1);

    const empty = buildToolpathPositions(withEmpty, 1, true);
    expect(empty.current).toHaveLength(0);
    expect(empty.previous).toHaveLength(6);
  });

  it("caps all-through-current before allocating prior-layer positions", () => {
    const capped = buildToolpathPositions(toolpath, 2, true, 2);
    expect(capped.capped).toBe(true);
    expect(capped.previous).toHaveLength(0);
    expect(capped.current).toHaveLength(6);
    expect(capped.visibleSegmentCount).toBe(1);
  });

  it("clamps first/middle/last indexes and counts segments", () => {
    expect(clampLayerIndex(toolpath, -10)).toBe(0);
    expect(clampLayerIndex(toolpath, 1)).toBe(1);
    expect(clampLayerIndex(toolpath, 99)).toBe(2);
    expect(lastLayerIndex(toolpath)).toBe(2);
    expect(lastLayerIndex({ layers: [], layerZ: [] })).toBe(0);
    expect(countToolpathSegments(toolpath)).toBe(3);
  });

  it("calculates finite bounds and ignores invalid points", () => {
    const invalid = segment([Number.NaN, 0, 0], [4, 5, 6]);
    expect(getToolpathBounds({ layers: [[first], [invalid]], layerZ: [1, 2] })).toEqual({
      min: { x: 0, y: 0, z: 1 },
      max: { x: 4, y: 5, z: 6 },
      size: { x: 4, y: 5, z: 5 },
    });
    expect(getToolpathBounds({ layers: [[], []], layerZ: [1, 2] })).toBeUndefined();
  });
});
