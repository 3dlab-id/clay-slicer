# Clay Slicer release verification

This file is the retained release record for local production-build and Cloudflare Pages
verification. Do not mark a release complete until every required item passes. Record failures
and corrective commits rather than deleting prior evidence.

## Release record

| Field | Value |
| --- | --- |
| Status | **Local and Cloudflare core smoke passed; extended manual/CI verification pending** |
| Verification date | 2026-07-15 |
| Candidate commit | `a380b0e2c7eb879fa5fb38f6d72eeeada808a394` |
| Operator | Pending |
| Target Node.js | `22.16.0` (`.nvmrc`) |
| Local verification runtime | Node.js `24.12.0`, npm `11.6.2` |
| Browser / OS | Headless Google Chrome, Linux, 390 × 844 CSS px at DPR 2 |
| Kiri:Moto | `4.7.1`, vendored same-origin runtime |
| Local production preview | `http://127.0.0.1:4173/` — core smoke passed 2026-07-15 |
| Cloudflare preview URL | Not configured in v1 |
| Cloudflare production URL | `https://clay-slicer.pages.dev/` |
| Production verification date | 2026-07-15 |

The Node 22 pin matches Cloudflare Pages build image v3. The local runtime shown above records
the environment available when this document was created; the clean release gate still needs
to be repeated under the pinned runtime.

## Verified repository facts

- [x] Client application has no backend, database dependency, Pages Functions, or API route.
- [x] Tests contain no live Grid.Space/network access; runtime imports are mocked through test seams.
- [x] Vendored engine, worker, and WASM files exist in `public/` and are copied by the build.
- [x] Vendored provenance, licenses, Kiri version, and checksums are documented.
- [ ] Clean `npm ci` completed under Node.js `22.16.0`.
- [ ] Full automated gate completed under Node.js `22.16.0`.

Expected vendored checksums:

```text
cea97f115c0da8c434803a14bb80c87c27594229ab1cfffc02b87f792e9bf8e1  public/lib/kiri/run/engine.js
cff2247bbb79d0493f0e2d4114bda8eab43ccf7d85eb77844aa0ce99ebfd1c2a  public/lib/kiri/run/worker.js
8f8cb69137af5dd87950b60aa88d7613cde48e4af45b43b8464473191cc9dbe6  public/wasm/manifold.wasm
```

## Automated release gate

Run from a clean checkout:

```bash
nvm use
npm ci
npm test
npm run build
git diff --check
npm run preview -- --host 127.0.0.1
```

Record results:

- [ ] `node --version` reports `v22.16.0`.
- [ ] `npm ci` passes.
- [ ] `npm test` passes. Result: Pending.
- [ ] `npm run build` passes. Result: Pending clean-checkout verification.
- [ ] `git diff --check` passes.
- [x] Production preview serves `dist/index.html`, not the Vite development app.
- [x] Browser console has no application errors. One known warning was recorded: Kiri and the
  app each bundle Three.js, so Three reports that multiple instances are imported.

While the production preview runs, verify the static runtime:

```bash
curl -I http://127.0.0.1:4173/
curl -I http://127.0.0.1:4173/lib/kiri/run/engine.js
curl -I http://127.0.0.1:4173/lib/kiri/run/worker.js
curl -I http://127.0.0.1:4173/wasm/manifold.wasm
sha256sum \
  dist/lib/kiri/run/engine.js \
  dist/lib/kiri/run/worker.js \
  dist/wasm/manifold.wasm
```

- [x] All four requests return `200`.
- [x] JavaScript assets have `Content-Type: text/javascript`.
- [x] `manifold.wasm` has `Content-Type: application/wasm`.
- [x] Built checksums match the vendored source checksums above.

## Manual local browser E2E

Use `tests/fixtures/asymmetric-box.stl` unless a step names another fixture.

- [x] Upload the STL and verify dimensions are `20 × 10 × 5 mm`.
- [ ] Verify the model is centered on X/Y and minimum Z rests on the bed.
- [ ] Select Ender-3 Clay and verify a rectangular 234 × 234 × 245 mm build volume.
- [ ] Select WASP-style and Eazao-style presets and verify circular beds and their height volumes.
- [ ] Confirm every preset is labelled as a calibration seed.
- [ ] Slice with vase mode on and off; record observable G-code/toolpath differences.
- [ ] Change layer height, line width, and speed separately; each change marks output stale,
  blocks download, and changes the corresponding re-sliced output.
