// Thin typed wrapper around the Kiri:Moto headless Engine API.
// Source of truth: https://docs.grid.space/kiri-moto/engine-apis
// The global `kiri` compatibility factory is installed by kiri-loader.ts.

import { loadKiri } from "./kiri-loader";

export type KiriMode = "FDM" | "CAM" | "LASER" | "SLA";

export interface KiriEngine {
  load(url: string): Promise<KiriEngine>;
  parse(data: ArrayBuffer | Uint8Array | string): Promise<KiriEngine>;
  setMode(mode: KiriMode): KiriEngine;
  setDevice(device: Record<string, unknown>): KiriEngine;
  setProcess(process: Record<string, unknown>): KiriEngine;
  setController?(controller: Record<string, unknown>): KiriEngine;
  setListener(fn: (msg: unknown) => void): KiriEngine;
  moveTo?(x: number, y: number, z: number): KiriEngine;
  scale?(x: number, y: number, z: number): KiriEngine;
  rotate?(x: number, y: number, z: number): KiriEngine;
  slice(): Promise<KiriEngine>;
  prepare(): Promise<KiriEngine>;
  export(): Promise<string>;
}

/** Resolve once the dynamic Kiri engine module has installed its compatibility global. */
export function waitForKiri(timeoutMs = 15000): Promise<void> {
  return loadKiri({ timeoutMs });
}

export interface SliceArgs {
  stl: ArrayBuffer;
  device: Record<string, unknown>;
  process: Record<string, unknown>;
  onLog?: (msg: string) => void;
}

/** Run the full STL -> G-code pipeline and return the G-code string. */
export async function sliceToGcode({ stl, device, process, onLog }: SliceArgs): Promise<string> {
  await waitForKiri();
  const engine = window.kiri!.newEngine();
  engine.setListener((msg) => {
    if (onLog) onLog(formatEngineMessage(msg));
  });
  await engine.parse(stl.slice(0));
  engine.setMode("FDM");
  engine.setDevice(device);
  engine.setProcess(process);
  await engine.slice();
  await engine.prepare();
  const gcode = await engine.export();
  if (typeof gcode !== "string" || gcode.trim() === "") {
    throw new EmptyGcodeError();
  }
  return gcode;
}

export class EmptyGcodeError extends Error {
  constructor() {
    super("Kiri:Moto exported empty G-code. Retry slicing this model.");
    this.name = "EmptyGcodeError";
  }
}

function formatEngineMessage(message: unknown): string {
  if (typeof message === "string") return message;
  try {
    const json = JSON.stringify(message);
    if (json !== undefined) return json;
  } catch {
    // Fall through to a simpler representation.
  }
  try {
    return String(message);
  } catch {
    return "Unserializable Kiri:Moto engine message";
  }
}

// Compatibility for the PoC App's readiness polling until Task 11 owns loading explicitly.
const isTest = (import.meta as ImportMeta & { env?: { MODE?: string } }).env?.MODE === "test";
if (typeof window !== "undefined" && !isTest) {
  void loadKiri().catch(() => undefined);
}
