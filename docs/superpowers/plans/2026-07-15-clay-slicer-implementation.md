# Clay Slicer v1 — Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with regular subagents. Give each
> subagent one bounded task, require it to report the files changed and verification run, and
> have the controller review and commit the result before dispatching dependent work. Track
> progress by changing the checkboxes in this document.

**Goal:** Turn the current single-machine proof of concept into the approved public,
client-side clay slicer: validated STL upload, three machine presets, model and toolpath
previews, feasibility guardrails, safe G-code download, tests, and a Cloudflare Pages-ready
static build.

**Architecture:** Keep `App` as the orchestration boundary and keep parsing/analysis pure.
The uploaded file is read once and retained as an `ArrayBuffer`. A normalized Three.js
geometry feeds model preview and model guardrails. One Kiri slice produces one G-code string,
which is scanned once using shared modal G-code semantics and then consumed by stats,
toolpath, and post-slice guardrails. Rendering components receive already-parsed data and do
not know how STL or G-code parsing works.

**Tech stack:** React 18, TypeScript, Vite, plain Three.js, Three.js `STLLoader` and
`OrbitControls`, Vitest, Testing Library, Kiri:Moto Engine API, static Cloudflare Pages.

**Source design:** `docs/superpowers/specs/2026-07-14-clay-slicer-design.md`

---

## Current Baseline

The repository currently contains a working two-commit PoC:

- `src/kiri.ts` runs `parse -> setMode/device/process -> slice -> prepare -> export`.
- `src/clay-profile.ts` maps four simple controls to one hard-coded Ender-3 profile.
- `src/App.tsx` selects a file, reads it at slice time, displays the first 200 G-code lines,
  counts lines/heating commands inline, logs engine events, and downloads G-code.
- `index.html` loads `https://grid.space/code/engine.js` directly.
- `npm run build` passes.
- There are no tests, fixtures, Three.js dependency, machine registry, STL preview, toolpath
  parser, stats module, guardrails module, wizard, or deployment configuration.

Do not discard the working slicing path while building the replacement. Every task below
must leave `npm run build` passing unless it explicitly says it is a fixture-only preparation
step.

---

## Global Contracts and Decisions

These decisions close gaps in the design spec and apply to every task.

### Geometry and coordinates

- STL units are assumed to be millimetres. v1 does not add unit detection or scaling UI.
- Normalize preview geometry once: center its bounding box on X/Y and translate minimum Z to
  `0`. Use Z-up everywhere.
- Guardrails use the normalized bounds. The model preview renders that same normalized
  geometry; it must not apply a second transform.
- Kiri parses the retained original STL buffer and is expected to perform equivalent
  centering. Verify this with an asymmetric model before release. If it differs, fix the
  transform through a documented Kiri engine move/origin operation; do not visually offset
  only one preview.
- `App` retains the original `ArrayBuffer`. Any future worker or API that transfers an
  `ArrayBuffer` must receive `buffer.slice(0)` so the retained source is not detached.

### Machine and fit behavior

- Stable machine IDs are `ender3-clay`, `wasp-style`, and `eazao-style`.
- Changing the machine resets controls to that preset's defaults and marks any slice stale.
- Rectangular fit compares normalized width, depth, and height with bed dimensions.
- Circular fit is deliberately conservative: a centered bounding box fits only when
  `hypot(width / 2, depth / 2) <= diameter / 2`; height is checked separately.
- No automatic model rotation is attempted in v1.
- Preset values are calibration seeds, not verified manufacturer profiles. Preserve that
  warning in UI and documentation.

### Guardrail behavior

- Warnings have stable IDs and severity `error | warn | info`.
- Pre-slice guardrails run from model analysis, selected preset, and controls. Post-slice
  guardrails additionally consume G-code stats.
- A fit error permits download only after an unchecked-by-default explicit acknowledgement
  tied to the current input revision.
- Any heating-command error blocks download. The design grants an override only for fit.
- Layer height at exactly `0.3 x nozzle` or `0.7 x nozzle` passes; values outside warn.
- Overhang is an area-weighted advisory heuristic. Ignore degenerate triangles and bottom
  faces lying on the build plane. Flag faces whose normal is within 45 degrees of downward
  vertical and warn when their area exceeds 10% of considered surface area.
- v1 does **not** pretend triangle edge length is printable feature thickness. Until a real
  thickness estimator exists, show a general informational advisory that details narrower
  than the nozzle/selected line width may be lost. Keep `estimatedFeatureSizeMm?` in the
  model-analysis contract for future use; emit a model-specific warning only when a future
  defensible estimator supplies it.
- A model is “huge” at `>= 500_000` triangles or `>= 50 MiB` source size. This is warning-only
  and must be shown before mounting the WebGL model preview.

### G-code behavior

- Scanner defaults: millimetres, absolute XYZ, absolute extrusion, coordinates at zero, no
  active feedrate. Preset start G-code normally changes extrusion to relative with `M83`.