- [x] Confirm Toolpath is available after the real slice; full layer-scrubbing checks remain pending.
- [ ] Scrub first, middle, and final toolpath layers in current-layer and through-current modes.
- [x] Confirm core estimates are plausible: 196 lines, 5 layers, and 328.2 mm estimated
  extrusion distance.
- [x] Download non-empty G-code: 4,758 bytes.
- [x] Confirm filename: `asymmetric-box_ender3-clay_clay.gcode`.
- [x] Confirm no executable `M104`, `M109`, `M140`, or `M190` occurs in downloaded G-code.
- [ ] Compare asymmetric model placement with toolpath placement; stop release if they disagree.
- [x] Upload `tests/fixtures/invalid-truncated.stl`; the old filename/model is cleared, Configure
  is disabled, and a subsequent valid upload restores one preview canvas without reloading.
- [ ] Block the engine request, observe the failure, restore access, and retry without re-uploading.
- [ ] Force a toolpath-parser failure in development; model, stats, and safe download remain available.
- [ ] Test oversized rectangular and circular models; only fit errors allow acknowledgement override.
- [ ] Confirm a heating-command test result blocks download without an override.
- [ ] Test a high-poly or large model warning without a blank screen.
- [ ] Test narrow/mobile layout, keyboard navigation, focus order, accessible names, and zoom.
- [ ] Replace and re-slice models repeatedly; no duplicate canvases/listeners or obvious memory growth.

Local notes and evidence: the smoke used the real built application, vendored Kiri runtime,
`tests/fixtures/asymmetric-box.stl`, and the real browser download path. Kiri produced a
drawable 5-layer toolpath and enabled the guarded Download step. The engine and WASM were
captured as same-origin 200 responses; a completed worker-backed slice plus separate HTTP/MIME
checks verifies the worker asset. Extended preset, vase-mode, layer-scrubbing, failure-injection,
alignment, and repeated-memory checks remain pending and are not claimed here.

## Cloudflare Pages verification

Deployment workflow: GitHub Actions Direct Upload to Cloudflare Pages.

Configured settings to record:

```text
Pages project: clay-slicer
Production branch: main
Build output directory: dist (uploaded from the validated CI artifact)
CI Node version: 22
Required GitHub repository secrets: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID
```

- [x] Create the `clay-slicer` Direct Upload Pages project with production branch `main`.
- [ ] Add the two required GitHub repository secrets; do not record their values here.
- [ ] Confirm a pull request validates without deploying.
- [ ] Confirm a successful `main` run deploys the retained, tested `dist/` artifact.
- [ ] Confirm CI verifies `/`, `engine.js`, `worker.js`, and `manifold.wasm` on production.
- [x] Record the production deployment commit: `a380b0e2c7eb879fa5fb38f6d72eeeada808a394`.
  Preview deployment is not configured in v1.
- [x] Repeat upload → configure → slice → preview → download on the production URL.
- [x] Verify engine, worker, and WASM requests load from the deployed origin.
- [x] Verify HTTPS and correct JavaScript/WASM MIME types.
- [x] Inspect cache headers: unversioned Kiri paths use `max-age=0, must-revalidate`.
- [x] Confirm no SPA fallback or Pages Function handles requests.
- [ ] Test engine/network failure and retry on the deployed origin.
- [x] Record production URL and verification date.

Cloudflare notes and evidence: Wrangler 4.98.0 created the project and uploaded 9 files. The
immutable deployment URL is `https://fc70a93c.clay-slicer.pages.dev`; the production alias is
`https://clay-slicer.pages.dev/`. A real mobile-viewport Chrome run on the production alias
repeated the local evidence: 20 × 10 × 5 mm model, drawable 5-layer toolpath, 196 G-code
lines, 328.2 mm estimated extrusion, a 4,758-byte machine-aware download with no executable
heating commands, invalid-STL recovery, and one restored preview canvas. HTML, engine,
worker, and WASM returned 200; JavaScript used `application/javascript` and WASM used
`application/wasm`. The known duplicate-Three.js warning was unchanged and no application
exception was recorded.

## Sign-off

- [ ] All automated checks passed under the pinned Node version.
- [ ] All local E2E checks passed.
- [ ] All Cloudflare production checks passed.
- [ ] Production URL and verification date are recorded.
- [ ] Release approved by: Pending.
