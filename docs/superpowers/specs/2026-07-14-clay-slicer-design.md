# Clay Slicer — Design Spec

**Date:** 2026-07-14
**Repo:** `3dlab-id/clay-slicer`
**Status:** Approved design → ready for implementation plan

## 1. Purpose

A **public, customer self-service** web tool that slices a 3D model into **downloadable
clay G-code**. A customer uploads a model, picks their clay printer from a small set of
presets, previews the model and the sliced toolpaths in 3D, sees feasibility warnings, and
downloads a ready-to-print `.gcode` file for their own machine.

It is a free capability/lead tool for 3D Lab Bali — it does **not** place orders or run the
shop's printers.

## 2. Scope

**In scope (v1):**
- STL upload (client-side)
- Machine presets for a few common clay printers; customer picks theirs
- Simple clay controls (layer height, line width, speed, vase mode)
- 3D **model** preview + 3D **toolpath** preview (layer scrubbing)
- Feasibility guardrails (fit, heating-command check, layer/nozzle sanity, feature size,
  advisory overhang)
- Download clay `.gcode`
- Fully client-side, static, deployed to Cloudflare Pages

**Non-goals (v1), deliberately out:**
No accounts, saved projects, backend/database, ordering or CRM/WhatsApp handoff, payments,
support generation, non-planar slicing, free-form machine configuration (presets only),
multi-material.

## 3. Architecture

Client-side React SPA (Vite + TypeScript, npm, Cloudflare Pages). Slicing and all previews
run in the browser via the **Kiri:Moto** engine (MIT), loaded from `grid.space/code/engine.js`
(self-hosting noted as a hardening step). No backend, no server state.

Design principle: small, independently-testable units with one-directional data flow:

```
STL buffer ─┬─► mesh ─────────────► ModelPreview
            └─► Kiri (device+process) ─► G-code string ─┬─► gcode-toolpath ─► ToolpathPreview
                                                        ├─► gcode-stats ────► Stats panel
                                                        └─► guardrails ─────► Warnings panel
```

A single slice call produces one G-code string; three independent pure units consume it.

### 3.1 Units

**Pure logic (no UI, unit-testable):**
- `machines.ts` — clay printer **presets**. `machineId → { meta, device, process }`.
- `clay-profile.ts` *(exists)* — maps simple controls onto a preset's Kiri process object.
- `kiri.ts` *(exists)* — engine wrapper: `parse → setDevice → setProcess → slice → prepare → export → gcode`.
- `gcode-stats.ts` — G-code → `{ lineCount, layerCount, estTimeMin, estFilamentMm, heatingCommands }`.
- `guardrails.ts` — `(modelBounds, preset, stats) → Warning[]` (severity `error | warn | info`).
- `gcode-toolpath.ts` — G-code → `{ layers: Segment[][] }`. **Isolated risk unit.**

**UI (thin, presentational):**
- `ModelPreview` — Three.js mesh render, fit-to-bed, draws bed volume. Reuses `viewer-3d` patterns.
- `ToolpathPreview` — renders parsed segments as colored layer lines + layer slider. Consumes
  only parsed data; knows nothing about slicing.
- `WizardSteps` + step components: **Upload → Configure → Preview → Download**.
- `App` — owns the state machine (`empty → modelLoaded → slicing → sliced → error`) and wires units.

Boundary that matters: preview components take **already-parsed data** (a mesh, or line
segments), so slicing, parsing, and rendering are each buildable/testable alone.

## 4. User & data flow

1. **Upload** — read STL once as `ArrayBuffer`; parse to mesh (gives bounding box) and keep
   the raw buffer for slicing. Invalid STL → stay on Upload with an error. State → `modelLoaded`.
2. **Configure** — pick machine preset (`machines.ts` → `{device, process}`); adjust the few
   clay controls (defaults from preset). Live dimension-vs-bed feedback here, before slicing.
3. **Preview** — on "Slice", `App` calls `kiri.ts` once; fans the G-code out to
   `gcode-toolpath` (ToolpathPreview), `gcode-stats` (Stats), `guardrails` (Warnings). Customer
   toggles model/toolpath views, scrubs layers, reads warnings. Changing a setting marks the
   preview stale and returns to a re-slice state.
4. **Download** — save G-code as a Blob named `<model>_<machine>_clay.gcode`; show the
   guardrail summary again so nobody downloads past an unseen warning.

## 5. Machine presets

Each preset = metadata + Kiri device + clay process defaults. **Seed values — verify per
machine** (same posture as the firmware profile). Presets carry `bedShape` so the fit-check
respects round delta beds.

| Preset | bedShape | Size (seed) | Nozzle |
|---|---|---|---|
| Ender-3 Clay (3D Lab) | rect | 234 × 234 × 245 | 1.5 mm |
| WASP-style delta | circular | Ø200 × 400 | 1.5 mm |
| Eazao-style | circular | Ø150 × 150 | 1.5 mm |

Adding a machine later = one entry in `machines.ts`. No temperature commands in any preset's
start/end G-code (non-heated head).

## 6. Guardrails

Pure functions in `guardrails.ts` returning `Warning[]`:

- **Fit** *(error)* — model bbox vs bed footprint (rect **or** circular) + max height.
- **Heating commands** *(error)* — scan G-code for `M104/M109/M140/M190`; must be zero.
- **Layer-vs-nozzle** *(warn)* — layer height outside ~0.3–0.7× nozzle Ø is risky for paste.
- **Feature size** *(warn)* — detail finer than the ~1.5 mm nozzle will be lost.
- **Overhang** *(warn, advisory)* — clay has no supports. **v1 heuristic:** fraction of mesh
  faces with normals pointing downward beyond a threshold angle; warn if significant. Labeled
  advisory/not-exact, isolated for later improvement.

## 7. Error handling

Each failure degrades gracefully, never a blank screen:
- Engine won't load → message + retry; Slice disabled until ready.
- Invalid/unparseable STL → stay on Upload with guidance.
- Slice fails / empty G-code → error state with engine log + retry.
- Toolpath parse fails → still show model preview, stats, and download; hide only the toolpath
  tab with a notice (parser failure must not block download).
- Huge mesh → performance warning before rendering; no hard crash.
- Doesn't fit bed → download available behind an explicit acknowledgement.

## 8. Testing

Vitest for logic (the pure units are the point):
- Unit tests: `machines.ts`, `clay-profile` mapping, `gcode-stats.ts`, `guardrails.ts`
  (fit for **both** rect + circular beds, heating scan, overhang heuristic on sample meshes).
- `gcode-toolpath.ts` against a **committed sample G-code fixture** — tested before any Three.js.
- One manual end-to-end: slice a known STL in the browser, confirm download. No heavy e2e for v1.

## 9. Tech & deployment

- Vite + React + TypeScript, npm (matches the rest of the 3D Lab monorepo).
- Three.js for both previews (reuse `viewer-3d` patterns).
- Kiri:Moto engine from grid.space CDN in v1; self-host the engine JS as a hardening step.
- Static build → Cloudflare Pages (build `npm run build`, output `dist/`). No backend.

## 10. Implementation approach

Implementation is delegated to **codex-rescue subagents** (the `codex:rescue` skill). The
forthcoming implementation plan will be structured into discrete, independently-verifiable
tasks suitable for dispatch to Codex, with the controller (Claude Code) committing on the
feature branch and verifying each task. The isolated risk unit (`gcode-toolpath.ts`) is
sequenced early, behind its test fixture.