- Support executable `G0/G1`, `G20/G21`, `G90/G91`, `M82/M83`, and `G92`; modal coordinates,
  feedrate, case, whitespace, CRLF, line numbers, and comments must be tolerated.
- A toolpath segment is a non-zero XYZ move with positive extrusion delta. Travel,
  retraction, and E-only priming moves are not rendered.
- Layer grouping prefers the actual Kiri layer comments captured in the committed fixture.
  It falls back to discrete extrusion-Z changes. For vase output without usable markers,
  `parseToolpath` accepts the configured layer height as a grouping hint.
- `estTimeMin` is a motion/feed estimate and deliberately ignores acceleration and firmware
  behavior. `estFilamentMm` remains the spec-compatible field name; label it “Extrusion
  distance” in the clay UI.
- Heating detection examines executable tokens only, case-insensitively. A comment containing
  `M104` is not a heating command.

### Rendering and accessibility

- Use plain `three`, not the full React Three Fiber/Drei viewer stack. Adapt only these ideas
  from `../viewer-3d`: Z-up angled camera fit, center-XY/min-Z normalization, XY bed/grid
  orientation, demand rendering, and explicit GPU disposal.
- Do not port viewer measurements, annotations, clipping, BVH, material systems, HDR
  environments, tab state, logo textures, or desktop/Tauri code.
- Cap renderer pixel ratio at `2`; render on data, controls, and resize changes instead of a
  permanent animation loop.
- Use batched `BufferGeometry` for toolpaths, never one Three.js object per segment.
- Every canvas has an accessible label and nearby textual summary. Steps use semantic nav,
  tabs expose selection state, warnings include text/icons rather than color alone, and async
  status uses `aria-live` or `role="alert"` as appropriate.

### Required verification after implementation tasks

Run the narrow test first, then:

```bash
npm test
npm run build
```

Use Conventional Commit prefixes. The controller, not the delegated worker, creates each
commit after reviewing the diff and verification output.

---

## Task Dependency Order

```text
T1 foundation/types/fixtures
 |- T2 machine presets/profile
 |- T3 modal G-code scanner + stats
 |   `- T4 toolpath parser
 |- T5 STL parse/analysis
 |   `- T6 guardrails (also needs T2/T3)
 |- T7 workflow reducer
 |- T8 Kiri loader/wrapper
 |- T9 viewport + model preview (also needs T2/T5/T6)
 `- T10 toolpath preview (also needs T4/T9 viewport helpers)

T2-T10 -> T11 wizard/App integration -> T12 failure/download polish -> T13 release verification
```

Independent tasks at the same level may be delegated in parallel. Do not parallelize tasks
that modify the same file, especially `src/App.tsx`, `src/styles.css`, `package.json`, or shared
domain types.

---

### Task 1: Establish the test harness, dependencies, and domain contracts

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Add: `vitest.config.ts`
- Add: `tests/setup.ts`
- Add: `src/domain.ts`
- Add: `tests/domain.test.ts`
- Add: `tests/fixtures/README.md`
- Add: `tests/fixtures/asymmetric-box.stl`
- Add: `tests/fixtures/invalid-truncated.stl`

**Dependencies:**

- Runtime: `three`
- Development: `@types/three`, `vitest`, `jsdom`, `@testing-library/react`,
  `@testing-library/user-event`, `@testing-library/jest-dom`

**Required contracts in `src/domain.ts`:**

```ts
export type Point3 = { x: number; y: number; z: number };

export interface Bounds3 {
  min: Point3;
  max: Point3;
  size: Point3;
}

export type Bed =
  | { shape: "rect"; width: number; depth: number; maxHeight: number }
  | { shape: "circular"; diameter: number; maxHeight: number };

export interface ModelAnalysis {
  bounds: Bounds3;
  triangleCount: number;
  sourceBytes: number;
  overhangFraction: number;
  estimatedFeatureSizeMm?: number;
  isHuge: boolean;
}

export interface HeatingCommand {
  code: "M104" | "M109" | "M140" | "M190";
  line: number;
}

export interface GcodeStats {
  lineCount: number;
  layerCount: number;
  estTimeMin: number;
  estFilamentMm: number;
  heatingCommands: HeatingCommand[];
}

export interface Segment {
  start: Point3;
  end: Point3;
  extrusionMm: number;
  feedMmPerMin?: number;
  sourceLine: number;
}

export interface Toolpath {
  layers: Segment[][];
  layerZ: number[];
}

