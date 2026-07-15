import type { Bed } from "../src/domain";
import {
  DEFAULT_CIRCLE_SEGMENTS,
  createBedFootprintPositions,
  createBedVolumePositions,
} from "../src/lib/bed-geometry";

function points(positions: Float32Array): number[][] {
  const result: number[][] = [];
  for (let index = 0; index < positions.length; index += 3) {
    result.push(Array.from(positions.slice(index, index + 3)));
  }
  return result;
}

describe("bed geometry", () => {
  const rect: Bed = { shape: "rect", width: 20, depth: 10, maxHeight: 30 };
  const circle: Bed = { shape: "circular", diameter: 20, maxHeight: 30 };

  it("packs the four centered rectangular footprint edges", () => {
    const positions = createBedFootprintPositions(rect);
    expect(positions).toHaveLength(4 * 2 * 3);
    expect(points(positions)).toEqual([
      [-10, -5, 0], [10, -5, 0],
      [10, -5, 0], [10, 5, 0],
      [10, 5, 0], [-10, 5, 0],
      [-10, 5, 0], [-10, -5, 0],
    ]);
  });

  it("packs a visibly circular footprint at the exact radius", () => {
    const positions = createBedFootprintPositions(circle);
    expect(positions).toHaveLength(DEFAULT_CIRCLE_SEGMENTS * 2 * 3);
    for (const [x, y, z] of points(positions)) {
      expect(Math.hypot(x!, y!)).toBeCloseTo(10, 5);
      expect(z).toBe(0);
    }
    expect(new Set(points(positions).map(([x]) => x!.toFixed(3))).size).toBeGreaterThan(10);
  });

  it("adds top outlines and four verticals to both bed shapes", () => {
    const rectVolume = createBedVolumePositions(rect);
    const circleVolume = createBedVolumePositions(circle);
    expect(rectVolume).toHaveLength((4 + 4 + 4) * 2 * 3);
    expect(circleVolume).toHaveLength((DEFAULT_CIRCLE_SEGMENTS * 2 + 4) * 2 * 3);
    expect(points(rectVolume).some(([, , z]) => z === 30)).toBe(true);
    expect(points(circleVolume).some(([, , z]) => z === 30)).toBe(true);
    expect([...rectVolume, ...circleVolume].every(Number.isFinite)).toBe(true);
  });

  it("supports a lower segment count and rejects invalid circles", () => {
    expect(createBedFootprintPositions(circle, 8)).toHaveLength(8 * 2 * 3);
    expect(() => createBedFootprintPositions(circle, 2)).toThrow(/at least 3/i);
    expect(() => createBedVolumePositions(circle, 3.5)).toThrow(/at least 3/i);
  });
});
