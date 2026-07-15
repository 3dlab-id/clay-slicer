import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { groupExtrusionMotions, scanGcode } from "../src/gcode-motion";

const fixture = (name: string) =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

describe("scanGcode", () => {
  it("recognizes the real Kiri layer markers and finite modal motion", () => {
    const gcode = fixture("kiri-sample.gcode");
    const scan = scanGcode(gcode);

    expect(scan.lineCount).toBe(81);
    expect(scan.layerMarkers).toEqual([
      { index: 0, z: 1, sourceLine: 23 },
      { index: 1, z: 2, sourceLine: 47 },
      { index: 2, z: 3, sourceLine: 55 },
      { index: 3, z: 4, sourceLine: 62 },
      { index: 4, z: 5, sourceLine: 69 },
    ]);
    expect(scan.motions.every((motion) =>
      [
        ...Object.values(motion.start),
        ...Object.values(motion.end),
        motion.startE,
        motion.endE,
        motion.deltaE,
        motion.distanceMm,
        motion.estMinutes ?? 0,
      ].every(Number.isFinite),
    )).toBe(true);

    const firstExtrusion = scan.motions.find((motion) => motion.deltaE > 0);
    expect(firstExtrusion).toMatchObject({
      start: { x: 102.75, y: 107.75, z: 1 },
      end: { x: 102.75, y: 126.25, z: 1 },
      deltaE: 11.3265,
      feedMmPerMin: 1800,
      layerIndex: 0,
    });
  });

  it("applies absolute and relative XYZ and extrusion modes", () => {
    const scan = scanGcode(fixture("modal-modes.gcode"));
    const byLine = new Map(scan.motions.map((motion) => [motion.sourceLine, motion]));

    expect(byLine.get(6)).toMatchObject({
      start: { x: 0, y: 0, z: 0.5 },
      end: { x: 10, y: 0, z: 0.5 },
      deltaE: 1,
    });
    expect(byLine.get(7)?.deltaE).toBe(0);
    expect(byLine.get(9)).toMatchObject({ end: { x: 15, y: 5, z: 0.5 }, deltaE: 0.5 });
    expect(byLine.get(11)?.deltaE).toBeCloseTo(-0.2);
    expect(byLine.get(12)?.deltaE).toBeCloseTo(0.2);
    expect(byLine.get(14)).toMatchObject({ end: { x: 20, y: 7, z: 0.5 }, deltaE: 0.4 });
    expect(byLine.get(15)?.end).toEqual({ x: 25, y: 7, z: 0.5 });
    expect(byLine.get(15)?.deltaE).toBeCloseTo(0.3);
  });

  it("converts inch coordinates, extrusion, and feedrate to millimetres", () => {
    const scan = scanGcode(fixture("modal-modes.gcode"));
    const inchMotion = scan.motions.find((motion) => motion.sourceLine === 17);

    expect(inchMotion).toMatchObject({
      start: { x: 25, y: 7, z: 0.5 },
      end: { x: 50.4, y: 7, z: 0.5 },
      feedMmPerMin: 1524,
    });
    expect(inchMotion?.deltaE).toBeCloseTo(2.54);
    expect(inchMotion?.estMinutes).toBeCloseTo(1 / 60);
  });

  it("handles G92 resets, E-only moves, and zero-length moves", () => {
    const scan = scanGcode(fixture("modal-modes.gcode"));
    const eOnly = scan.motions.find((motion) => motion.sourceLine === 22);
    const zeroLength = scan.motions.find((motion) => motion.sourceLine === 23);

    expect(eOnly).toMatchObject({
      start: { x: 0, y: 0, z: 0 },
      end: { x: 0, y: 0, z: 0 },
      startE: 0,
      endE: 2,
      deltaE: 2,
      distanceMm: 0,
    });
    expect(eOnly?.estMinutes).toBeCloseTo(1 / 60);
    expect(zeroLength).toMatchObject({ deltaE: 0, distanceMm: 0, estMinutes: 0 });
  });

  it("ignores commands in comments but records exact executable heating commands", () => {
    const scan = scanGcode(fixture("modal-modes.gcode"));

    expect(scan.heatingCommands).toEqual([{ code: "M104", line: 25 }]);
  });

  it("supports compact words, arbitrary order, CRLF, modal continuation, and missing feed", () => {
    const scan = scanGcode("M83\r\nX1E.5 G1\r\nY+2E.25\r\nG1 X3\r\nM84\r\n");

    expect(scan.lineCount).toBe(5);
    expect(scan.motions).toHaveLength(3);
    expect(scan.motions[0]).toMatchObject({ end: { x: 1, y: 0, z: 0 }, deltaE: 0.5 });
    expect(scan.motions[1]).toMatchObject({ end: { x: 1, y: 2, z: 0 }, deltaE: 0.25 });
    expect(scan.motions[2]?.estMinutes).toBeUndefined();
  });

  it("tolerates unknown commands and does not interpret arcs as linear motion", () => {
    const scan = scanGcode("G1 X1 F60\nG2 X10 Y10 I2 J2\nG28 X0\nM900 K1\nX2\n");

    expect(scan.motions).toHaveLength(2);
    expect(scan.motions[0]?.end.x).toBe(1);
    expect(scan.motions[1]?.end.x).toBe(2);
  });
});

describe("groupExtrusionMotions", () => {
  it("groups by Kiri markers when they are present", () => {
    const layers = groupExtrusionMotions(scanGcode(fixture("kiri-sample.gcode")).motions);

    expect(layers.map((layer) => layer.index)).toEqual([0, 1, 2, 3, 4]);
    expect(layers.map((layer) => layer.z)).toEqual([1, 2, 3, 4, 5]);
  });

  it("falls back to discrete extrusion Z changes", () => {
    const scan = scanGcode("M83\nG1 Z1 F600\nG1 X1 E1\nG1 Z2\nG1 X2 E1\n");
    const layers = groupExtrusionMotions(scan.motions);

    expect(layers.map((layer) => layer.z)).toEqual([1, 2]);
  });

  it("uses a layer-height hint for continuous vase Z", () => {
    const scan = scanGcode(
      "M83\nG1 X1 Z0.1 E1 F600\nG1 X2 Z0.4 E1\nG1 X3 Z0.61 E1\nG1 X4 Z1.1 E1\n",
    );
    const layers = groupExtrusionMotions(scan.motions, 0.5);

    expect(layers.map((layer) => layer.motions.length)).toEqual([2, 1, 1]);
  });
});