export interface Warning {
  id: string;
  severity: "error" | "warn" | "info";
  title: string;
  message: string;
}
```

- Keep Kiri device/process payloads as `Record<string, unknown>` at the engine boundary.
- Do not put `THREE.BufferGeometry` in serializable domain contracts. A model asset may pair
  geometry with `ModelAnalysis` in `model-analysis.ts`.
- Configure Vitest for `jsdom`, global cleanup, and jest-dom matchers.
- Add scripts: `test` (`vitest run`) and `test:watch` (`vitest`).
- Make `asymmetric-box.stl` small, valid, non-centered, and non-square so later tests can
  detect accidental X/Y swaps and normalization errors.

**Verification:**

- [ ] `npm test -- tests/domain.test.ts` passes.
- [ ] `npm run build` passes with no unused-type errors.
- [ ] `git diff --check` passes.

**Commit:** `test: establish clay slicer test harness and domain contracts`

---

### Task 2: Add machine presets and make the clay mapper preset-aware

**Files:**

- Add: `src/machines.ts`
- Modify: `src/clay-profile.ts`
- Add: `tests/machines.test.ts`
- Add: `tests/clay-profile.test.ts`

**Interfaces:**

```ts
export interface MachinePreset {
  id: string;
  name: string;
  description: string;
  bed: Bed;
  nozzleDiameter: number;
  device: Record<string, unknown>;
  processDefaults: Record<string, unknown>;
  defaultControls: ClayControls;
}

export const machinePresets: readonly MachinePreset[];
export function getMachinePreset(id: string): MachinePreset | undefined;

export function clayProcess(
  controls: ClayControls,
  processDefaults?: Record<string, unknown>,
): Record<string, unknown>;
```

**Steps:**

- [ ] Write tests for three stable unique IDs, bed shapes/dimensions, positive nozzles, and
  default controls.
- [ ] Test every preset macro after stripping comments; none may execute `M104`, `M109`,
  `M140`, or `M190`.
- [ ] Move `clayDevice` out of `clay-profile.ts` into the Ender preset. Keep a temporary
  compatibility export only if necessary to keep `App` building until Task 11.
- [ ] Add the two circular seed profiles with `originCenter: true`; keep the Ender rectangular
  profile's existing origin/device behavior until empirical verification.
- [ ] Give each preset its own `defaultControls`, even if v1 values are initially identical.
- [ ] Merge process defaults into a new object, then override all user-controlled fields.
  Never mutate preset objects or `controls`.
- [ ] Preserve cold-head behavior: zero temperature, zero retraction, zero fan, cold start/end
  macros, and the vase/shell/top-layer mapping.
- [ ] Test exact `sliceHeight`, `firstSliceHeight`, line width, shells, top/bottom layers,
  feedrate, seekrate, retraction, temperature, and vase fields.
- [ ] Test that unrelated preset defaults survive the merge and repeated calls return new
  objects.

**Verification:**

- [ ] `npm test -- tests/machines.test.ts tests/clay-profile.test.ts`
- [ ] `npm run build`

**Commit:** `feat: add clay printer preset registry`

---

### Task 3: Capture real Kiri output and implement modal G-code scanning and stats

**Files:**

- Add: `tests/fixtures/kiri-sample.gcode`
- Add: `tests/fixtures/modal-modes.gcode`
- Add: `src/gcode-motion.ts`
- Add: `src/gcode-stats.ts`
- Add: `tests/gcode-motion.test.ts`
- Add: `tests/gcode-stats.test.ts`

**Fixture preparation:**

- [ ] Before changing the current UI, slice `tests/fixtures/asymmetric-box.stl` with the PoC
  Ender profile and download the result.
- [ ] Confirm the file is real Kiri output and note its exact layer-comment syntax in
  `tests/fixtures/README.md`.
- [ ] Reduce the fixture only by deleting repeated middle moves/layers; retain the real header,
  mode commands, layer markers, representative travel/extrusion, and end macro.
- [ ] Add a small hand-authored `modal-modes.gcode` covering absolute/relative XYZ and E,
  `G92`, comments, lowercase commands, modal feedrate, retraction, and an E-only move.

**Scanner contract:**

- Implement a pure line scanner in `gcode-motion.ts` that maintains X/Y/Z/E/F, units, XYZ
  mode, extrusion mode, and last motion mode.
- Strip semicolon comments and parenthetical comments before tokenizing executable commands.
- Tolerate blank lines, CRLF, arbitrary word order/spacing, lowercase, optional line numbers,
  checksums, and unknown commands.
- Support `G0/G1`, modal continuation, `G20/G21`, `G90/G91`, `M82/M83`, and `G92` for any
  supplied axis/E.
- Emit motion records containing start/end, positive/negative `deltaE`, active feed in mm/min,
  source line, XYZ distance, estimated minutes, and recognized layer marker.
- Treat missing feed as unknown time rather than producing `NaN`.
- Export the layer-marker/fallback helper so stats and toolpath use identical grouping.

**Stats behavior:**

- `lineCount`: physical lines, without counting the synthetic final empty element caused by a
  trailing newline.
- `layerCount`: recognized Kiri markers first; discrete extrusion-Z groups as fallback.
- `estFilamentMm`: sum positive E deltas; do not subtract or count retractions.
- `estTimeMin`: sum 3D XYZ distance/current feed; use absolute E distance for E-only moves.
- `heatingCommands`: exact executable `M104/M109/M140/M190`, with source line numbers.

**Required tests:**

- [ ] Absolute and relative XYZ.
- [ ] Absolute and relative E, including positive absolute E after a travel.
- [ ] `G92 E0` and coordinate resets.
- [ ] Feedrate persistence, unit conversion, and modal coordinate-only moves.
- [ ] Retraction/unretraction, E-only and zero-length moves.
- [ ] Comments containing fake heating/motion commands are ignored.
- [ ] Lowercase, CRLF, leading decimals, signed values, unknown commands, and missing feed.
- [ ] Exact fixture line/layer/heating/extrusion stats.
- [ ] No output field is `NaN` or infinite.

**Verification:**

- [ ] `npm test -- tests/gcode-motion.test.ts tests/gcode-stats.test.ts`
- [ ] `npm run build`

**Commit:** `feat: add modal G-code scanner and slice statistics`

---

### Task 4: Implement the isolated G-code toolpath parser

**Files:**

- Add: `src/gcode-toolpath.ts`
- Add: `tests/gcode-toolpath.test.ts`

**Interface:**

```ts
export interface ToolpathParseOptions {
  layerHeightHint?: number;
}

