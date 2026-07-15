import type { ClayControls } from "../src/clay-profile";
import type { Bed, GcodeStats, ModelAnalysis } from "../src/domain";
import {
  GUARDRAIL_TOLERANCE,
  evaluateGcodeGuardrails,
  evaluateGuardrails,
  evaluateModelGuardrails,
} from "../src/guardrails";
import type { MachinePreset } from "../src/machines";
import { getMachinePreset } from "../src/machines";
import { OVERHANG_WARNING_FRACTION } from "../src/model-analysis";

const controls: ClayControls = {
  layerHeight: 0.75,
  lineWidth: 1.5,
  printSpeed: 25,
  vaseMode: true,
};

function model(
  size = { x: 20, y: 10, z: 5 },
  overrides: Partial<ModelAnalysis> = {},
): ModelAnalysis {
  return {
    bounds: {
      min: { x: -size.x / 2, y: -size.y / 2, z: 0 },
      max: { x: size.x / 2, y: size.y / 2, z: size.z },
      size,
    },
    triangleCount: 12,
    sourceBytes: 1024,
    overhangFraction: 0,
    isHuge: false,
    ...overrides,
  };
}

function preset(bed: Bed): MachinePreset {
  return {
    ...getMachinePreset("ender3-clay")!,
    bed,
  };
}

function warningIds(
  analysis: ModelAnalysis,
  machine = getMachinePreset("ender3-clay")!,
  selectedControls = controls,
): string[] {
  return evaluateModelGuardrails({
    model: analysis,
    preset: machine,
    controls: selectedControls,
  }).map(({ id }) => id);
}

describe("model fit guardrails", () => {
  const rectangular = preset({ shape: "rect", width: 20, depth: 10, maxHeight: 5 });

  it("passes exact rectangular width, depth, and height boundaries", () => {
    expect(warningIds(model(), rectangular)).not.toContain("fit-footprint");
    expect(warningIds(model(), rectangular)).not.toContain("fit-height");
  });

  it.each([
    ["width", { x: 20 + GUARDRAIL_TOLERANCE * 2, y: 10, z: 5 }, "fit-footprint"],
    ["depth", { x: 20, y: 10 + GUARDRAIL_TOLERANCE * 2, z: 5 }, "fit-footprint"],
    ["height", { x: 20, y: 10, z: 5 + GUARDRAIL_TOLERANCE * 2 }, "fit-height"],
  ])("fails a small excess in %s", (_axis, size, expectedId) => {
    expect(warningIds(model(size), rectangular)).toContain(expectedId);
  });

  it("passes an exact circular corner radius and fails a small excess", () => {
    const circular = preset({ shape: "circular", diameter: 200, maxHeight: 50 });
    expect(warningIds(model({ x: 120, y: 160, z: 5 }), circular)).not.toContain("fit-footprint");
    expect(warningIds(
      model({ x: 120 + GUARDRAIL_TOLERANCE * 4, y: 160, z: 5 }),
      circular,
    )).toContain("fit-footprint");
  });

  it("rejects a circular-bed box whose individual dimensions fit but diagonal does not", () => {
    const circular = preset({ shape: "circular", diameter: 200, maxHeight: 50 });
    expect(warningIds(model({ x: 190, y: 190, z: 5 }), circular)).toContain("fit-footprint");
  });
});

