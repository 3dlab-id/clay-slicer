// Clay / paste process mapping shared by the machine presets.
// These are STARTING values — calibrate on the machine. The field names follow
// Kiri:Moto's engine schema (bedWidth/extNozzle/sliceHeight/etc). Kiri silently
// ignores unknown keys, so if a control seems to have no effect, confirm the key
// against the live engine — the app logs every engine message to help.

import { machinePresets } from "./machines";

export interface ClayControls {
  layerHeight: number; // mm — thick for clay (1/3–2/3 of nozzle Ø)
  lineWidth: number; // mm — match the paste nozzle
  printSpeed: number; // mm/s — slow; paste needs time to bond
  vaseMode: boolean; // continuous single-wall spiral (best for vessels)
}

/** Build a Kiri:Moto process object from the simple clay controls. */
export function clayProcess(
  c: ClayControls,
  processDefaults: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    ...processDefaults,
    sliceHeight: c.layerHeight,
    firstSliceHeight: c.layerHeight,
    sliceLineWidth: c.lineWidth,
    sliceShells: c.vaseMode ? 1 : 2, // single wall in vase mode
    sliceFillSparse: 0, // no infill for paste vessels
    sliceTopLayers: c.vaseMode ? 0 : 2,
    sliceBottomLayers: 1,
    outputTemp: 0, // non-heated head
    outputBedTemp: 0, // no heated bed
    outputRetractDist: 0, // NEVER retract paste
    outputRetractSpeed: 0,
    outputFeedrate: c.printSpeed,
    outputSeekrate: Math.max(60, c.printSpeed * 2),
    outputFanLayer: 0, // no part cooling for clay
    // Vase / spiral flag. If vase mode doesn't engage, this is the key to verify
    // against the live engine schema (candidates: outputVase / sliceZInterleave).
    outputVase: c.vaseMode,
  };
}

// Temporary PoC compatibility aliases. App switches to the selected preset in Task 11.
export const defaultControls = machinePresets[0]!.defaultControls;
export const clayDevice = machinePresets[0]!.device;