export function parseToolpath(
  gcode: string,
  options?: ToolpathParseOptions,
): Toolpath;
```

**Steps:**

- [ ] Write fixture-based tests before rendering any toolpath.
- [ ] Consume motion records from `gcode-motion.ts`; do not duplicate modal parsing.
- [ ] Retain only positive-extrusion moves with non-zero XYZ distance.
- [ ] Group by actual Kiri markers. If absent, use discrete extrusion-Z changes; for continuous
  vase Z, bucket using `layerHeightHint`.
- [ ] Keep negative coordinates and 3D Z values unchanged.
- [ ] Return an empty `Toolpath` for valid G-code with no extrusion. Throw only for genuine
  parser invariants/unusable data so `App` can isolate failure from slicing.
- [ ] Test exact fixture layer count, representative first/last coordinates, travel/retraction
  exclusion, relative E, absolute E with `G92`, empty input, marker fallback, and continuous-Z
  vase grouping.
- [ ] Add a regression test proving the input string is not mutated and unknown commands do
  not fail parsing.

**Verification:**

- [ ] `npm test -- tests/gcode-toolpath.test.ts tests/gcode-motion.test.ts`
- [ ] `npm run build`

**Commit:** `feat: parse G-code extrusion toolpaths by layer`

---

### Task 5: Parse, validate, normalize, and analyze STL models

**Files:**

- Add: `src/model-analysis.ts`
- Add: `tests/model-analysis.test.ts`

**Interface:**

```ts
export interface ModelAsset {
  geometry: THREE.BufferGeometry;
  analysis: ModelAnalysis;
}

export const HUGE_TRIANGLE_COUNT = 500_000;
export const HUGE_SOURCE_BYTES = 50 * 1024 * 1024;
export const OVERHANG_NORMAL_Z = -Math.cos(Math.PI / 4);
export const OVERHANG_WARNING_FRACTION = 0.10;

export function parseAndAnalyzeStl(
  buffer: ArrayBuffer,
  sourceBytes?: number,
): ModelAsset;
```

**Steps:**

- [ ] Parse with `STLLoader.parse`. Catch parser exceptions and replace them with a stable,
  actionable invalid-STL error.
- [ ] Reject missing positions, zero triangles, non-triangle vertex counts, non-finite
  coordinates, truncated files, and geometry with no usable 3D bounds.
- [ ] Clone/own the returned geometry, center X/Y, place minimum Z at zero, compute vertex
  normals, bounding box, and bounding sphere.
- [ ] Return exact normalized `Bounds3`, triangle count, source bytes, huge flag, and overhang
  fraction.
- [ ] Compute overhang using triangle cross products and face area. Ignore degenerate faces.
  Exclude faces whose three vertices are within a named epsilon of `minZ` so a closed model's
  build-plate bottom does not trigger the warning.
- [ ] Do not calculate feature size from shortest edges. Leave `estimatedFeatureSizeMm`
  undefined.
- [ ] Do not transfer or mutate the caller's retained `ArrayBuffer`.
- [ ] Test ASCII and binary STL, asymmetric normalization, triangle count, finite bounds,
  invalid/truncated/non-finite/empty input, upward/vertical/downward/sloped triangles, bottom
  exclusion, degenerate exclusion, and huge thresholds immediately below/at/above boundary.
- [ ] Expose a small `disposeModelAsset` or document that `App` owns and disposes the geometry
  on replacement/unmount.

**Verification:**

- [ ] `npm test -- tests/model-analysis.test.ts`
- [ ] `npm run build`

**Commit:** `feat: parse and analyze uploaded STL models`

---

### Task 6: Implement pre- and post-slice feasibility guardrails

**Files:**

- Add: `src/guardrails.ts`
- Add: `tests/guardrails.test.ts`

**Interfaces:**

```ts
export function evaluateModelGuardrails(args: {
  model: ModelAnalysis;
  preset: MachinePreset;
  controls: ClayControls;
}): Warning[];

export function evaluateGcodeGuardrails(stats: GcodeStats): Warning[];

