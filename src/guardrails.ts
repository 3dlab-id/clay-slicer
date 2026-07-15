import type { ClayControls } from "./clay-profile";
import type { GcodeStats, ModelAnalysis, Warning } from "./domain";
import type { MachinePreset } from "./machines";
import { OVERHANG_WARNING_FRACTION } from "./model-analysis";

/** Shared tolerance for exact guardrail boundaries and floating-point noise. */
export const GUARDRAIL_TOLERANCE = 1e-9;

const WARNING_ORDER: readonly Warning["id"][] = [
  "fit-footprint",
  "fit-height",
  "heating-commands",
  "layer-nozzle",
  "feature-resolution",
  "overhang-advisory",
  "huge-model",
];

function footprintWarning(model: ModelAnalysis, preset: MachinePreset): Warning | undefined {
  const { x: width, y: depth } = model.bounds.size;
  const { bed } = preset;
  const fits = bed.shape === "rect"
    ? width <= bed.width + GUARDRAIL_TOLERANCE &&
      depth <= bed.depth + GUARDRAIL_TOLERANCE
    : Math.hypot(width / 2, depth / 2) <=
      bed.diameter / 2 + GUARDRAIL_TOLERANCE;

  if (fits) return undefined;

  const capacity = bed.shape === "rect"
    ? `${bed.width} × ${bed.depth} mm rectangular bed`
    : `${bed.diameter} mm diameter circular bed`;
  return {
    id: "fit-footprint",
    severity: "error",
    title: "Model exceeds the bed footprint",
    message: `The centered ${width.toFixed(2)} × ${depth.toFixed(2)} mm model does not fit the ${capacity} on ${preset.name}.`,
  };
}

function heightWarning(model: ModelAnalysis, preset: MachinePreset): Warning | undefined {
  const height = model.bounds.size.z;
  if (height <= preset.bed.maxHeight + GUARDRAIL_TOLERANCE) return undefined;
  return {
    id: "fit-height",
    severity: "error",
    title: "Model exceeds the printer height",
    message: `The ${height.toFixed(2)} mm model is taller than ${preset.name}'s ${preset.bed.maxHeight} mm build height.`,
  };
}

function layerNozzleWarning(
  controls: ClayControls,
  preset: MachinePreset,
): Warning | undefined {
  const minimum = preset.nozzleDiameter * 0.3;
  const maximum = preset.nozzleDiameter * 0.7;
  if (
    controls.layerHeight >= minimum - GUARDRAIL_TOLERANCE &&
    controls.layerHeight <= maximum + GUARDRAIL_TOLERANCE
  ) {
    return undefined;
  }

  return {
    id: "layer-nozzle",
    severity: "warn",
    title: "Layer height may be risky for clay",
    message: `Use roughly 0.3–0.7 × the ${preset.nozzleDiameter.toFixed(2)} mm nozzle (${minimum.toFixed(2)}–${maximum.toFixed(2)} mm). The selected layer height is ${controls.layerHeight.toFixed(2)} mm.`,
  };
}

function featureResolutionWarning(
  model: ModelAnalysis,
  preset: MachinePreset,
  controls: ClayControls,
): Warning | undefined {
  const estimated = model.estimatedFeatureSizeMm;
  if (estimated !== undefined) {
    if (estimated >= preset.nozzleDiameter - GUARDRAIL_TOLERANCE) return undefined;
    return {
      id: "feature-resolution",
      severity: "warn",
      title: "Fine details may be lost",
      message: `The estimated ${estimated.toFixed(2)} mm feature size is narrower than the ${preset.nozzleDiameter.toFixed(2)} mm nozzle. This estimate is advisory, not exact model analysis.`,
    };
  }

  return {
    id: "feature-resolution",
    severity: "info",
    title: "Check fine details",
    message: `This is a general advisory, not exact model analysis: details narrower than the ${preset.nozzleDiameter.toFixed(2)} mm nozzle or ${controls.lineWidth.toFixed(2)} mm selected line width may be lost.`,
  };
}

function overhangWarning(model: ModelAnalysis): Warning | undefined {
  if (model.overhangFraction <= OVERHANG_WARNING_FRACTION + GUARDRAIL_TOLERANCE) {
    return undefined;
  }
  return {
    id: "overhang-advisory",
    severity: "warn",
    title: "Overhangs may slump",
    message: `${(model.overhangFraction * 100).toFixed(1)}% of the analyzed surface is a downward overhang. This heuristic is advisory, and supports are not generated for clay prints.`,
  };
}

function hugeModelWarning(model: ModelAnalysis): Warning | undefined {
  if (!model.isHuge) return undefined;
  return {
    id: "huge-model",
    severity: "warn",
    title: "Large model may be slow",
    message: `This model has ${model.triangleCount.toLocaleString()} triangles and may render or slice slowly in this browser.`,
  };
}

export function evaluateModelGuardrails(args: {
  model: ModelAnalysis;
  preset: MachinePreset;
  controls: ClayControls;
}): Warning[] {
  const { model, preset, controls } = args;
  return [
    footprintWarning(model, preset),
    heightWarning(model, preset),
    layerNozzleWarning(controls, preset),
    featureResolutionWarning(model, preset, controls),
    overhangWarning(model),
    hugeModelWarning(model),
  ].filter((warning): warning is Warning => warning !== undefined);
}

export function evaluateGcodeGuardrails(stats: GcodeStats): Warning[] {
  if (stats.heatingCommands.length === 0) return [];

  const codes = [...new Set(stats.heatingCommands.map(({ code }) => code))].sort();
  const lines = [...new Set(stats.heatingCommands.map(({ line }) => line))].sort((a, b) => a - b);
  return [{
    id: "heating-commands",
    severity: "error",
    title: "Heating commands detected",
    message: `Remove ${codes.join(", ")} on source ${lines.length === 1 ? "line" : "lines"} ${lines.join(", ")}. Clay printer G-code must not run nozzle or bed heaters.`,
  }];
}

export function evaluateGuardrails(args: {
  model: ModelAnalysis;
  preset: MachinePreset;
  controls: ClayControls;
  stats?: GcodeStats;
}): Warning[] {
  const warnings = [
    ...evaluateModelGuardrails(args),
    ...(args.stats ? evaluateGcodeGuardrails(args.stats) : []),
  ];
  const order = new Map(WARNING_ORDER.map((id, index) => [id, index]));
  return warnings.sort((a, b) =>
    (order.get(a.id) ?? WARNING_ORDER.length) -
    (order.get(b.id) ?? WARNING_ORDER.length));
}
