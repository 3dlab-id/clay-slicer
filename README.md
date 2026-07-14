# Clay Slicer (PoC)

A **simple React UI over the [Kiri:Moto](https://grid.space) slicing engine**, tuned for the
3D Lab Ender-3 clay printer. Proof-of-concept for "put our own UI on an existing slicer
engine instead of writing a slicer."

- **Engine:** Kiri:Moto (MIT licensed), loaded client-side from `grid.space/code/engine.js`
- **Slicing:** runs entirely **in the browser** — no backend → deploys as a static site
- **Clay-aware:** thick layers, wide lines, vase mode, **no retraction, no heating commands**

## Run locally

```bash
cd slicer
npm install
npm run dev      # http://localhost:5180
```

Upload an STL, adjust the clay sliders, click **Slice**, download the `.gcode`.
The G-code panel flags whether any heating commands leaked in (there should be none).

## Build & deploy (Cloudflare Pages)

```bash
npm run build    # outputs dist/
```

Point Cloudflare Pages at this folder: build command `npm run build`, output dir `dist`.
It's a pure static SPA.

## How it works

`src/kiri.ts` wraps the Kiri:Moto Engine API:

```
newEngine() → parse(stl) → setMode('FDM') → setDevice(clayDevice)
            → setProcess(clayProcess) → slice() → prepare() → export()  ⟶ G-code
```

`src/clay-profile.ts` holds the **editable clay profile** — machine dimensions, the
non-heated start/end G-code, and the mapping from the UI sliders to Kiri process settings.
Start values are calibration seeds; tune them for your paste.

## Known PoC caveats

- **Engine from CDN.** For production, self-host `engine.js` + `kiri_work.js` + `kiri_pool.js`
  from grid.space so you don't depend on their uptime.
- **Verify the vase-mode field.** Kiri silently ignores unknown process keys. If vase mode
  doesn't engage, confirm the key (`outputVase`) against the live engine — the on-screen
  **Engine log** shows what the engine reports.
- **No 3D preview** yet — this PoC shows raw G-code + stats. A toolpath viewer is the
  obvious next step (reuse the existing `viewer-3d` component).

## Why Kiri:Moto

Chosen over CuraEngine-WASM (Symple Slicer) and server-side OrcaSlicer CLI because it's
MIT-licensed (no AGPL obligations for a hosted UI) and runs fully client-side, fitting the
React + Cloudflare Pages stack with the least engineering. See the research summary in the
conversation that produced this PoC.