export function evaluateGuardrails(args: {
  model: ModelAnalysis;
  preset: MachinePreset;
  controls: ClayControls;
  stats?: GcodeStats;
}): Warning[];
```

**Stable warning IDs:**

- `fit-footprint`, `fit-height`, `heating-commands`, `layer-nozzle`,
  `feature-resolution`, `overhang-advisory`, `huge-model`.

**Steps and tests:**

- [ ] Rectangular exact width/depth/height passes; a small excess on each axis fails.
- [ ] Circular exact corner radius passes; a small excess fails. Include a box whose width and
  depth individually fit but whose diagonal does not.
- [ ] Use one named floating tolerance to avoid noise at exact boundaries.
- [ ] Heating errors list unique command codes and source lines.
- [ ] Layer ratios immediately below/at/inside/at/above `0.3..0.7` are tested.
- [ ] General feature-resolution info is deterministic and clearly says it is not exact model
  analysis. If `estimatedFeatureSizeMm` later exists, warn only below the nozzle limit.
- [ ] Overhang immediately below/at/above 10% is tested and the message says “advisory” and
  that supports are not generated.
- [ ] Huge-model warning reflects `ModelAnalysis.isHuge`.
- [ ] Pre-slice evaluation works with no stats. Combined warning order is stable and IDs do
  not depend on presentation text.

**Verification:**

- [ ] `npm test -- tests/guardrails.test.ts`
- [ ] `npm run build`

**Commit:** `feat: add clay print feasibility guardrails`

---

### Task 7: Define and test the workflow reducer before rewriting the UI

**Files:**

- Add: `src/workflow.ts`
- Add: `tests/workflow.test.ts`

**State model:**

```ts
export type EngineState = "loading" | "ready" | "failed";
export type WorkflowState = "empty" | "modelLoaded" | "slicing" | "sliced" | "sliceError";
export type WizardStep = "upload" | "configure" | "preview" | "download";

export interface SliceResult {
  revision: number;
  gcode: string;
  stats: GcodeStats;
  warnings: Warning[];
  toolpath?: Toolpath;
  toolpathError?: string;
}
```

The full reducer state also holds engine error/retry generation, file metadata, retained
buffer/model asset reference, machine ID, controls, input revision, visible step, slice
result/error/log, active request ID, and fit acknowledgement.

**Required transitions:**

- [ ] Engine readiness is independent of upload/workflow; engine failure preserves the model.
- [ ] Successful upload moves `empty -> modelLoaded`, resets previous result/error/log and fit
  acknowledgement, and advances to Configure.
- [ ] Invalid upload leaves the workflow on Upload with an upload error.
- [ ] Machine/control changes increment input revision, reset acknowledgement, and make an
  existing result stale without deleting the retained G-code immediately.
- [ ] Slice start captures `{requestId, revision}` and enters `slicing`.
- [ ] Slice success is accepted only when request ID and revision are still current. A late
  result from an old file/settings snapshot is ignored.
- [ ] Slice failure preserves the model/settings and enters `sliceError` with retry possible.
- [ ] Toolpath failure belongs inside a successful `SliceResult`; it does not change workflow
  to error.
- [ ] Preview/Download step access is blocked when no current result exists or the result is
  stale. Upload and Configure remain reachable.
- [ ] Fit acknowledgement applies only to the current revision/result and resets on any
  relevant input change.

Prefer a pure reducer plus narrow action creators/selectors such as `isSliceStale`,
`canSlice`, and `canDownload`; do not bury transition rules in JSX conditions.

**Verification:**

- [ ] `npm test -- tests/workflow.test.ts`
- [ ] `npm run build`

**Commit:** `feat: define clay slicer workflow state machine`

---

### Task 8: Make Kiri engine loading retryable and harden slicing

**Files:**

- Modify: `index.html`
- Add: `src/kiri-loader.ts`
- Modify: `src/kiri.ts`
- Add: `tests/kiri-loader.test.ts`
- Add: `tests/kiri.test.ts`

**Steps:**

- [ ] Remove the fixed engine `<script>` from `index.html`; loading must be owned by one
  retryable module rather than duplicated polling in `App` and `kiri.ts`.
- [ ] `loadKiri({ retry?: boolean, timeoutMs?: number })` dynamically injects
  `https://grid.space/code/engine.js`, resolves when `window.kiri.newEngine` exists, shares an
  in-flight promise, times out cleanly, and removes/replaces a failed script on retry.
- [ ] Make the CDN URL a named constant so later self-hosting is one controlled change.
- [ ] Ensure timers and event handlers are cleaned up on success, failure, and retry.
- [ ] Keep `sliceToGcode` as the only engine pipeline wrapper. Test exact call order,
  listener forwarding, and errors from parse/slice/prepare/export.
- [ ] Convert non-string listener messages safely even if `JSON.stringify` throws.
- [ ] Reject exported G-code when `trim()` is empty with a specific retryable error.
- [ ] Accept copied/retained STL input without mutating it. Keep device and process typed at
  the boundary.
- [ ] Tests use a mocked DOM/global engine and fake timers; no network call is allowed.

**Verification:**

