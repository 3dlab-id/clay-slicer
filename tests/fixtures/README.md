# Test fixtures

`asymmetric-box.stl` is a small ASCII STL cuboid with deliberately asymmetric,
non-centered bounds: X = 10..30 mm, Y = -5..5 mm, and Z = 2..7 mm. Its expected size is
20 x 10 x 5 mm with 12 triangles. The unequal X/Y dimensions and non-zero source offset let
model-analysis tests detect axis swaps and normalization mistakes.

`invalid-truncated.stl` starts as an ASCII STL facet but ends before its loop, facet, and
solid are closed. STL ingestion must reject it rather than returning renderable geometry.

Later tasks add real Kiri:Moto and hand-authored modal G-code fixtures. Record their source,
any reductions made for test readability, and the exact layer-marker syntax here.
