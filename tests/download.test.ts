import { buildGcodeFilename, downloadGcode } from "../src/download";

describe("buildGcodeFilename", () => {
  it.each([
    ["vase.stl", "ender3-clay", "vase_ender3-clay_clay.gcode"],
    ["Vase.Final.STL", "wasp-style", "Vase.Final_wasp-style_clay.gcode"],
    ["pot.stl.stl", "eazao-style", "pot.stl_eazao-style_clay.gcode"],
    ["  my / unsafe : vase?.stl  ", "custom / clay : printer", "my_unsafe_vase_custom_clay_printer_clay.gcode"],
    ["...STL", "***", "model_machine_clay.gcode"],
  ])("sanitizes %j and %j", (modelName, machineId, expected) => {
    expect(buildGcodeFilename(modelName, machineId)).toBe(expected);
  });

  it("collapses unsafe and repeated underscore runs", () => {
    expect(buildGcodeFilename("a///___:::b.stl", "machine___///id"))
      .toBe("a_b_machine_id_clay.gcode");
  });
});

describe("downloadGcode", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("downloads the exact Blob payload through an appended temporary anchor", async () => {
    const gcode = "G21\r\n; clay ✓\nG1 X1.25 E0.4\n";
    let createdBlob: Blob | undefined;
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
      createdBlob = blob;
      return "blob:clay-gcode";
    });
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let clickedAnchor: HTMLAnchorElement | undefined;
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      clickedAnchor = this;
      expect(document.body.contains(this)).toBe(true);
    });

    const filename = downloadGcode({
      gcode,
      modelName: "My Vase.STL",
      machineId: "ender3-clay",
    });

    expect(filename).toBe("My_Vase_ender3-clay_clay.gcode");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(createdBlob).toBeInstanceOf(Blob);
    expect(createdBlob?.type).toBe("text/plain;charset=utf-8");
    expect(await createdBlob?.text()).toBe(gcode);
    expect(click).toHaveBeenCalledTimes(1);
    expect(clickedAnchor?.download).toBe(filename);
    expect(clickedAnchor?.href).toBe("blob:clay-gcode");
    expect(document.body.contains(clickedAnchor!)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:clay-gcode");
  });

  it("removes the anchor and still defers revocation when click throws", () => {
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:failed-click");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    let anchor: HTMLAnchorElement | undefined;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
      anchor = this;
      throw new Error("click failed");
    });

    expect(() => downloadGcode({
      gcode: "G1 X1\n",
      modelName: "vase.stl",
      machineId: "wasp-style",
    })).toThrow("click failed");
    expect(document.body.contains(anchor!)).toBe(false);
    expect(revokeObjectURL).not.toHaveBeenCalled();

    vi.runOnlyPendingTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:failed-click");
  });

  it("rejects blank G-code before creating browser resources", () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL");
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click");

    expect(() => downloadGcode({
      gcode: " \r\n\t",
      modelName: "empty.stl",
      machineId: "ender3-clay",
    })).toThrow(/blank G-code/i);
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(click).not.toHaveBeenCalled();
  });
});
