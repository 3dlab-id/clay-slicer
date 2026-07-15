import * as THREE from "three";
import { STLLoader } from "three/addons/loaders/STLLoader.js";
import type { Bounds3, ModelAnalysis } from "./domain";

export interface ModelAsset {
  geometry: THREE.BufferGeometry;
  analysis: ModelAnalysis;
}

export const HUGE_TRIANGLE_COUNT = 500_000;
export const HUGE_SOURCE_BYTES = 50 * 1024 * 1024;
export const OVERHANG_NORMAL_Z = -Math.cos(Math.PI / 4);
export const OVERHANG_WARNING_FRACTION = 0.1;

/** Faces wholly on the normalized build plane are not treated as overhangs. */
export const BUILD_PLANE_EPSILON = 1e-6;
const NORMAL_COMPARISON_EPSILON = 1e-12;

const INVALID_STL_MESSAGE =
  "This STL could not be read. Choose a valid, non-empty ASCII or binary STL file.";

function invalidStl(): Error {
  return new Error(INVALID_STL_MESSAGE);
}

function validateAsciiStructure(buffer: ArrayBuffer): void {
  const text = new TextDecoder().decode(buffer);
  if (!/^\s*solid(?:\s|$)/i.test(text) || !/\bendsolid(?:[ \t]+[^\r\n]*)?[ \t\r\n]*$/i.test(text)) {
    throw invalidStl();
  }

  const facets = text.match(/^\s*facet(?:\s|$)/gim)?.length ?? 0;
  const facetEnds = text.match(/^\s*endfacet(?:\s|$)/gim)?.length ?? 0;
  const loops = text.match(/^\s*outer\s+loop(?:\s|$)/gim)?.length ?? 0;
  const loopEnds = text.match(/^\s*endloop(?:\s|$)/gim)?.length ?? 0;
  const vertices = text.match(/^\s*vertex(?:\s|$)/gim)?.length ?? 0;

  if (
    facets === 0 ||
    facets !== facetEnds ||
    facets !== loops ||
    loops !== loopEnds ||
    vertices !== facets * 3
  ) {
    throw invalidStl();
  }
}

function validateContainer(buffer: ArrayBuffer): void {
  if (buffer.byteLength === 0) throw invalidStl();

  // An exact binary byte count is authoritative, even when a binary header starts
  // with the word "solid". Otherwise, only a textual `solid` is accepted as ASCII.
  if (buffer.byteLength >= 84) {
    const triangleCount = new DataView(buffer).getUint32(80, true);
    const expectedBytes = 84 + triangleCount * 50;
    if (expectedBytes === buffer.byteLength) return;
  }

  const prefix = new TextDecoder().decode(buffer.slice(0, Math.min(buffer.byteLength, 256)));
  if (/^\s*solid(?:\s|$)/i.test(prefix)) {
    validateAsciiStructure(buffer);
    return;
  }

  throw invalidStl();
}

function getTriangleCount(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute("position");
  if (!positions || positions.itemSize !== 3 || positions.count === 0) {
    throw invalidStl();
  }

  const elementCount = geometry.index?.count ?? positions.count;
  if (elementCount === 0 || elementCount % 3 !== 0) throw invalidStl();
  return elementCount / 3;
}

function validateFinitePositions(geometry: THREE.BufferGeometry): void {
  const positions = geometry.getAttribute("position");
  if (!positions) throw invalidStl();

  for (let index = 0; index < positions.count; index += 1) {
    if (
      !Number.isFinite(positions.getX(index)) ||
      !Number.isFinite(positions.getY(index)) ||
      !Number.isFinite(positions.getZ(index))
    ) {
      throw invalidStl();
    }
  }
}

function toBounds(box: THREE.Box3): Bounds3 {
  const size = box.getSize(new THREE.Vector3());
  return {
    min: { x: box.min.x, y: box.min.y, z: box.min.z },
    max: { x: box.max.x, y: box.max.y, z: box.max.z },
    size: { x: size.x, y: size.y, z: size.z },
  };
}

function vertexIndex(geometry: THREE.BufferGeometry, elementIndex: number): number {
  return geometry.index?.getX(elementIndex) ?? elementIndex;
}

