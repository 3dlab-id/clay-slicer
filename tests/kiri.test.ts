import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadKiri } = vi.hoisted(() => ({
  loadKiri: vi.fn(async () => undefined),
}));

vi.mock("../src/kiri-loader", () => ({ loadKiri }));

import {
  EmptyGcodeError,
  sliceToGcode,
  waitForKiri,
  type KiriEngine,
} from "../src/kiri";

type Stage = "parse" | "slice" | "prepare" | "export";

function mockEngine(args: { gcode?: string; failAt?: Stage } = {}) {
  const calls: string[] = [];
  let listener: ((message: unknown) => void) | undefined;
  let parsed: ArrayBuffer | Uint8Array | string | undefined;
  const engine = {
    load: vi.fn(async () => engine),
    parse: vi.fn(async (data: ArrayBuffer | Uint8Array | string) => {
      calls.push("parse");
      parsed = data;
      if (args.failAt === "parse") throw new Error("parse failed");
      return engine;
    }),
    setMode: vi.fn(() => {
      calls.push("setMode");
      return engine;
    }),
    setDevice: vi.fn(() => {
      calls.push("setDevice");
      return engine;
    }),
    setProcess: vi.fn(() => {
      calls.push("setProcess");
      return engine;
    }),
    setListener: vi.fn((fn: (message: unknown) => void) => {
      calls.push("setListener");
      listener = fn;
      return engine;
    }),
    slice: vi.fn(async () => {
      calls.push("slice");
      if (args.failAt === "slice") throw new Error("slice failed");
      return engine;
    }),
    prepare: vi.fn(async () => {
      calls.push("prepare");
      if (args.failAt === "prepare") throw new Error("prepare failed");
      return engine;
    }),
    export: vi.fn(async () => {
      calls.push("export");
      if (args.failAt === "export") throw new Error("export failed");
      return args.gcode ?? "G1 X1 E1\n";
    }),
  } satisfies KiriEngine;

  return {
    calls,
    engine,
    emit(message: unknown) {
      listener?.(message);
    },
    parsed: () => parsed,
  };
}

beforeEach(() => {
  loadKiri.mockClear();
  delete window.kiri;
});

describe("waitForKiri", () => {
  it("preserves the compatibility API while delegating to the loader", async () => {
    await waitForKiri(321);
    expect(loadKiri).toHaveBeenCalledWith({ timeoutMs: 321 });
  });
});

describe("sliceToGcode", () => {
  it("runs the exact engine pipeline, forwards profiles, and parses an STL copy", async () => {
    const mock = mockEngine();
    window.kiri = { newEngine: () => mock.engine };
    const stl = new Uint8Array([1, 2, 3, 4]).buffer;
    const device = { bedWidth: 200 };
    const process = { sliceHeight: 1 };

    const gcode = await sliceToGcode({ stl, device, process });

    expect(gcode).toBe("G1 X1 E1\n");
    expect(mock.calls).toEqual([
      "setListener",
      "parse",
      "setMode",
      "setDevice",
      "setProcess",
      "slice",
      "prepare",
      "export",
    ]);
    expect(mock.engine.setMode).toHaveBeenCalledWith("FDM");
    expect(mock.engine.setDevice).toHaveBeenCalledWith(device);
    expect(mock.engine.setProcess).toHaveBeenCalledWith(process);
    expect(mock.parsed()).not.toBe(stl);
    expect(Array.from(new Uint8Array(mock.parsed() as ArrayBuffer))).toEqual([1, 2, 3, 4]);
    expect(Array.from(new Uint8Array(stl))).toEqual([1, 2, 3, 4]);
  });

  it("forwards string and object listener messages safely", async () => {
    const mock = mockEngine();
    const messages: string[] = [];
    window.kiri = { newEngine: () => mock.engine };
    const slicing = sliceToGcode({
      stl: new ArrayBuffer(4),
      device: {},
      process: {},
      onLog: (message) => messages.push(message),
    });
    await Promise.resolve();
    await Promise.resolve();

    mock.emit("plain");
    mock.emit({ progress: 0.5 });
    const circular: { self?: unknown } = {};
    circular.self = circular;
    mock.emit(circular);
    mock.emit(1n);
    await slicing;

    expect(messages).toEqual(["plain", '{"progress":0.5}', "[object Object]", "1"]);
  });

  it.each<Stage>(["parse", "slice", "prepare", "export"])(
    "propagates a %s failure",
    async (failAt) => {
      const mock = mockEngine({ failAt });
      window.kiri = { newEngine: () => mock.engine };

      await expect(
        sliceToGcode({ stl: new ArrayBuffer(4), device: {}, process: {} }),
      ).rejects.toThrow(`${failAt} failed`);
    },
  );

  it.each(["", "  \r\n\t"])("rejects empty exported G-code", async (gcode) => {
    const mock = mockEngine({ gcode });
    window.kiri = { newEngine: () => mock.engine };

    await expect(
      sliceToGcode({ stl: new ArrayBuffer(4), device: {}, process: {} }),
    ).rejects.toBeInstanceOf(EmptyGcodeError);
  });
});