- [ ] `npm test -- tests/kiri-loader.test.ts tests/kiri.test.ts`
- [ ] `npm run build`

**Commit:** `feat: add retryable Kiri engine loading`

---

### Task 9: Build the minimal Three.js viewport, bed volume, and model preview

**Files:**

- Add: `src/lib/three-viewport.ts`
- Add: `src/lib/bed-geometry.ts`
- Add: `src/components/ModelPreview.tsx`
- Add: `tests/bed-geometry.test.ts`
- Add: `tests/components/ModelPreview.test.tsx`

**Reference only:**

- `../viewer-3d/src/lib/scene.ts`: Z-up angled camera fit and disposal patterns.
- `../viewer-3d/src/components/Viewer.tsx`: center-XY/min-Z normalization behavior.
- `../viewer-3d/src/components/BuildPlate.tsx`: rotate grid onto XY for Z-up.

Do not copy the full viewer component or its unrelated subsystems.

**Viewport behavior:**

- [ ] Create renderer, scene, perspective camera with `up = (0,0,1)`, OrbitControls, resize
  observer, and a demand-render callback.
- [ ] Cap DPR at 2. Render on controls change, resize, and explicit invalidation; no permanent
  RAF loop.
- [ ] Camera fit frames an object's bounding sphere from an angled Z-up direction and handles
  empty/zero-radius bounds safely.
- [ ] Cleanup removes listeners/observer, disposes controls/renderer and viewport-owned
  geometries/materials, and removes the canvas. Parent-owned model geometry is not disposed
  by the viewport.
- [ ] Convert WebGL construction failure into a local preview notice, not an App crash.

**Bed/model behavior:**

- [ ] `bed-geometry.ts` creates packed line positions for a rectangular or circular footprint
  and maximum-height volume. Circular beds are visibly circular, not a square proxy.
- [ ] `ModelPreview` receives normalized geometry, preset, and fit status only. It has no STL
  parsing or slicing logic.
- [ ] Add a matte clay-colored mesh, ambient/directional lights, bed/grid, and height outline.
  Color/text must make out-of-fit state recognizable without relying only on color.
- [ ] Camera initially fits enough of the model and bed to understand scale.
- [ ] Give the canvas an accessible name and show textual dimensions/bed summary.
- [ ] Unit-test pure bed geometry and component fallback/cleanup with Three constructors mocked
  where jsdom cannot create WebGL. Manually verify real WebGL in Task 13.

**Verification:**

- [ ] `npm test -- tests/bed-geometry.test.ts tests/components/ModelPreview.test.tsx`
- [ ] `npm run build`

**Commit:** `feat: add machine-aware 3D model preview`

---

### Task 10: Render parsed toolpaths with layer scrubbing

**Files:**

- Add: `src/components/ToolpathPreview.tsx`
- Add: `src/lib/toolpath-geometry.ts`
- Add: `tests/toolpath-geometry.test.ts`
- Add: `tests/components/ToolpathPreview.test.tsx`

**Steps:**

- [ ] `ToolpathPreview` accepts `Toolpath` and bed metadata only. It must never parse G-code or
  call Kiri.
- [ ] Convert selected layers to packed `Float32Array` line positions. Use at most a small
  fixed number of `LineSegments` objects: current layer bright, previous/all layers muted.
- [ ] Add a layer slider with labelled `1..N` display, first/middle/last support, keyboard
  operation, and a “current layer / all through current” toggle.
- [ ] Default to the final layer after a new successful slice so the whole object is visible;
  preserve no layer state across a different toolpath.
- [ ] Reuse the bed footprint helper and Z-up viewport. Fit camera to the union of toolpath and
  bed bounds.
- [ ] Empty toolpaths show a notice and do not construct invalid buffer geometry.
- [ ] Dispose toolpath-owned geometries/materials on layer change, replacement, and unmount.
- [ ] Define `MAX_VISIBLE_SEGMENTS = 1_000_000`. Above it, render current-layer-only and show a
  performance notice rather than allocating an unbounded all-layer buffer.
- [ ] Test slider bounds, packed coordinates, current/all modes, empty layers, segment cap,
  reset on replacement, and disposal with mocked Three viewport pieces.

**Verification:**

- [ ] `npm test -- tests/toolpath-geometry.test.ts tests/components/ToolpathPreview.test.tsx`
- [ ] `npm run build`

**Commit:** `feat: add layered 3D toolpath preview`

---

### Task 11: Build the wizard UI and integrate the complete slicing pipeline

**Files:**

- Add: `src/components/WizardSteps.tsx`
- Add: `src/components/UploadStep.tsx`
- Add: `src/components/ConfigureStep.tsx`
- Add: `src/components/PreviewStep.tsx`
- Add: `src/components/DownloadStep.tsx`
- Add: `src/components/WarningsPanel.tsx`
- Add: `src/components/StatsPanel.tsx`
- Add: `src/components/EngineLog.tsx`
- Rewrite: `src/App.tsx`
- Modify: `src/styles.css`
- Add: `tests/App.test.tsx`

**Upload flow:**

