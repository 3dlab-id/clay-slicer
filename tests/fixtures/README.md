# Test fixtures

`asymmetric-box.stl` is a small ASCII STL cuboid with deliberately asymmetric,
non-centered bounds: X = 10..30 mm, Y = -5..5 mm, and Z = 2..7 mm. Its expected size is
20 x 10 x 5 mm with 12 triangles. The unequal X/Y dimensions and non-zero source offset let
model-analysis tests detect axis swaps and normalization mistakes.

`invalid-truncated.stl` starts as an ASCII STL facet but ends before its loop, facet, and
solid are closed. STL ingestion must reject it rather than returning renderable geometry.

`kiri-sample.gcode` is genuine Kiri:Moto 4.7.1 output produced from `asymmetric-box.stl`
with the Ender-3 clay preset on 2026-07-15. The legacy CDN global used by the PoC had been
removed, so capture used the official `/lib/kiri/run/engine.js` module through a browser-only
compatibility shim; it did not rewrite application behavior or resulting G-code. The preset
includes the explicit zero X/Y extruder offsets required for finite current Kiri output; no
coordinate or G-code value was manually rewritten. The fixture deletes
verbose process metadata and repeated middle moves, but retains the real
header, startup modes, all five layer markers, representative travel/extrusion, and end
macro. Kiri's exact layer marker is `;; --- layer 0 (1.000 @ 1) ---`.

`modal-modes.gcode` is hand-authored to exercise scanner behavior that the real Kiri sample
does not cover compactly: absolute and relative XYZ/E, `G92`, inch conversion, lowercase and
modal motion, line numbers/checksums, retraction, E-only motion, comments, and an executable
heating command.
