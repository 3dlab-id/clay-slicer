import { getMachinePreset, machinePresets } from "../src/machines";

const HEATING_COMMAND = /(?:^|\s)(?:M104|M109|M140|M190)\b/i;

function executableMacroLines(preset: (typeof machinePresets)[number]): string[] {
  const pre = preset.device.gcodePre;
  const post = preset.device.gcodePost;
  return [...(Array.isArray(pre) ? pre : []), ...(Array.isArray(post) ? post : [])]
    .filter((line): line is string => typeof line === "string")
    .map((line) => line.split(";", 1)[0]!.replace(/\([^)]*\)/g, "").trim())
    .filter(Boolean);
}

describe("machinePresets", () => {
  it("contains the three stable, unique machine IDs", () => {
    expect(machinePresets.map(({ id }) => id)).toEqual([
      "ender3-clay",
      "wasp-style",
      "eazao-style",
    ]);
    expect(new Set(machinePresets.map(({ id }) => id))).toHaveLength(machinePresets.length);
  });

  it("defines the expected rectangular and circular build volumes", () => {
    expect(getMachinePreset("ender3-clay")?.bed).toEqual({
      shape: "rect",
      width: 234,
      depth: 234,
      maxHeight: 245,
    });
    expect(getMachinePreset("wasp-style")?.bed).toEqual({
      shape: "circular",
      diameter: 200,
      maxHeight: 400,
    });
    expect(getMachinePreset("eazao-style")?.bed).toEqual({
      shape: "circular",
      diameter: 150,
      maxHeight: 150,
    });
  });

  it("uses centered origins for circular printers and the existing Ender origin", () => {
    expect(getMachinePreset("ender3-clay")?.device.originCenter).toBe(false);
    expect(getMachinePreset("wasp-style")?.device.originCenter).toBe(true);
    expect(getMachinePreset("eazao-style")?.device.originCenter).toBe(true);
  });

  it("defines finite extruder offsets required by the current Kiri engine", () => {
    for (const preset of machinePresets) {
      const extruders = preset.device.extruders;
      expect(Array.isArray(extruders)).toBe(true);
      expect(extruders).toEqual([
        expect.objectContaining({ extOffsetX: 0, extOffsetY: 0 }),
      ]);
    }
  });

  it("provides positive nozzle diameters and independent valid defaults", () => {
    for (const preset of machinePresets) {
      expect(preset.nozzleDiameter).toBeGreaterThan(0);
      expect(preset.device.extruders).toEqual([
        {
          extNozzle: preset.nozzleDiameter,
          extFilament: 1.75,
          extOffsetX: 0,
          extOffsetY: 0,
          extSelect: ["T0"],
        },
      ]);
      expect(preset.defaultControls).toEqual({
        layerHeight: 1,
        lineWidth: 1.5,
        printSpeed: 25,
        vaseMode: true,
      });
      expect(preset.defaultControls.layerHeight).toBeGreaterThan(0);
      expect(preset.defaultControls.lineWidth).toBeGreaterThan(0);
      expect(preset.defaultControls.printSpeed).toBeGreaterThan(0);
    }

    expect(machinePresets[0]!.defaultControls).not.toBe(machinePresets[1]!.defaultControls);
    expect(machinePresets[1]!.defaultControls).not.toBe(machinePresets[2]!.defaultControls);
  });

  it("has no executable heating commands in any start or end macro", () => {
    for (const preset of machinePresets) {
      expect(executableMacroLines(preset).filter((line) => HEATING_COMMAND.test(line))).toEqual([]);
    }
  });

  it("looks up known IDs and returns undefined for unknown IDs", () => {
    expect(getMachinePreset("wasp-style")).toBe(machinePresets[1]);
    expect(getMachinePreset("missing")).toBeUndefined();
  });
});
