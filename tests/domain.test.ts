import { describe, expect, it } from "vitest";
import type {
  Bed,
  GcodeStats,
  ModelAnalysis,
  Toolpath,
  Warning,
} from "../src/domain";

describe("domain contracts", () => {
  it("represents rectangular and circular beds with a discriminated union", () => {
    const beds: Bed[] = [
      { shape: "rect", width: 234, depth: 234, maxHeight: 245 },
      { shape: "circular", diameter: 200, maxHeight: 400 },
    ];

    expect(beds.map((bed) => bed.shape)).toEqual(["rect", "circular"]);
  });

  it("represents model analysis and G-code results", () => {
    const model: ModelAnalysis = {
      bounds: {
        min: { x: -10, y: -5, z: 0 },
        max: { x: 10, y: 5, z: 5 },
        size: { x: 20, y: 10, z: 5 },
      },
      triangleCount: 12,
      sourceBytes: 1_024,
      overhangFraction: 0.1,
      isHuge: false,
    };
    const stats: GcodeStats = {
      lineCount: 10,
      layerCount: 1,
      estTimeMin: 0.5,
      estFilamentMm: 2,
      heatingCommands: [],
    };
    const toolpath: Toolpath = {
      layers: [
        [
          {
            start: { x: 0, y: 0, z: 1 },
            end: { x: 10, y: 0, z: 1 },
            extrusionMm: 1,
            feedMmPerMin: 1_500,
            sourceLine: 4,
          },
        ],
      ],
      layerZ: [1],
    };

    expect(model.bounds.size).toEqual({ x: 20, y: 10, z: 5 });
    expect(stats.heatingCommands).toHaveLength(0);
    expect(toolpath.layers[0]).toHaveLength(1);
  });

  it("uses stable warning severities", () => {
    const warning: Warning = {
      id: "model-fit",
      severity: "error",
      title: "Model does not fit",
      message: "Choose another machine or resize the model.",
    };

    expect(warning.severity).toBe("error");
  });
});
