import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("loadKiri", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.useFakeTimers();
    delete window.kiri;
  });

  afterEach(() => {
    vi.useRealTimers();
    delete window.kiri;
  });

  it("imports the official module once, shares the in-flight promise, and installs newEngine", async () => {
    const { KIRI_ENGINE_MODULE_URL, loadKiri } = await import("../src/kiri-loader");
    let resolveImport!: (module: unknown) => void;
    const importModule = vi.fn(
      () => new Promise<unknown>((resolve) => {
        resolveImport = resolve;
      }),
    );
    const engine = { marker: "engine" };

    const first = loadKiri({ importModule });
    const second = loadKiri({ importModule });
    expect(second).toBe(first);
    expect(importModule).toHaveBeenCalledOnce();
    expect(importModule).toHaveBeenCalledWith(KIRI_ENGINE_MODULE_URL);

    resolveImport({ newEngine: () => engine });
    await first;

    expect(window.kiri?.newEngine()).toBe(engine);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adapts the official Engine class export", async () => {
    const { loadKiri } = await import("../src/kiri-loader");
    class Engine {
      readonly marker = "constructed";
    }

    await loadKiri({ importModule: async () => ({ Engine }) });

    expect(window.kiri?.newEngine()).toBeInstanceOf(Engine);
  });

  it("resolves immediately when a compatible global already exists", async () => {
    const { loadKiri } = await import("../src/kiri-loader");
    const importModule = vi.fn();
    window.kiri = { newEngine: vi.fn() };

    await loadKiri({ importModule });

    expect(importModule).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("rejects an invalid module without waiting for the timeout", async () => {
    const { loadKiri } = await import("../src/kiri-loader");
    const loading = loadKiri({ importModule: async () => ({ notAnEngine: true }) });

    await expect(loading).rejects.toThrow("did not export Engine or newEngine");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("times out cleanly and ignores a late module resolution", async () => {
    const { loadKiri } = await import("../src/kiri-loader");
    let resolveImport!: (module: unknown) => void;
    const loading = loadKiri({
      timeoutMs: 100,
      importModule: () => new Promise((resolve) => {
        resolveImport = resolve;
      }),
    });
    const rejection = expect(loading).rejects.toThrow("timed out after 100 ms");

    await vi.advanceTimersByTimeAsync(100);
    await rejection;
    resolveImport({ newEngine: () => ({ old: true }) });
    await Promise.resolve();

    expect(window.kiri).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a failure stable until retry and cache-busts the retry import", async () => {
    const { KIRI_ENGINE_MODULE_URL, loadKiri } = await import("../src/kiri-loader");
    const firstImporter = vi.fn(async () => {
      throw new Error("offline");
    });
    const first = loadKiri({ importModule: firstImporter });
    await expect(first).rejects.toThrow("failed to load: offline");

    const unusedImporter = vi.fn();
    await expect(loadKiri({ importModule: unusedImporter })).rejects.toThrow("offline");
    expect(unusedImporter).not.toHaveBeenCalled();

    const engine = { retried: true };
    const retryImporter = vi.fn(async () => ({ newEngine: () => engine }));
    await loadKiri({ retry: true, importModule: retryImporter });

    expect(retryImporter).toHaveBeenCalledWith(`${KIRI_ENGINE_MODULE_URL}?loader-retry=1`);
    expect(window.kiri?.newEngine()).toBe(engine);
    expect(vi.getTimerCount()).toBe(0);
  });
});
