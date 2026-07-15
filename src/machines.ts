import type { Bed } from "./domain";
import type { ClayControls } from "./clay-profile";

export interface MachinePreset {
  id: string;
  name: string;
  description: string;
  bed: Bed;
  nozzleDiameter: number;
  device: Record<string, unknown>;
  processDefaults: Record<string, unknown>;
  defaultControls: ClayControls;
}

const coldStartGcode = [
  "G21 ; millimetres",
  "G90 ; absolute positioning",
  "M83 ; relative extrusion",
  "G28 ; home",
  "G92 E0",
];

const coldEndGcode = [
  "G91 ; relative positioning",
  "G1 Z10 F600 ; lift",
  "G90 ; absolute positioning",
  "M84 ; steppers off",
];

function defaultControls(): ClayControls {
  return {
    layerHeight: 1,
    lineWidth: 1.5,
    printSpeed: 25,
    vaseMode: true,
  };
}

function device(
  name: string,
  width: number,
  depth: number,
  maxHeight: number,
  originCenter: boolean,
  bedRound = false,
): Record<string, unknown> {
  return {
    deviceName: name,
    mode: "FDM",
    bedWidth: width,
    bedDepth: depth,
    maxHeight,
    originCenter,
    bedRound,
    extruders: [{
      extNozzle: 1.5,
      extFilament: 1.75,
      extOffsetX: 0,
      extOffsetY: 0,
      extSelect: ["T0"],
    }],
    gcodePre: [...coldStartGcode],
    gcodePost: [...coldEndGcode],
  };
}

function processDefaults(): Record<string, unknown> {
  return {
    sliceSupportEnable: false,
  };
}

export const machinePresets: readonly MachinePreset[] = [
  {
    id: "ender3-clay",
    name: "Ender-3 Clay (3D Lab)",
    description: "3D Lab Bali's rectangular-bed Ender-3 clay conversion.",
    bed: { shape: "rect", width: 234, depth: 234, maxHeight: 245 },
    nozzleDiameter: 1.5,
    device: device("Ender-3 Clay", 234, 234, 245, false),
    processDefaults: processDefaults(),
    defaultControls: defaultControls(),
  },
  {
    id: "wasp-style",
    name: "WASP-style Delta",
    description: "Seed profile for a circular-bed WASP-style clay delta printer.",
    bed: { shape: "circular", diameter: 200, maxHeight: 400 },
    nozzleDiameter: 1.5,
    device: device("WASP-style Delta", 200, 200, 400, true, true),
    processDefaults: processDefaults(),
    defaultControls: defaultControls(),
  },
  {
    id: "eazao-style",
    name: "Eazao-style",
    description: "Seed profile for a compact circular-bed Eazao-style clay printer.",
    bed: { shape: "circular", diameter: 150, maxHeight: 150 },
    nozzleDiameter: 1.5,
    device: device("Eazao-style", 150, 150, 150, true, true),
    processDefaults: processDefaults(),
    defaultControls: defaultControls(),
  },
];

export function getMachinePreset(id: string): MachinePreset | undefined {
  return machinePresets.find((preset) => preset.id === id);
}
