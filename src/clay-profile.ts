// Clay / paste starting profile for the Ender-3 clay printer.
//
// These are STARTING values — calibrate on the machine. The field names follow
// Kiri:Moto's engine schema (bedWidth/extNozzle/sliceHeight/etc). Kiri silently
// ignores unknown keys, so if a control seems to have no effect, confirm the key
// against the live engine — the app logs every engine message to help.
//
// Machine facts (match the firmware in ../ender3clay):
//   bed 234 x 234 x 245 mm, ~1.5 mm paste nozzle, NON-HEATED head.

export interface ClayControls {
  layerHeight: number; // mm — thick for clay (1/3–2/3 of nozzle Ø)
  lineWidth: number; // mm — match the paste nozzle
  printSpeed: number; // mm/s — slow; paste needs time to bond
  vaseMode: boolean; // continuous single-wall spiral (best for vessels)
}

export const defaultControls: ClayControls = {
  layerHeight: 1.0,
  lineWidth: 1.5,
  printSpeed: 25,
  vaseMode: true,
};

// Kiri:Moto device profile. No temperature commands are emitted (non-heated head).
export const clayDevice = {
  deviceName: "Ender-3 Clay",
  mode: "FDM",
  bedWidth: 234,
  bedDepth: 234,
  maxHeight: 245,
  originCenter: false,
  extruders: [{ extNozzle: 1.5, extFilament: 1.75, extSelect: ["T0"] }],
  // Start G-code: home + reset, NO M104/M109/M140/M190 (clay = cold, unheated).
  gcodePre: ["G21 ; mm", "G90 ; absolute", "M83 ; relative E", "G28 ; home", "G92 E0"],
  // End G-code: lift and disable steppers, no heater-off commands needed.
  gcodePost: ["G91", "G1 Z10 F600 ; lift", "G90", "M84 ; steppers off"],
};

/** Build a Kiri:Moto process object from the simple clay controls. */
export function clayProcess(c: ClayControls): Record<string, unknown> {
  return {
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
