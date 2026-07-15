import type { GcodeStats } from "./domain";
import { groupExtrusionMotions, scanGcode } from "./gcode-motion";

/** Calculate finite, acceleration-free summary statistics from G-code modal motion. */
export function getGcodeStats(gcode: string): GcodeStats {
  const scan = scanGcode(gcode);
  const markedLayers = new Set(scan.layerMarkers.map((marker) => marker.index));
  const layerCount = markedLayers.size > 0
    ? markedLayers.size
    : groupExtrusionMotions(scan.motions).length;
  const estTimeMin = scan.motions.reduce(
    (total, motion) => total + (motion.estMinutes ?? 0),
    0,
  );
  const estFilamentMm = scan.motions.reduce(
    (total, motion) => total + Math.max(0, motion.deltaE),
    0,
  );

  return {
    lineCount: scan.lineCount,
    layerCount,
    estTimeMin,
    estFilamentMm,
    heatingCommands: scan.heatingCommands,
  };
}
