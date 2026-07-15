import type { HeatingCommand, Point3 } from "./domain";

const NUMBER_PATTERN = "[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
const WORD_PATTERN = new RegExp(`([A-Za-z])\\s*(${NUMBER_PATTERN})`, "g");
const KIRI_LAYER_PATTERN = new RegExp(
  `^\\s*;+\\s*---\\s*layer\\s+(\\d+)(?:\\s*\\([^@)]*@\\s*(${NUMBER_PATTERN})\\s*\\))?\\s*---`,
  "i",
);
const HEATING_CODES = new Set([104, 109, 140, 190]);
const MOTION_EPSILON = 1e-9;

export interface LayerMarker {
  index: number;
  z?: number;
  sourceLine: number;
}

export interface MotionRecord {
  start: Point3;
  end: Point3;
  startE: number;
  endE: number;
  deltaE: number;
  feedMmPerMin?: number;
  sourceLine: number;
  distanceMm: number;
  estMinutes?: number;
  motion: "G0" | "G1";
  layerIndex?: number;
  layerZ?: number;
}

export interface GcodeScan {
  lineCount: number;
  motions: MotionRecord[];
  layerMarkers: LayerMarker[];
  heatingCommands: HeatingCommand[];
}

export interface MotionLayer {
  index: number;
  z: number;
  motions: MotionRecord[];
}

interface ScannerState {
  point: Point3;
  e: number;
  feedMmPerMin?: number;
  unitsToMm: number;
  xyzAbsolute: boolean;
  eAbsolute: boolean;
  lastMotion?: 0 | 1;
  layerIndex?: number;
  layerZ?: number;
}

interface Word {
  letter: string;
  value: number;
}

function physicalLines(gcode: string): string[] {
  if (gcode.length === 0) return [];
  const lines = gcode.split(/\r\n|\n|\r/);
  if (/(?:\r\n|\n|\r)$/.test(gcode)) lines.pop();
  return lines;
}

function stripComments(line: string): string {
  let result = "";
  let parenthesisDepth = 0;

  for (const character of line) {
    if (character === ";" && parenthesisDepth === 0) break;
    if (character === "(") {
      parenthesisDepth += 1;
    } else if (character === ")" && parenthesisDepth > 0) {
      parenthesisDepth -= 1;
    } else if (parenthesisDepth === 0) {
      result += character;
    }
  }

  return result;
}

function tokenize(line: string): Word[] {
  const words: Word[] = [];
  WORD_PATTERN.lastIndex = 0;
  for (let match = WORD_PATTERN.exec(line); match; match = WORD_PATTERN.exec(line)) {
    const value = Number(match[2]);
    if (Number.isFinite(value)) {
      words.push({ letter: match[1]!.toUpperCase(), value });
    }
  }
  return words;
}

function pointCopy(point: Point3): Point3 {
  return { x: point.x, y: point.y, z: point.z };
}

function heatingCode(value: number): HeatingCommand["code"] | undefined {
  if (!HEATING_CODES.has(value)) return undefined;
  return `M${value}` as HeatingCommand["code"];
}

