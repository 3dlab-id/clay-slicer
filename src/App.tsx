import { useEffect, useRef, useState } from "react";
import { sliceToGcode } from "./kiri";
import { clayDevice, clayProcess, defaultControls, type ClayControls } from "./clay-profile";

type Status = "idle" | "loading-engine" | "ready" | "slicing" | "done" | "error";

export function App() {
  const [status, setStatus] = useState<Status>("loading-engine");
  const [error, setError] = useState<string>("");
  const [controls, setControls] = useState<ClayControls>(defaultControls);
  const [file, setFile] = useState<File | null>(null);
  const [gcode, setGcode] = useState<string>("");
  const [log, setLog] = useState<string[]>([]);
  const logRef = useRef<string[]>([]);

  // Wait for the grid.space engine.js global to be ready.
  useEffect(() => {
    let alive = true;
    const check = setInterval(() => {
      if (window.kiri?.newEngine) {
        clearInterval(check);
        if (alive) setStatus("ready");
      }
    }, 150);
    const timeout = setTimeout(() => {
      clearInterval(check);
      if (alive && !window.kiri?.newEngine) {
        setStatus("error");
        setError("Kiri:Moto engine.js did not load. Check your connection to grid.space.");
      }
    }, 15000);
    return () => {
      alive = false;
      clearInterval(check);
      clearTimeout(timeout);
    };
  }, []);

  function set<K extends keyof ClayControls>(key: K, value: ClayControls[K]) {
    setControls((c) => ({ ...c, [key]: value }));
  }

  async function handleSlice() {
    if (!file) return;
    setStatus("slicing");
    setError("");
    setGcode("");
    logRef.current = [];
    setLog([]);
    try {
      const stl = await file.arrayBuffer();
      const result = await sliceToGcode({
        stl,
        device: clayDevice,
        process: clayProcess(controls),
        onLog: (m) => {
          logRef.current = [...logRef.current.slice(-40), m];
          setLog(logRef.current);
        },
      });
      setGcode(result);
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  function download() {
    const name = (file?.name.replace(/\.stl$/i, "") ?? "model") + "_clay.gcode";
    const blob = new Blob([gcode], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  const heatingCmds = gcode ? (gcode.match(/^(M104|M109|M140|M190)\b/gm) ?? []).length : 0;
  const lineCount = gcode ? gcode.split("\n").length : 0;

  return (
    <div className="wrap">
      <header>
        <h1>Clay Slicer</h1>
        <span className="sub">Kiri:Moto engine · Ender-3 clay printer · 3D Lab Bali</span>
        <span className={`pill ${status}`}>{status.replace("-", " ")}</span>
      </header>

      <div className="grid">
        <section className="panel">
          <h2>1 · Model</h2>
          <input
            type="file"
            accept=".stl"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && <p className="muted">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}

          <h2>2 · Clay settings</h2>
          <label>
            Layer height <b>{controls.layerHeight.toFixed(2)} mm</b>
            <input type="range" min={0.4} max={2} step={0.1} value={controls.layerHeight}
              onChange={(e) => set("layerHeight", +e.target.value)} />
          </label>
          <label>
            Line width <b>{controls.lineWidth.toFixed(2)} mm</b>
            <input type="range" min={0.8} max={3} step={0.1} value={controls.lineWidth}
              onChange={(e) => set("lineWidth", +e.target.value)} />
          </label>
          <label>
            Print speed <b>{controls.printSpeed} mm/s</b>
            <input type="range" min={5} max={60} step={1} value={controls.printSpeed}
              onChange={(e) => set("printSpeed", +e.target.value)} />
          </label>
          <label className="check">
            <input type="checkbox" checked={controls.vaseMode}
              onChange={(e) => set("vaseMode", e.target.checked)} />
            Vase mode (continuous spiral, no seam)
          </label>

          <button
            className="primary"
            disabled={!file || status === "slicing" || status === "loading-engine"}
            onClick={handleSlice}
          >
            {status === "slicing" ? "Slicing…" : "Slice"}
          </button>
          {error && <p className="err">{error}</p>}
        </section>

        <section className="panel">
          <h2>3 · G-code</h2>
          {gcode ? (
            <>
              <div className="stats">
                <span>{lineCount.toLocaleString()} lines</span>
                <span className={heatingCmds ? "warn" : "ok"}>
                  {heatingCmds ? `⚠ ${heatingCmds} heating cmds` : "✓ no heating cmds"}
                </span>
                <button onClick={download}>Download .gcode</button>
              </div>
              <pre className="gcode">{gcode.split("\n").slice(0, 200).join("\n")}
{lineCount > 200 ? `\n… (${(lineCount - 200).toLocaleString()} more lines)` : ""}</pre>
            </>
          ) : (
            <p className="muted">Slice a model to preview G-code here.</p>
          )}

          {log.length > 0 && (
            <>
              <h2>Engine log</h2>
              <pre className="log">{log.join("\n")}</pre>
            </>
          )}
        </section>
      </div>

      <footer className="muted">
        PoC — client-side slicing via grid.space. Tune <code>src/clay-profile.ts</code> for your paste.
      </footer>
    </div>
  );
}