- [ ] Support file input and drag/drop for `.stl`; extension is guidance, parser result is the
  authority.
- [ ] Call `file.arrayBuffer()` exactly once. Immediately parse/analyze and retain the same raw
  buffer for slicing.
- [ ] On replacement, dispose the old geometry and reset slice state/acknowledgements. Dispose
  the current geometry on unmount.
- [ ] Invalid STL stays on Upload with actionable `role="alert"` guidance.
- [ ] Show filename, size, dimensions, triangle count, and huge-model warning. Do not mount
  `ModelPreview` until the user explicitly continues past a huge-model warning.

**Configure flow:**

- [ ] Render preset cards/select with seed-profile caveat, bed shape/dimensions, nozzle, and
  machine description.
- [ ] Render labelled controls for layer height, line width, print speed, and vase mode.
- [ ] Show live dimensions-versus-bed status and all pre-slice guardrails.
- [ ] Slice is disabled until model and engine are ready. Engine failure has Retry without
  erasing the model.

**Slice orchestration:**

- [ ] Capture request ID and input revision. Slice retained STL once with selected device plus
  `clayProcess(controls, preset.processDefaults)`.
- [ ] Bound the visible engine log while retaining enough recent context for errors.
- [ ] Reject blank G-code through `kiri.ts`, then compute stats and warnings.
- [ ] Parse toolpath in its own `try/catch`. On parser failure, store `toolpathError`, keep the
  model preview/stats/warnings/G-code, and allow Download if safety rules pass.
- [ ] Dispatch success only if request ID/revision are still current.

**Preview flow:**

- [ ] Toggle Model and Toolpath tabs with accessible tab semantics. Hide/disable toolpath with
  an explanatory notice when parsing failed or produced no drawable extrusion.
- [ ] Show stats and warnings independent of the active preview tab.
- [ ] A settings/machine change marks the visible result “Preview out of date,” returns the
  primary action to Re-slice, and disables Download until refreshed.
- [ ] A failed re-slice must not make the old result look current.

**Download flow:**

- [ ] Repeat the current warnings and stats. Final safe-download gating is completed in Task
  12; Task 11 may use a temporary disabled button wired to the current-result selector.

**App tests with Kiri/previews mocked:**

- [ ] Valid upload reads once, advances, and shows dimensions.
- [ ] Invalid/truncated upload remains on Upload.
- [ ] Engine failure/retry preserves uploaded model.
- [ ] Step navigation is gated by available/current data.
- [ ] Selecting a machine resets defaults and invalidates an existing slice.
- [ ] Control changes make output stale and disable Download.
- [ ] Late slice response is ignored after settings/file changes.
- [ ] Empty G-code shows retryable slice error.
- [ ] Toolpath exception preserves stats/model/current G-code.
- [ ] Huge model requires Continue before WebGL preview mounts.

**Verification:**

- [ ] `npm test -- tests/App.test.tsx`
- [ ] `npm test`
- [ ] `npm run build`

**Commit:** `feat: integrate clay slicing wizard workflow`

---

### Task 12: Finish safe download, failure recovery, responsive UI, and accessibility

**Files:**

- Modify: `src/App.tsx`
- Modify: `src/components/DownloadStep.tsx`
- Modify: `src/components/WarningsPanel.tsx`
- Modify: `src/styles.css`
- Modify: `tests/App.test.tsx`
- Add: `src/download.ts`
- Add: `tests/download.test.ts`

**Download contract:**

- Sanitize the base model name and machine ID, remove the final `.stl`, collapse unsafe
  filename characters, and produce `<model>_<machine>_clay.gcode`.
- Create a text Blob, append/click a temporary anchor, remove it, and revoke the object URL on
  a zero-delay callback for browser reliability.
- Never download stale or blank G-code.

**Safety behavior:**

- [ ] If current warnings contain `fit-footprint` or `fit-height`, show an unchecked explicit
  acknowledgement naming the exceeded build volume. Download becomes available only after it
  is checked.
- [ ] Reset acknowledgement after file, machine, controls, or successful re-slice changes the
  current revision/result.
- [ ] Heating errors always block download and explain which commands/lines were found.
- [ ] Other warn/info messages do not block but remain visible beside the button.
- [ ] Toolpath parser failure does not block a safe G-code download.

**Recovery and UX:**

- [ ] Engine Retry reinjects the CDN script and retains model/settings.
- [ ] Slice Retry uses current inputs and clears only the prior slice error/log.
- [ ] All async states have text status; errors use `role="alert"`; progress uses
  `aria-live="polite"`.
- [ ] Mobile/narrow layout is single-column, previews use stable aspect/min-height, sliders and
  buttons have adequate targets, and acknowledgement stays adjacent to Download.
- [ ] Focus moves to the new step heading after deliberate step navigation and returns to a
  meaningful control after retry errors.
- [ ] No warning relies only on color; canvas/tabs/ranges/checkboxes have accessible labels.

**Tests:**

