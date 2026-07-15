import type { KiriEngine } from "./kiri";

export const KIRI_ENGINE_MODULE_URL = "https://grid.space/lib/kiri/run/engine.js";

interface KiriEngineModule {
  Engine?: new () => KiriEngine;
  newEngine?: () => KiriEngine;
}

type EngineModuleImporter = (url: string) => Promise<unknown>;

export interface LoadKiriOptions {
  retry?: boolean;
  timeoutMs?: number;
  /** Test seam; production callers should use the official module URL. */
  importModule?: EngineModuleImporter;
}

declare global {
  interface Window {
    kiri?: { newEngine(): KiriEngine };
  }
}

const defaultImporter: EngineModuleImporter = (url) => import(/* @vite-ignore */ url);

let inFlight: Promise<void> | null = null;
let lastError: Error | null = null;
let attemptGeneration = 0;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function factoryFromModule(value: unknown): (() => KiriEngine) | null {
  if (!value || typeof value !== "object") return null;

  const module = value as KiriEngineModule;
  if (typeof module.newEngine === "function") {
    return () => module.newEngine!();
  }
  if (typeof module.Engine === "function") {
    return () => new module.Engine!();
  }
  return null;
}

function retryUrl(generation: number): string {
  if (generation === 0) return KIRI_ENGINE_MODULE_URL;
  const separator = KIRI_ENGINE_MODULE_URL.includes("?") ? "&" : "?";
  return `${KIRI_ENGINE_MODULE_URL}${separator}loader-retry=${generation}`;
}

/** Load the official Kiri ESM bundle and expose the legacy window.kiri factory. */
export function loadKiri(options: LoadKiriOptions = {}): Promise<void> {
  if (window.kiri?.newEngine) return Promise.resolve();
  if (inFlight) return inFlight;

  if (lastError && !options.retry) return Promise.reject(lastError);
  if (options.retry) {
    lastError = null;
    attemptGeneration += 1;
  }

  const generation = attemptGeneration;
  const timeoutMs = options.timeoutMs ?? 15_000;
  const importModule = options.importModule ?? defaultImporter;

  inFlight = new Promise<void>((resolve, reject) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      fail(new Error(`Kiri:Moto engine module timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    function cleanup(): void {
      window.clearTimeout(timeout);
    }

    function succeed(factory: () => KiriEngine): void {
      if (settled || generation !== attemptGeneration) return;
      settled = true;
      cleanup();
      window.kiri = { newEngine: factory };
      lastError = null;
      inFlight = null;
      resolve();
    }

    function fail(error: Error): void {
      if (settled || generation !== attemptGeneration) return;
      settled = true;
      cleanup();
      lastError = error;
      inFlight = null;
      reject(error);
    }

    void importModule(retryUrl(generation)).then(
      (module) => {
        const factory = factoryFromModule(module);
        if (!factory) {
          fail(new Error("Kiri:Moto engine module did not export Engine or newEngine."));
          return;
        }
        succeed(factory);
      },
      (error: unknown) => {
        fail(new Error(`Kiri:Moto engine module failed to load: ${errorMessage(error)}`));
      },
    );
  });

  return inFlight;
}