describe("process guardrails", () => {
  const machine = getMachinePreset("ender3-clay")!;

  it.each([
    ["below", 0.3 * machine.nozzleDiameter - GUARDRAIL_TOLERANCE * 2, true],
    ["minimum", 0.3 * machine.nozzleDiameter, false],
    ["inside", 0.5 * machine.nozzleDiameter, false],
    ["maximum", 0.7 * machine.nozzleDiameter, false],
    ["above", 0.7 * machine.nozzleDiameter + GUARDRAIL_TOLERANCE * 2, true],
  ])("handles the %s layer/nozzle boundary", (_case, layerHeight, expected) => {
    const ids = warningIds(model(), machine, { ...controls, layerHeight });
    expect(ids.includes("layer-nozzle")).toBe(expected);
  });

  it("emits a deterministic static feature advisory when no estimate exists", () => {
    const first = evaluateModelGuardrails({ model: model(), preset: machine, controls });
    const second = evaluateModelGuardrails({ model: model(), preset: machine, controls });
    const advisory = first.find(({ id }) => id === "feature-resolution");

    expect(advisory?.severity).toBe("info");
    expect(advisory?.message).toMatch(/general advisory, not exact model analysis/i);
    expect(advisory).toEqual(second.find(({ id }) => id === "feature-resolution"));
  });

  it("warns for an estimated feature below the nozzle and passes at or above it", () => {
    const below = evaluateModelGuardrails({
      model: model(undefined, { estimatedFeatureSizeMm: 1.49 }),
      preset: machine,
      controls,
    }).find(({ id }) => id === "feature-resolution");
    expect(below?.severity).toBe("warn");

    for (const estimatedFeatureSizeMm of [1.5, 1.6]) {
      expect(warningIds(model(undefined, { estimatedFeatureSizeMm }), machine))
        .not.toContain("feature-resolution");
    }
  });

  it.each([
    ["below", OVERHANG_WARNING_FRACTION - GUARDRAIL_TOLERANCE * 2, false],
    ["at", OVERHANG_WARNING_FRACTION, false],
    ["above", OVERHANG_WARNING_FRACTION + GUARDRAIL_TOLERANCE * 2, true],
  ])("handles overhang immediately %s 10%%", (_case, overhangFraction, expected) => {
    const warnings = evaluateModelGuardrails({
      model: model(undefined, { overhangFraction }),
      preset: machine,
      controls,
    });
    const warning = warnings.find(({ id }) => id === "overhang-advisory");
    expect(Boolean(warning)).toBe(expected);
    if (warning) {
      expect(warning.message).toMatch(/advisory/i);
      expect(warning.message).toMatch(/supports are not generated/i);
    }
  });

  it("reflects the model's huge flag", () => {
    expect(warningIds(model(undefined, { isHuge: false }))).not.toContain("huge-model");
    expect(warningIds(model(undefined, { isHuge: true }))).toContain("huge-model");
  });
});

describe("G-code and combined guardrails", () => {
  const cleanStats: GcodeStats = {
    lineCount: 20,
    layerCount: 2,
    estTimeMin: 1,
    estFilamentMm: 10,
    heatingCommands: [],
  };

  it("reports unique heating codes and sorted source lines", () => {
    const warnings = evaluateGcodeGuardrails({
      ...cleanStats,
      heatingCommands: [
        { code: "M140", line: 20 },
        { code: "M104", line: 8 },
        { code: "M104", line: 8 },
        { code: "M104", line: 12 },
      ],
    });

    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ id: "heating-commands", severity: "error" });
    expect(warnings[0]!.message.match(/M104/g)).toHaveLength(1);
    expect(warnings[0]!.message.match(/M140/g)).toHaveLength(1);
    expect(warnings[0]!.message).toContain("lines 8, 12, 20");
  });

  it("works before stats exist and keeps combined warning order stable", () => {
    const machine = getMachinePreset("ender3-clay")!;
    const analysis = model({ x: 300, y: 300, z: 300 }, {
      overhangFraction: 0.2,
      isHuge: true,
    });
    const args = {
      model: analysis,
      preset: machine,
      controls: { ...controls, layerHeight: 0.1 },
    };

    expect(evaluateGuardrails(args).map(({ id }) => id)).toEqual([
      "fit-footprint",
      "fit-height",
      "layer-nozzle",
      "feature-resolution",
      "overhang-advisory",
      "huge-model",
    ]);
    expect(evaluateGuardrails({
      ...args,
      stats: { ...cleanStats, heatingCommands: [{ code: "M109", line: 5 }] },
    }).map(({ id }) => id)).toEqual([
      "fit-footprint",
      "fit-height",
      "heating-commands",
      "layer-nozzle",
      "feature-resolution",
      "overhang-advisory",
      "huge-model",
    ]);
  });
});