- [ ] Filename sanitization and exact machine-aware result.
- [ ] Blob contains the exact G-code.
- [ ] Fit acknowledgement gates and resets correctly.
- [ ] Heating error cannot be overridden.
- [ ] Stale/blank G-code cannot download.
- [ ] Toolpath failure still permits an otherwise safe download.
- [ ] Retry paths and warning repetition on Download.

**Verification:**

- [ ] `npm test -- tests/download.test.ts tests/App.test.tsx`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] `git diff --check`

**Commit:** `feat: enforce safe clay G-code download flow`

---

### Task 13: Document, deploy, and run release verification

**Files:**

- Rewrite: `README.md`
- Add: `docs/manual-smoke-test.md`
- Add: `.nvmrc` or document the selected Node version in `README.md`
- Optionally add: `wrangler.jsonc` and a `deploy` script if this repository will deploy through
  Wrangler rather than the Cloudflare Pages dashboard/Git integration.

**README requirements:**

- [ ] Replace PoC description/screens with v1 upload/configure/preview/download flow.
- [ ] Document local development, tests, production build, and Cloudflare Pages settings:
  project root is this folder, build command `npm run build`, output directory `dist`.
- [ ] State that slicing is fully client-side and presets are calibration seeds.
- [ ] Document supported STL-only scope and v1 non-goals.
- [ ] Document CDN dependency and self-hosting of `engine.js`, `kiri_work.js`, and
  `kiri_pool.js` as the hardening follow-up.
- [ ] Label time/extrusion/overhang/feature outputs as estimates/advisories.

**Automated release gate:**

```bash
npm ci
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

- [ ] Confirm the built app loads from `dist`, not only Vite dev mode.
- [ ] Confirm no test uses live grid.space/network access.
- [ ] Confirm production bundle contains no backend/API/database dependency.

**Manual local E2E:**

- [ ] Upload `asymmetric-box.stl`; verify dimensions and center-XY/min-Z placement.
- [ ] Select all three presets; verify rectangular versus circular bed and height volume.
- [ ] Slice with vase on/off and confirm observable G-code/toolpath differences.
- [ ] Change layer height, line width, and speed; each must mark preview stale, and re-slicing
  must change the appropriate Kiri output.
- [ ] Scrub first/middle/final toolpath layers and toggle current/all-through-current.
- [ ] Confirm stats are plausible, downloaded file is non-empty, filename includes machine ID,
  and executable G-code contains no `M104/M109/M140/M190`.
- [ ] Compare asymmetric model placement with toolpath placement. If Kiri coordinates do not
  match normalization, stop release and correct the shared transform contract.
- [ ] Upload invalid/truncated STL and recover without reloading the page.
- [ ] Block the engine request, observe failure, restore network, Retry, and slice without
  re-uploading.
- [ ] Force a toolpath parser error in development and confirm model/stats/download survive.
- [ ] Test oversized rectangular and circular models; acknowledgement gates only fit errors.
- [ ] Confirm a heating-command fixture blocks download with no override.
- [ ] Test a high-poly/large model warning without a blank screen.
- [ ] Inspect mobile/narrow layout, keyboard navigation, focus, screen-reader names, browser
  console, and network failures.
- [ ] Replace the model/re-slice several times and inspect for duplicate canvases/listeners or
  obvious GPU/memory growth.

**Cloudflare Pages verification:**

- [ ] Deploy a preview using the chosen Pages workflow.
- [ ] Repeat upload -> configure -> slice -> preview -> download on the preview URL.
- [ ] Verify the CDN engine and its worker/pool requests load from the deployed origin.
- [ ] Confirm HTTPS, asset paths, MIME types, caching, and no SPA fallback requirement (v1 has
  no routes).
- [ ] Record the preview/production URL and date in `docs/manual-smoke-test.md`.

**Commit:** `docs: document clay slicer release and deployment checks`

---

## Final Definition of Done

- [ ] All v1 scope in the approved design is implemented; non-goals remain absent.
- [ ] Every pure unit has focused tests, including rectangular/circular fit and a committed
  real Kiri G-code fixture.
- [ ] `npm test`, `npm run build`, and `git diff --check` pass from a clean checkout.
- [ ] One retained STL buffer drives both normalized preview analysis and exactly one Kiri
  slice per user action.
- [ ] Model and toolpath previews are aligned, responsive, demand-rendered, and cleaned up.
- [ ] Changing machine/settings creates a stale result that cannot be downloaded.
- [ ] Toolpath parsing can fail without blocking safe G-code download.
- [ ] Heating commands always block; fit errors require explicit current-result acknowledgement.
- [ ] The three preset seed profiles have been manually inspected and clearly labelled as
  requiring printer/paste calibration.
- [ ] The production `dist` build completes a browser smoke test locally and on Cloudflare
  Pages.

## Explicitly Deferred After v1

- Self-hosting Kiri engine/worker/pool scripts.
- Real mesh-thickness/feature-size analysis.
- Automatic orientation/rotation for fit.
- Supports, non-planar slicing, free-form printers, accounts, storage, ordering, payments,
  multi-material, and backend services.

