# Vendored Kiri:Moto runtime

These files are a version-matched, same-origin Kiri:Moto runtime used by Clay Slicer. Kiri's
engine resolves its worker and Manifold WebAssembly assets relative to the host application,
so loading only the remote engine module is not sufficient for an off-site static app.

## Provenance

- Upstream project: [GridSpace/grid-apps](https://github.com/GridSpace/grid-apps)
- Kiri:Moto version: `4.7.1` (embedded `VERSION` value in both JavaScript bundles)
- Retrieved: `2026-07-15`
- Engine source: `https://grid.space/lib/kiri/run/engine.js`
- Worker source: `https://grid.space/lib/kiri/run/worker.js`
- Manifold source: `https://grid.space/wasm/manifold.wasm`
- Upstream release: `4.7.1`, published `2026-06-22`
- GridSpace license source:
  `https://raw.githubusercontent.com/GridSpace/grid-apps/master/license.md`
- Manifold license source:
  `https://raw.githubusercontent.com/elalish/manifold/master/LICENSE`

The JavaScript responses reported `Last-Modified: Mon, 22 Jun 2026 00:25:03 GMT`. The WASM
response reported `Last-Modified: Sun, 21 Dec 2025 06:00:37 GMT`.

## SHA-256

```text
cea97f115c0da8c434803a14bb80c87c27594229ab1cfffc02b87f792e9bf8e1  run/engine.js
cff2247bbb79d0493f0e2d4114bda8eab43ccf7d85eb77844aa0ce99ebfd1c2a  run/worker.js
8f8cb69137af5dd87950b60aa88d7613cde48e4af45b43b8464473191cc9dbe6  ../../wasm/manifold.wasm
192fd42ad203e43b1b870ae7e2c2fe2b2a7842ac93c530d61d54099408727c9b  LICENSE-grid-apps.md
c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4  LICENSE-manifold.txt
```

The checksum path for Manifold is repository-relative as `public/wasm/manifold.wasm`; the
relative path shown above is only a compact description from this metadata directory.

## Licensing

Kiri:Moto/GridSpace grid-apps is distributed under the MIT license. The exact upstream text
retrieved with this runtime is included as [LICENSE-grid-apps.md](./LICENSE-grid-apps.md).
The generated JavaScript bundles also retain their upstream copyright and third-party license
notices.

`manifold.wasm` is the Manifold geometry library used by the upstream bundle. Manifold is
distributed under Apache License 2.0; the exact upstream text is included as
[LICENSE-manifold.txt](./LICENSE-manifold.txt).

When updating, retrieve all three files together from the URLs above, confirm their embedded
Kiri version remains aligned, recompute the checksums, and repeat the browser slicing smoke
test. Do not update a single runtime artifact independently.