function hasNonDegenerateFace(geometry: THREE.BufferGeometry): boolean {
  const positions = geometry.getAttribute("position");
  if (!positions) return false;

  const elements = geometry.index?.count ?? positions.count;
  const a = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let index = 0; index < elements; index += 3) {
    a.fromBufferAttribute(positions, vertexIndex(geometry, index));
    ab.fromBufferAttribute(positions, vertexIndex(geometry, index + 1)).sub(a);
    ac.fromBufferAttribute(positions, vertexIndex(geometry, index + 2)).sub(a);
    if (ab.cross(ac).lengthSq() > Number.EPSILON) return true;
  }
  return false;
}

function computeOverhangFraction(geometry: THREE.BufferGeometry): number {
  const positions = geometry.getAttribute("position");
  if (!positions) return 0;

  const elements = geometry.index?.count ?? positions.count;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let consideredArea = 0;
  let overhangArea = 0;

  for (let index = 0; index < elements; index += 3) {
    a.fromBufferAttribute(positions, vertexIndex(geometry, index));
    b.fromBufferAttribute(positions, vertexIndex(geometry, index + 1));
    c.fromBufferAttribute(positions, vertexIndex(geometry, index + 2));

    if (
      Math.abs(a.z) <= BUILD_PLANE_EPSILON &&
      Math.abs(b.z) <= BUILD_PLANE_EPSILON &&
      Math.abs(c.z) <= BUILD_PLANE_EPSILON
    ) {
      continue;
    }

    ab.subVectors(b, a);
    ac.subVectors(c, a);
    cross.crossVectors(ab, ac);
    const twiceArea = cross.length();
    if (twiceArea <= Number.EPSILON) continue;

    const area = twiceArea / 2;
    consideredArea += area;
    if (cross.z / twiceArea <= OVERHANG_NORMAL_Z + NORMAL_COMPARISON_EPSILON) {
      overhangArea += area;
    }
  }

  return consideredArea > 0 ? overhangArea / consideredArea : 0;
}

export function isHugeModel(triangleCount: number, sourceBytes: number): boolean {
  return triangleCount >= HUGE_TRIANGLE_COUNT || sourceBytes >= HUGE_SOURCE_BYTES;
}

export function parseAndAnalyzeStl(
  buffer: ArrayBuffer,
  sourceBytes = buffer.byteLength,
): ModelAsset {
  if (!Number.isSafeInteger(sourceBytes) || sourceBytes < 0) throw invalidStl();
  validateContainer(buffer);

  let parsed: THREE.BufferGeometry;
  try {
    parsed = new STLLoader().parse(buffer);
  } catch {
    throw invalidStl();
  }

  const geometry = parsed.clone();
  parsed.dispose();

  try {
    const triangleCount = getTriangleCount(geometry);
    validateFinitePositions(geometry);
    if (!hasNonDegenerateFace(geometry)) throw invalidStl();

    geometry.computeBoundingBox();
    const sourceBox = geometry.boundingBox;
    if (!sourceBox || sourceBox.isEmpty()) throw invalidStl();

    const sourceSize = sourceBox.getSize(new THREE.Vector3());
    if (
      !Number.isFinite(sourceSize.x) ||
      !Number.isFinite(sourceSize.y) ||
      !Number.isFinite(sourceSize.z) ||
      sourceSize.lengthSq() <= Number.EPSILON
    ) {
      throw invalidStl();
    }

    const center = sourceBox.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -sourceBox.min.z);
    geometry.deleteAttribute("normal");
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();

    const normalizedBox = geometry.boundingBox;
    const sphere = geometry.boundingSphere;
    if (
      !normalizedBox ||
      normalizedBox.isEmpty() ||
      !sphere ||
      !Number.isFinite(sphere.radius)
    ) {
      throw invalidStl();
    }

    return {
      geometry,
      analysis: {
        bounds: toBounds(normalizedBox),
        triangleCount,
        sourceBytes,
        overhangFraction: computeOverhangFraction(geometry),
        isHuge: isHugeModel(triangleCount, sourceBytes),
      },
    };
  } catch (error) {
    geometry.dispose();
    if (error instanceof Error && error.message === INVALID_STL_MESSAGE) throw error;
    throw invalidStl();
  }
}

export function disposeModelAsset(asset: ModelAsset): void {
  asset.geometry.dispose();
}
