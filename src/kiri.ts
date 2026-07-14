// Thin typed wrapper around the Kiri:Moto headless Engine API.
// Source of truth: https://docs.grid.space/kiri-moto/engine-apis
// The global `kiri` is provided by the engine.js script loaded in index.html.

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

declare global {
  interface Window {
    kiri?: { newEngine(): KiriEngine };
  }
}

/** Resolve once the grid.space engine.js global is available. */
export function waitForKiri(timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.kiri?.newEngine) return resolve();
    const start = Date.now();
    const t = setInterval(() => {
      if (window.kiri?.newEngine) {
        clearInterval(t);
        resolve();
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(t);
        reject(new Error("Kiri:Moto engine.js failed to load (check network / grid.space)."));
      }
    }, 100);
  });
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
    if (onLog) onLog(typeof msg === "string" ? msg : JSON.stringify(msg));
  });
  await engine.parse(stl);
  engine.setMode("FDM");
  engine.setDevice(device);
  engine.setProcess(process);
  await engine.slice();
  await engine.prepare();
  return engine.export();
}
