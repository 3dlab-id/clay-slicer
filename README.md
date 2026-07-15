# Clay Slicer

Clay Slicer is a public, client-side tool for turning an STL model into clay-printer
G-code. It guides a user through upload, machine configuration, 3D model and toolpath
preview, feasibility checks, and a guarded download.

All STL parsing, slicing, analysis, preview rendering, and G-code generation run in the
browser. The application has no backend, database, accounts, or server-side model storage.

## Workflow

1. **Upload** an STL. The file is parsed locally, validated, normalized to center X/Y with
   minimum Z at zero, and analyzed for dimensions, triangle count, and advisory overhangs.
2. **Configure** a clay printer preset and adjust layer height, line width, print speed, and
   vase mode. Fit and clay-process warnings update before slicing.
3. **Preview** the normalized model and parsed extrusion toolpaths. Review estimates,
   warnings, engine output, and individual layers. A settings change makes the prior result
   stale until it is sliced again.
4. **Download** machine-aware `.gcode`. Heating commands always block download; an oversized
   model requires explicit acknowledgement tied to the current result.

## Machine presets

| Preset | Bed | Seed nozzle |
| --- | --- | --- |
| Ender-3 Clay (3D Lab) | 234 × 234 × 245 mm rectangular | 1.5 mm |
| WASP-style Delta | Ø200 × 400 mm circular | 1.5 mm |
| Eazao-style | Ø150 × 150 mm circular | 1.5 mm |

These are calibration seeds, not verified manufacturer profiles. Calibrate dimensions,
speed, extrusion behavior, paste consistency, and start/end macros on the actual printer
before use.

## Controls and guardrails

The intentionally small control set covers layer height, line width, print speed, and vase
mode. Guardrails report:

- rectangular or conservative circular-bed fit and maximum height;
- forbidden heating commands (`M104`, `M109`, `M140`, `M190`);
- clay layer-height versus nozzle sanity;
- general nozzle/line-width feature-resolution guidance;
- advisory unsupported-overhang area; and
- large-model performance risk.

Motion time is a feed-distance estimate that ignores acceleration and firmware behavior.
Extrusion distance is the slicer's virtual E-axis distance, not a measured clay volume.
Overhang and feature-resolution messages are advisories, not exact printability analysis.
The tool does not generate supports.

## Local development

The selected development and Cloudflare Pages build runtime is Node.js `22.16.0`, pinned in
`.nvmrc`. It matches the current Cloudflare Pages v3 default and is supported by the test
toolchain.

```bash
nvm use
npm ci
npm run dev
```

Vite serves the development app at `http://localhost:5180`.

Run focused or full verification with:

```bash
npm test
npm run build
npm run preview -- --host 127.0.0.1
```

The production build is written to `dist/`. The preview command serves that built output,
normally at `http://127.0.0.1:4173`.

## Architecture

```text
retained STL ArrayBuffer
  ├─ STLLoader → normalized BufferGeometry → model preview + model guardrails
  └─ Kiri:Moto device/process → G-code
       ├─ modal scanner → statistics
       ├─ toolpath parser → layered 3D toolpath preview
       └─ post-slice guardrails → safe download gate
```

React owns the workflow state. Pure modules handle machine presets, STL analysis, modal
G-code scanning, statistics, toolpath parsing, and guardrails. Three.js preview components
consume normalized geometry or already-parsed segments; they do not slice or parse G-code.

## Kiri:Moto runtime

Kiri:Moto `4.7.1` is pinned and served from the same origin:

- `public/lib/kiri/run/engine.js`
- `public/lib/kiri/run/worker.js`
- `public/wasm/manifold.wasm`

Vite copies these files into the equivalent `dist/` paths. GridSpace/Kiri:Moto is MIT
licensed; the vendored Manifold WebAssembly asset is Apache-2.0 licensed. Exact provenance,
license copies, retrieval dates, and SHA-256 checksums are recorded in
[`public/lib/kiri/README.md`](public/lib/kiri/README.md).

Update the runtime as one coordinated unit:

1. Retrieve engine, worker, and Manifold assets together from the upstream URLs recorded in
   the vendored runtime README. Never update only one artifact.
2. Confirm the embedded Kiri version matches in both JavaScript bundles.
3. Refresh the upstream license copies when their text changes.
4. Recompute and update every SHA-256 checksum in the vendored runtime README.
5. Run `npm test` and `npm run build`.
6. Repeat the complete browser smoke test, including a real slice, layer preview, heating
   scan, model/toolpath alignment, and same-origin worker/WASM requests.

## Cloudflare Pages

GitHub Actions validates every pull request and every push to `main` with `npm ci`, the full
test suite, and a production build. Pull requests do not deploy. A successful `main` run
uploads that exact tested `dist/` artifact to the `clay-slicer` Cloudflare Pages project and
checks the production HTML and vendored Kiri assets at `https://clay-slicer.pages.dev`.
Manual workflow runs deploy only when run from `main`.

Create the Pages project once as a Direct Upload project with production branch `main`. Add
the following GitHub Actions repository secrets (names only are shown here):

- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

The API token needs Cloudflare Pages edit permission for the account. CI uses Node 22 and
deploys the Vite output directory `dist`; local development remains pinned more precisely by
`.nvmrc` to Node.js `22.16.0`. Do not also enable Pages Git integration for this repository,
because that would create a second build and deployment path.

No Pages Functions, backend bindings, redirects, or SPA fallback are required in v1 because
the application is a static single page with no client-side routes. Before production,
verify the deployed origin serves `engine.js`, `worker.js`, and `manifold.wasm` with correct
MIME types and completes the full upload-to-download flow. Record release evidence in
[`docs/manual-smoke-test.md`](docs/manual-smoke-test.md).

Cloudflare reference:

- [Direct Upload with CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/)
- [React/Vite build settings](https://developers.cloudflare.com/pages/configuration/build-configuration/)

## v1 scope and non-goals

v1 accepts STL files only and offers preset-based FDM-style clay slicing. It deliberately
does not include accounts, saved projects, a backend/database, ordering or CRM handoff,
payments, printer control, support generation, non-planar slicing, arbitrary machine-profile
editing, non-STL model formats, or multi-material output.

Generated G-code is a starting point, not a guarantee of a safe or successful print. Inspect
the output and validate it on the intended clay printer before operating machinery.
