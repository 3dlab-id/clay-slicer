import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  HUGE_SOURCE_BYTES,
  HUGE_TRIANGLE_COUNT,
  OVERHANG_NORMAL_Z,
  disposeModelAsset,
  isHugeModel,
  parseAndAnalyzeStl,
} from "../src/model-analysis";

type Point = [number, number, number];
type Triangle = [Point, Point, Point];

const fixture = (name: string): ArrayBuffer => {
  const bytes = readFileSync(resolve("tests/fixtures", name));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

function asciiStl(triangles: Triangle[]): ArrayBuffer {
  const facets = triangles.map((triangle) => `
  facet normal 0 0 0
    outer loop
${triangle.map(([x, y, z]) => `      vertex ${x} ${y} ${z}`).join("\n")}
    endloop
  endfacet`).join("");
  return new TextEncoder().encode(`solid test${facets}\nendsolid test`).buffer;
}

function binaryStl(triangles: Triangle[]): ArrayBuffer {
  const buffer = new ArrayBuffer(84 + triangles.length * 50);
  const view = new DataView(buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((triangle, triangleIndex) => {
    let offset = 84 + triangleIndex * 50;
    offset += 12; // normal; STLLoader recomputes it from the vertices
    triangle.forEach((point) => point.forEach((coordinate) => {
      view.setFloat32(offset, coordinate, true);
      offset += 4;
    }));
  });
  return buffer;
}

const INVALID_MESSAGE = /valid, non-empty ASCII or binary STL/i;

describe("parseAndAnalyzeStl", () => {
  it("parses and normalizes the asymmetric ASCII fixture", () => {
    const buffer = fixture("asymmetric-box.stl");
    const asset = parseAndAnalyzeStl(buffer);

    expect(asset.analysis).toMatchObject({
      triangleCount: 12,
      sourceBytes: buffer.byteLength,
      bounds: {
        min: { x: -10, y: -5, z: 0 },
        max: { x: 10, y: 5, z: 5 },
        size: { x: 20, y: 10, z: 5 },
      },
      isHuge: false,
    });
    expect(asset.analysis.estimatedFeatureSizeMm).toBeUndefined();
    expect(asset.geometry.boundingBox).not.toBeNull();
    expect(asset.geometry.boundingSphere?.radius).toBeGreaterThan(0);
    expect(asset.geometry.getAttribute("normal")).toBeDefined();

    disposeModelAsset(asset);
  });

  it("parses binary STL without mutating or detaching the source buffer", () => {
    const source = binaryStl([
      [[4, 5, 6], [8, 5, 6], [4, 9, 8]],
      [[8, 5, 6], [8, 9, 8], [4, 9, 8]],
    ]);
    const before = new Uint8Array(source).slice();
    const asset = parseAndAnalyzeStl(source, 1234);

    expect(source.byteLength).toBe(before.byteLength);
    expect(new Uint8Array(source)).toEqual(before);
    expect(asset.analysis.sourceBytes).toBe(1234);
    expect(asset.analysis.triangleCount).toBe(2);
    expect(asset.analysis.bounds.min).toEqual({ x: -2, y: -2, z: 0 });
    expect(asset.analysis.bounds.max).toEqual({ x: 2, y: 2, z: 2 });

    disposeModelAsset(asset);
  });

  it.each([
    ["empty input", new ArrayBuffer(0)],
    ["truncated ASCII", fixture("invalid-truncated.stl")],
    ["ASCII with no facets", new TextEncoder().encode("solid empty\nendsolid empty").buffer],
    ["collapsed geometry", asciiStl([[[1, 1, 1], [1, 1, 1], [1, 1, 1]]])],
    ["collinear geometry", asciiStl([[[0, 0, 0], [1, 1, 1], [2, 2, 2]]])],
  ])("rejects %s with a stable actionable error", (_label, buffer) => {
    expect(() => parseAndAnalyzeStl(buffer)).toThrow(INVALID_MESSAGE);
  });

  it("rejects truncated binary input", () => {
    const valid = binaryStl([[[0, 0, 0], [1, 0, 0], [0, 1, 1]]]);
    expect(() => parseAndAnalyzeStl(valid.slice(0, -1))).toThrow(INVALID_MESSAGE);
  });

  it("rejects non-finite vertex coordinates", () => {
    const invalid = binaryStl([[[0, 0, 0], [1, 0, 0], [0, 1, 1]]]);
    new DataView(invalid).setFloat32(84 + 12, Number.POSITIVE_INFINITY, true);
    expect(() => parseAndAnalyzeStl(invalid)).toThrow(INVALID_MESSAGE);
  });

  it("rejects a non-triangle ASCII facet", () => {
    const invalid = new TextEncoder().encode(`solid bad
facet normal 0 0 1
outer loop
vertex 0 0 0
vertex 1 0 0
vertex 0 1 0
vertex 1 1 0
endloop
endfacet
endsolid bad`).buffer;
    expect(() => parseAndAnalyzeStl(invalid)).toThrow(INVALID_MESSAGE);
  });

  it("area-weights downward faces while ignoring bottom and degenerate faces", () => {
    const upward: Triangle = [[0, 0, 1], [2, 0, 1], [0, 2, 1]]; // area 2
    const downward: Triangle = [[0, 0, 2], [0, 2, 2], [2, 0, 2]]; // area 2
    const vertical: Triangle = [[3, 0, 0], [3, 2, 0], [3, 0, 2]]; // area 2
    const bottom: Triangle = [[0, 0, 0], [0, 2, 0], [2, 0, 0]];
    const degenerate: Triangle = [[5, 0, 1], [5, 0, 1], [5, 0, 1]];
    const asset = parseAndAnalyzeStl(asciiStl([upward, downward, vertical, bottom, degenerate]));

    expect(asset.analysis.overhangFraction).toBeCloseTo(1 / 3, 8);
    disposeModelAsset(asset);
  });

  it("includes a downward 45-degree face at the configured threshold", () => {
    const slope: Triangle = [[0, 0, 2], [0, 2, 0], [2, 0, 2]];
    const upward: Triangle = [[0, 0, 3], [2, 0, 3], [0, 2, 3]];
    const asset = parseAndAnalyzeStl(asciiStl([slope, upward]));

    expect(OVERHANG_NORMAL_Z).toBeCloseTo(-Math.SQRT1_2);
    expect(asset.analysis.overhangFraction).toBeGreaterThan(0);
    expect(asset.analysis.overhangFraction).toBeLessThan(1);
    disposeModelAsset(asset);
  });
});

describe("isHugeModel", () => {
  it.each([
    [HUGE_TRIANGLE_COUNT - 1, HUGE_SOURCE_BYTES - 1, false],
    [HUGE_TRIANGLE_COUNT, 0, true],
    [HUGE_TRIANGLE_COUNT + 1, 0, true],
    [0, HUGE_SOURCE_BYTES, true],
    [0, HUGE_SOURCE_BYTES + 1, true],
  ])("checks triangle and byte thresholds (%i triangles, %i bytes)", (triangles, bytes, expected) => {
    expect(isHugeModel(triangles, bytes)).toBe(expected);
  });
});
