import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getGcodeStats } from "../src/gcode-stats";

const fixture = (name: string) =>
  readFileSync(resolve("tests/fixtures", name), "utf8");

describe("getGcodeStats", () => {
  it("returns exact finite statistics for real Kiri output", () => {
    const stats = getGcodeStats(fixture("kiri-sample.gcode"));

    expect(stats.lineCount).toBe(81);
    expect(stats.layerCount).toBe(5);
    expect(stats.estFilamentMm).toBeCloseTo(273.061, 6);
    expect(stats.heatingCommands).toEqual([]);
    expect(stats.estTimeMin).toBeGreaterThan(0);
    expect(Object.values(stats).flatMap((value) =>
      typeof value === "number" ? [value] : [],
    ).every(Number.isFinite)).toBe(true);
  });

  it("handles absolute and relative E without counting retractions", () => {
    const stats = getGcodeStats(fixture("modal-modes.gcode"));

    expect(stats.estFilamentMm).toBeCloseTo(6.94);
    expect(stats.heatingCommands).toEqual([{ code: "M104", line: 25 }]);
    expect(stats.estTimeMin).toBeCloseTo(0.09282, 4);
  });

  it("counts physical lines without the synthetic trailing item", () => {
    expect(getGcodeStats("").lineCount).toBe(0);
    expect(getGcodeStats("G1 X1 F60").lineCount).toBe(1);
    expect(getGcodeStats("G1 X1 F60\n").lineCount).toBe(1);
    expect(getGcodeStats("G1 X1 F60\n\n").lineCount).toBe(2);
  });

  it("uses marker layers first and extrusion-Z fallback otherwise", () => {
    const marked = getGcodeStats(
      ";; --- layer 8 (1.000 @ 1) ---\nM83\nG1 X1 Z1 E1 F60\n" +
      ";; --- layer 9 (1.000 @ 2) ---\nG1 X2 Z2 E1\n",
    );
    const fallback = getGcodeStats("M83\nG1 X1 Z1 E1 F60\nG1 X2 Z2 E1\n");

    expect(marked.layerCount).toBe(2);
    expect(fallback.layerCount).toBe(2);
  });

  it("estimates XYZ and E-only time while treating missing feed as unknown", () => {
    const stats = getGcodeStats("G1 X60 F60\nG1 E30 F60\nG1 X120\nG1 X180 F0\n");

    expect(stats.estTimeMin).toBe(2.5);
    expect(Number.isFinite(stats.estTimeMin)).toBe(true);
  });

  it("does not detect heating commands inside comments or as partial codes", () => {
    const stats = getGcodeStats(
      "; M104 S200\n(M109 S200)\nM1040 S1\nM104 S0\nm190 s0\n",
    );

    expect(stats.heatingCommands).toEqual([
      { code: "M104", line: 4 },
      { code: "M190", line: 5 },
    ]);
  });

  it("never returns NaN or infinity for malformed and unsupported input", () => {
    const stats = getGcodeStats("G1 XNaN Fnope\nG2 X1 Y1\nunknown\n");

    expect(stats).toEqual({
      lineCount: 3,
      layerCount: 0,
      estTimeMin: 0,
      estFilamentMm: 0,
      heatingCommands: [],
    });
  });
});
