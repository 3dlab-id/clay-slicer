import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { parseToolpath } from "../src/gcode-toolpath";

const fixture = (name: string) =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

describe("parseToolpath", () => {
  it("parses exact layers and representative coordinates from real Kiri output", () => {
    const toolpath = parseToolpath(fixture("kiri-sample.gcode"));

    expect(toolpath.layers).toHaveLength(5);
    expect(toolpath.layerZ).toEqual([1, 2, 3, 4, 5]);
    expect(toolpath.layers.map((layer) => layer.length)).toEqual([12, 4, 4, 4, 4]);
    expect(toolpath.layers[0]?.[0]).toEqual({
      start: { x: 102.75, y: 107.75, z: 1 },
      end: { x: 102.75, y: 126.25, z: 1 },
      extrusionMm: 11.3265,
      feedMmPerMin: 1800,
      sourceLine: 27,
    });
    expect(toolpath.layers[4]?.[3]).toMatchObject({
      start: { x: 107.75, y: 112.75, z: 5 },
      end: { x: 107.75, y: 121.25, z: 5 },
      feedMmPerMin: 300,
      sourceLine: 75,
    });
    expect(toolpath.layers[4]?.[3]?.extrusionMm).toBeCloseTo(5.2041);
  });

  it("excludes travel, retraction, and E-only priming moves", () => {
    const toolpath = parseToolpath(fixture("kiri-sample.gcode"));
    const sourceLines = toolpath.layers.flat().map((segment) => segment.sourceLine);

    expect(sourceLines).not.toContain(26); // XY travel
    expect(sourceLines).not.toContain(31); // E-only zero retract
    expect(sourceLines).not.toContain(32); // Z travel
    expect(sourceLines).not.toContain(33); // XY travel
    expect(sourceLines).not.toContain(38); // E-only zero retract
    expect(sourceLines).not.toContain(41); // XY travel
  });

  it("keeps positive relative extrusion and rejects retraction", () => {
    const toolpath = parseToolpath(
      "M83\nG1 X1 E1 F600\nG1 X2 E-0.5\nG1 X3 E0.25\nG1 E1\n",
    );

    expect(toolpath.layers).toHaveLength(1);
    expect(toolpath.layers[0]?.map((segment) => segment.extrusionMm)).toEqual([1, 0.25]);
    expect(toolpath.layers[0]?.map((segment) => segment.sourceLine)).toEqual([2, 4]);
  });

  it("handles absolute extrusion and G92 resets", () => {
    const toolpath = parseToolpath(
      "M82\nG92 E10\nG1 X1 E11 F600\nG1 X2 E11\nG92 E0\nG1 X3 E0.5\n",
    );

    expect(toolpath.layers[0]?.map((segment) => segment.extrusionMm)).toEqual([1, 0.5]);
    expect(toolpath.layers[0]?.map((segment) => segment.sourceLine)).toEqual([3, 6]);
  });

  it("groups marker-free output by discrete extrusion Z", () => {
    const toolpath = parseToolpath(
      "M83\nG1 Z1 F600\nG1 X1 E1\nG1 Z2\nG1 X2 E1\n",
    );

    expect(toolpath.layerZ).toEqual([1, 2]);
    expect(toolpath.layers.map((layer) => layer.length)).toEqual([1, 1]);
  });

  it("buckets continuous vase Z with a layer-height hint", () => {
    const toolpath = parseToolpath(
      "M83\nG1 X1 Z0.1 E1 F600\nG1 X2 Z0.4 E1\nG1 X3 Z0.61 E1\nG1 X4 Z1.1 E1\n",
      { layerHeightHint: 0.5 },
    );

    expect(toolpath.layerZ).toEqual([0.1, 0.6, 1.1]);
    expect(toolpath.layers.map((layer) => layer.length)).toEqual([2, 1, 1]);
  });

  it("preserves negative coordinates and three-dimensional Z values", () => {
    const toolpath = parseToolpath("M83\nG1 X-2 Y-3 Z0.4 E1 F600\n");

    expect(toolpath.layers[0]?.[0]).toMatchObject({
      start: { x: 0, y: 0, z: 0 },
      end: { x: -2, y: -3, z: 0.4 },
    });
  });

  it.each([
    ["empty input", ""],
    ["comments only", "; nothing printable\n(M83 G1 X1 E1)\n"],
    ["travel only", "G1 X10 Y10 F600\nG1 Z1\n"],
    ["E-only extrusion", "M83\nG1 E1 F60\n"],
  ])("returns an empty toolpath for %s", (_label, gcode) => {
    expect(parseToolpath(gcode)).toEqual({ layers: [], layerZ: [] });
  });

  it("does not mutate input and tolerates unknown commands", () => {
    const gcode = "M83\nM900 K1\nG2 X10 Y10\nG1 X-1 Y2 Z0.5 E1 F600\n";
    const original = gcode.slice();

    expect(parseToolpath(gcode)).toEqual({
      layers: [
        [
          {
            start: { x: 0, y: 0, z: 0 },
            end: { x: -1, y: 2, z: 0.5 },
            extrusionMm: 1,
            feedMmPerMin: 600,
            sourceLine: 4,
          },
        ],
      ],
      layerZ: [0.5],
    });
    expect(gcode).toBe(original);
  });
});