/** Scan G-code once while applying the modal state needed by stats and toolpath parsing. */
export function scanGcode(gcode: string): GcodeScan {
  const lines = physicalLines(gcode);
  const motions: MotionRecord[] = [];
  const layerMarkers: LayerMarker[] = [];
  const heatingCommands: HeatingCommand[] = [];
  const state: ScannerState = {
    point: { x: 0, y: 0, z: 0 },
    e: 0,
    unitsToMm: 1,
    xyzAbsolute: true,
    eAbsolute: true,
  };

  lines.forEach((rawLine, lineOffset) => {
    const sourceLine = lineOffset + 1;
    const markerMatch = rawLine.match(KIRI_LAYER_PATTERN);
    if (markerMatch) {
      const marker: LayerMarker = {
        index: Number(markerMatch[1]),
        sourceLine,
      };
      if (markerMatch[2] !== undefined) marker.z = Number(markerMatch[2]);
      layerMarkers.push(marker);
      state.layerIndex = marker.index;
      state.layerZ = marker.z;
    }

    const words = tokenize(stripComments(rawLine));
    if (words.length === 0) return;

    for (const word of words) {
      if (word.letter === "M") {
        const code = heatingCode(word.value);
        if (code) heatingCommands.push({ code, line: sourceLine });
      }
    }

    const gCodes = words.filter((word) => word.letter === "G").map((word) => word.value);
    const mCodes = words.filter((word) => word.letter === "M").map((word) => word.value);

    if (gCodes.includes(20)) state.unitsToMm = 25.4;
    if (gCodes.includes(21)) state.unitsToMm = 1;
    if (gCodes.includes(90)) state.xyzAbsolute = true;
    if (gCodes.includes(91)) state.xyzAbsolute = false;
    if (mCodes.includes(82)) state.eAbsolute = true;
    if (mCodes.includes(83)) state.eAbsolute = false;

    const axisValues = new Map<string, number>();
    for (const word of words) {
      if (word.letter === "X" || word.letter === "Y" || word.letter === "Z" || word.letter === "E" || word.letter === "F") {
        axisValues.set(word.letter, word.value * state.unitsToMm);
      }
    }

    if (gCodes.includes(92)) {
      for (const axis of ["X", "Y", "Z"] as const) {
        const value = axisValues.get(axis);
        if (value !== undefined) state.point[axis.toLowerCase() as "x" | "y" | "z"] = value;
      }
      const e = axisValues.get("E");
      if (e !== undefined) state.e = e;
      return;
    }

    const explicitMotion = gCodes.find((code) => code === 0 || code === 1) as 0 | 1 | undefined;
    const hasUnsupportedGCode = gCodes.some(
      (code) => ![0, 1, 20, 21, 90, 91, 92].includes(code),
    );
    if (explicitMotion !== undefined) state.lastMotion = explicitMotion;

    const feed = axisValues.get("F");
    if (feed !== undefined) state.feedMmPerMin = feed;

    const hasMovementWord = ["X", "Y", "Z", "E"].some((axis) => axisValues.has(axis));
    const motion = hasUnsupportedGCode ? undefined : explicitMotion ?? state.lastMotion;
    if (!hasMovementWord || motion === undefined) return;

    const start = pointCopy(state.point);
    const startE = state.e;
    const end = pointCopy(start);

    for (const axis of ["X", "Y", "Z"] as const) {
      const value = axisValues.get(axis);
      if (value === undefined) continue;
      const key = axis.toLowerCase() as "x" | "y" | "z";
      end[key] = state.xyzAbsolute ? value : start[key] + value;
    }

    const eValue = axisValues.get("E");
    const endE = eValue === undefined
      ? startE
      : state.eAbsolute
        ? eValue
        : startE + eValue;
    const deltaE = endE - startE;
    const distanceMm = Math.hypot(end.x - start.x, end.y - start.y, end.z - start.z);
    const timedDistance = distanceMm > MOTION_EPSILON ? distanceMm : Math.abs(deltaE);
    const estMinutes = state.feedMmPerMin !== undefined && state.feedMmPerMin > 0
      ? timedDistance / state.feedMmPerMin
      : undefined;

    // Keep scanner state independent from emitted records so a later G92 reset cannot
    // retroactively mutate a previous motion endpoint.
    state.point = pointCopy(end);
    state.e = endE;
    motions.push({
      start,
      end,
      startE,
      endE,
      deltaE,
      feedMmPerMin: state.feedMmPerMin,
      sourceLine,
      distanceMm,
      estMinutes,
      motion: motion === 0 ? "G0" : "G1",
      layerIndex: state.layerIndex,
      layerZ: state.layerZ,
    });
  });

  return { lineCount: lines.length, motions, layerMarkers, heatingCommands };
}

/** Group printable extrusion motions using Kiri markers, then Z changes, or a vase hint. */
export function groupExtrusionMotions(
  motions: readonly MotionRecord[],
  layerHeightHint?: number,
): MotionLayer[] {
  const printable = motions.filter(
    (motion) => motion.deltaE > MOTION_EPSILON && motion.distanceMm > MOTION_EPSILON,
  );
  if (printable.length === 0) return [];

  if (printable.some((motion) => motion.layerIndex !== undefined)) {
    const grouped = new Map<number, MotionLayer>();
    for (const motion of printable) {
      const index = motion.layerIndex ?? -1;
      let layer = grouped.get(index);
      if (!layer) {
        layer = { index, z: motion.layerZ ?? motion.end.z, motions: [] };
        grouped.set(index, layer);
      }
      layer.motions.push(motion);
    }
    return [...grouped.values()];
  }

  if (layerHeightHint !== undefined && Number.isFinite(layerHeightHint) && layerHeightHint > 0) {
    const baseZ = printable[0]!.end.z;
    const grouped = new Map<number, MotionLayer>();
    for (const motion of printable) {
      const index = Math.max(0, Math.floor((motion.end.z - baseZ) / layerHeightHint + MOTION_EPSILON));
      let layer = grouped.get(index);
      if (!layer) {
        layer = { index, z: baseZ + index * layerHeightHint, motions: [] };
        grouped.set(index, layer);
      }
      layer.motions.push(motion);
    }
    return [...grouped.values()];
  }

  const layers: MotionLayer[] = [];
  for (const motion of printable) {
    let layer = layers[layers.length - 1];
    if (!layer || Math.abs(layer.z - motion.end.z) > MOTION_EPSILON) {
      layer = { index: layers.length, z: motion.end.z, motions: [] };
      layers.push(layer);
    }
    layer.motions.push(motion);
  }
  return layers;
}
