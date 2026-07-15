import type { Point3, Segment, Toolpath } from "./domain";
import { groupExtrusionMotions, scanGcode } from "./gcode-motion";

export interface ToolpathParseOptions {
  layerHeightHint?: number;
}

function copyPoint(point: Point3): Point3 {
  return { x: point.x, y: point.y, z: point.z };
}

function segmentIsFinite(segment: Segment): boolean {
  return [
    ...Object.values(segment.start),
    ...Object.values(segment.end),
    segment.extrusionMm,
    segment.feedMmPerMin ?? 0,
    segment.sourceLine,
  ].every(Number.isFinite);
}

/** Parse printable extrusion moves into preview-ready layers. */
export function parseToolpath(
  gcode: string,
  options: ToolpathParseOptions = {},
): Toolpath {
  const scan = scanGcode(gcode);
  const motionLayers = groupExtrusionMotions(scan.motions, options.layerHeightHint);
  const layers = motionLayers.map((layer) =>
    layer.motions.map((motion): Segment => ({
      start: copyPoint(motion.start),
      end: copyPoint(motion.end),
      extrusionMm: motion.deltaE,
      feedMmPerMin: motion.feedMmPerMin,
      sourceLine: motion.sourceLine,
    })),
  );
  const layerZ = motionLayers.map((layer) => layer.z);

  if (!layerZ.every(Number.isFinite) || !layers.flat().every(segmentIsFinite)) {
    throw new Error("Toolpath parser produced non-finite geometry.");
  }

  return { layers, layerZ };
}
