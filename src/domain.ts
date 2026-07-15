export type Point3 = { x: number; y: number; z: number };

export interface Bounds3 {
  min: Point3;
  max: Point3;
  size: Point3;
}

export type Bed =
  | { shape: "rect"; width: number; depth: number; maxHeight: number }
  | { shape: "circular"; diameter: number; maxHeight: number };

export interface ModelAnalysis {
  bounds: Bounds3;
  triangleCount: number;
  sourceBytes: number;
  overhangFraction: number;
  estimatedFeatureSizeMm?: number;
  isHuge: boolean;
}

export interface HeatingCommand {
  code: "M104" | "M109" | "M140" | "M190";
  line: number;
}

export interface GcodeStats {
  lineCount: number;
  layerCount: number;
  estTimeMin: number;
  estFilamentMm: number;
  heatingCommands: HeatingCommand[];
}

export interface Segment {
  start: Point3;
  end: Point3;
  extrusionMm: number;
  feedMmPerMin?: number;
  sourceLine: number;
}

export interface Toolpath {
  layers: Segment[][];
  layerZ: number[];
}

export interface Warning {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  message: string;
}
