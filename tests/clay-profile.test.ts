import { clayProcess, type ClayControls } from "../src/clay-profile";

describe("clayProcess", () => {
  it("maps vase controls and preserves the cold paste policy", () => {
    expect(clayProcess({
      layerHeight: 0.8,
      lineWidth: 1.7,
      printSpeed: 22,
      vaseMode: true,
    })).toMatchObject({
      sliceHeight: 0.8,
      firstSliceHeight: 0.8,
      sliceLineWidth: 1.7,
      sliceShells: 1,
      sliceFillSparse: 0,
      sliceTopLayers: 0,
      sliceBottomLayers: 1,
      outputTemp: 0,
      outputBedTemp: 0,
      outputRetractDist: 0,
      outputRetractSpeed: 0,
      outputFeedrate: 22,
      outputSeekrate: 60,
      outputFanLayer: 0,
      outputVase: true,
    });
  });

  it("maps non-vase shells, top layers, and scaled seek speed", () => {
    expect(clayProcess({
      layerHeight: 1.2,
      lineWidth: 2,
      printSpeed: 40,
      vaseMode: false,
    })).toMatchObject({
      sliceHeight: 1.2,
      firstSliceHeight: 1.2,
      sliceLineWidth: 2,
      sliceShells: 2,
      sliceTopLayers: 2,
      sliceBottomLayers: 1,
      outputFeedrate: 40,
      outputSeekrate: 80,
      outputVase: false,
    });
  });

  it("preserves unrelated defaults while user and cold-policy fields win", () => {
    const controls: ClayControls = {
      layerHeight: 1,
      lineWidth: 1.5,
      printSpeed: 25,
      vaseMode: true,
    };
    const defaults = {
      customPresetField: "kept",
      sliceHeight: 99,
      outputTemp: 210,
      outputBedTemp: 60,
      outputRetractDist: 5,
      outputFanLayer: 2,
    };
    const controlsBefore = { ...controls };
    const defaultsBefore = { ...defaults };

    const first = clayProcess(controls, defaults);
    const second = clayProcess(controls, defaults);

    expect(first).toMatchObject({
      customPresetField: "kept",
      sliceHeight: 1,
      outputTemp: 0,
      outputBedTemp: 0,
      outputRetractDist: 0,
      outputFanLayer: 0,
    });
    expect(first).not.toBe(second);
    expect(controls).toEqual(controlsBefore);
    expect(defaults).toEqual(defaultsBefore);
  });
});
