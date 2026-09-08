import * as THREE from 'three';
import { LOOP_LIMIT_OPTICAL_SURFACE_V1, buildLoopLimitOpticalSurface } from './loop-limit-optical-surface-v1.mjs';

export const BOUNDED_SEQUENTIAL_REFRACTION_V1 = Object.freeze({
  mode: 'SEQUENTIAL_V1',
  algorithmVersion: 'BOUNDED_HYBRID_RASTER_MESH_BVH_SEQUENTIAL_REFRACTION_V1',
  maxInterfaces: 4,
  intersectionBackend: 'INTERNAL_BINARY_AABB_BVH_V1',
  accelerationMode: 'CPU_BUILD_GPU_TEXTURE_TRAVERSAL',
  pathLengthMode: 'TRUE_GEOMETRIC_GEMSTONE_SEGMENTS_WORLD_UNITS',
  tirPolicy: 'BOUNDED_REFLECTION_CONSUMES_INTERFACE_BUDGET',
  dispersionMode: 'DEFERRED_NON_BLOCKING',
  fallbackStatus: 'FAIL_CLOSED',
});

export const CONTINUOUS_OPTICAL_SURFACE_V1 = Object.freeze({
  mode: 'SEQUENTIAL_OPTICAL_SURFACE_V1',
  algorithmVersion: 'BOUNDED_HYBRID_RASTER_PROJECTED_MICROMESH_BVH_SEQUENTIAL_REFRACTION_V1',
  opticalSurfaceMode: 'PHONG_PROJECTED_OPTICAL_MICROMESH_V1',
  defaultSubdivisionLevel: 1,
  maximumSubdivisionLevel: 2,
  maxInterfaces: 4,
  intersectionBackend: 'INTERNAL_BINARY_AABB_BVH_V1',
  accelerationMode: 'CPU_BUILD_PROJECTED_MICROMESH_GPU_TEXTURE_TRAVERSAL',
  pathLengthMode: 'TRUE_OPTICAL_SURFACE_GEMSTONE_SEGMENTS_WORLD_UNITS',
  tirPolicy: 'BOUNDED_REFLECTION_CONSUMES_INTERFACE_BUDGET',
  dispersionMode: 'DEFERRED_NON_BLOCKING',
  fallbackStatus: 'FAIL_CLOSED',
  maturity: 'EXPERIMENTAL_R_AND_D',
});

export const R4_1_LIMITS = Object.freeze({ maxInterfaces: 4, maxTriangles: 32768, maxNodes: 32767, maxDepth: 28, leafTriangles: 4 });
export const S4_2_LIMITS = Object.freeze({ maxInterfaces: 4, maxOpticalTriangles: 65536, maximumSubdivisionLevel: 2, vertexSmoothingStrength: 0, maximumVertexSmoothingRatio: 0.2, projectionStrength: 0.5, maximumProjectionRatio: 0.35 });
const EPSILON_SCALE = 2e-5;

function finiteVector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item))) throw new Error(`${label}_MUST_BE_FINITE_VECTOR3`);
  return value;
}

function boundsFor(indices, triangles) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  const centroidMin = [Infinity, Infinity, Infinity];
  const centroidMax = [-Infinity, -Infinity, -Infinity];
  for (const triangleIndex of indices) {
    const triangle = triangles[triangleIndex];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], triangle.min[axis]); max[axis] = Math.max(max[axis], triangle.max[axis]);
      centroidMin[axis] = Math.min(centroidMin[axis], triangle.centroid[axis]); centroidMax[axis] = Math.max(centroidMax[axis], triangle.centroid[axis]);
    }
  }
  return { min, max, centroidMin, centroidMax };
}

export function buildBoundedBvh(sourceTriangles, options = {}) {
  const leafSize = options.leafSize ?? R4_1_LIMITS.leafTriangles;
  const maxDepth = options.maxDepth ?? R4_1_LIMITS.maxDepth;
  const maxTriangles = options.maxTriangles ?? R4_1_LIMITS.maxTriangles;
  if (!Number.isInteger(leafSize) || leafSize < 1 || leafSize > 8) throw new Error('R4_1_BVH_LEAF_SIZE_INVALID');
  if (!Number.isInteger(maxDepth) || maxDepth < 1 || maxDepth > R4_1_LIMITS.maxDepth) throw new Error('R4_1_BVH_DEPTH_INVALID');
  if (!Array.isArray(sourceTriangles) || sourceTriangles.length === 0) throw new Error('R4_1_BVH_REQUIRES_TRIANGLES');
  if (!Number.isInteger(maxTriangles) || maxTriangles < 1 || maxTriangles > S4_2_LIMITS.maxOpticalTriangles) throw new Error('SEQUENTIAL_BVH_TRIANGLE_LIMIT_INVALID');
  if (sourceTriangles.length > maxTriangles) throw new Error('SEQUENTIAL_BVH_TRIANGLE_LIMIT_EXCEEDED');
  const triangles = sourceTriangles.map((source, id) => {
    const vertices = Array.isArray(source) ? source : source.vertices;
    if (!Array.isArray(vertices) || vertices.length !== 3) throw new Error('R4_1_TRIANGLE_SHAPE_INVALID');
    const v = vertices.map((item, vertex) => [...finiteVector3(item, `triangle_${id}_${vertex}`)]);
    const geometricNormal = normalize(cross(subtract(v[1], v[0]), subtract(v[2], v[0])));
    const normals = (Array.isArray(source?.normals) && source.normals.length === 3 ? source.normals : [geometricNormal, geometricNormal, geometricNormal]).map((normal, vertex) => normalize(finiteVector3(normal, `normal_${id}_${vertex}`)));
    return {
      id, vertices: v,
      normals,
      min: [0, 1, 2].map((axis) => Math.min(v[0][axis], v[1][axis], v[2][axis])),
      max: [0, 1, 2].map((axis) => Math.max(v[0][axis], v[1][axis], v[2][axis])),
      centroid: [0, 1, 2].map((axis) => (v[0][axis] + v[1][axis] + v[2][axis]) / 3),
    };
  });
  const orderedTriangles = [];
  const nodes = [];
  let observedDepth = 0;
  function build(indices, depth) {
    observedDepth = Math.max(observedDepth, depth);
    if (nodes.length >= R4_1_LIMITS.maxNodes) throw new Error('R4_1_BVH_NODE_LIMIT_EXCEEDED');
    const nodeIndex = nodes.length;
    const box = boundsFor(indices, triangles);
    nodes.push(null);
    if (indices.length <= leafSize || depth >= maxDepth) {
      const offset = orderedTriangles.length;
      for (const index of indices) orderedTriangles.push(triangles[index]);
      nodes[nodeIndex] = { min: box.min, max: box.max, left: -1, right: -1, offset, count: indices.length, depth };
      return nodeIndex;
    }
    const extents = box.centroidMax.map((value, axis) => value - box.centroidMin[axis]);
    const axis = extents.indexOf(Math.max(...extents));
    indices.sort((a, b) => triangles[a].centroid[axis] - triangles[b].centroid[axis] || a - b);
    const split = Math.floor(indices.length / 2);
    if (split === 0 || split === indices.length) throw new Error('R4_1_BVH_SPLIT_FAILURE');
    const left = build(indices.slice(0, split), depth + 1);
    const right = build(indices.slice(split), depth + 1);
    nodes[nodeIndex] = { min: box.min, max: box.max, left, right, offset: -1, count: 0, depth };
    return nodeIndex;
  }
  build(triangles.map((_, index) => index), 0);
  return { identity: BOUNDED_SEQUENTIAL_REFRACTION_V1.intersectionBackend, nodes, triangles: orderedTriangles, triangleCount: triangles.length, nodeCount: nodes.length, maxDepth: observedDepth, leafSize };
}

function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function addScaled(a, b, scale) { return [a[0] + b[0] * scale, a[1] + b[1] * scale, a[2] + b[2] * scale]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function normalize(value) { const length = Math.hypot(...value); if (!(length > 0)) throw new Error('R4_1_ZERO_LENGTH_VECTOR'); return value.map((item) => item / length); }

function length(value) { return Math.hypot(...value); }
function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(value, amount) { return [value[0] * amount, value[1] * amount, value[2] * amount]; }
function weighted(values, weights) {
  return values.reduce((sum, value, index) => add(sum, scale(value, weights[index])), [0, 0, 0]);
}

function opticalTriangleSource(source, sourceTriangleId) {
  const vertices = (Array.isArray(source) ? source : source.vertices)?.map((value) => [...finiteVector3(value, `optical_triangle_${sourceTriangleId}`)]);
  if (!vertices || vertices.length !== 3) throw new Error('S4_2_OPTICAL_TRIANGLE_SHAPE_INVALID');
  const geometricNormal = normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])));
  const normals = (Array.isArray(source?.normals) && source.normals.length === 3 ? source.normals : [geometricNormal, geometricNormal, geometricNormal])
    .map((value) => normalize(finiteVector3(value, `optical_normal_${sourceTriangleId}`)));
  return { vertices, normals, geometricNormal, sourceTriangleId };
}

function canonicalizeCoincidentOpticalNormals(sources) {
  const coordinates = sources.flatMap((source) => source.vertices);
  const minimum = [Infinity, Infinity, Infinity]; const maximum = [-Infinity, -Infinity, -Infinity];
  for (const position of coordinates) for (let axis = 0; axis < 3; axis += 1) { minimum[axis] = Math.min(minimum[axis], position[axis]); maximum[axis] = Math.max(maximum[axis], position[axis]); }
  const diagonal = length(subtract(maximum, minimum));
  const weldTolerance = Math.max(1e-9, diagonal * 1e-6);
  const positionKey = (position) => position.map((value) => Math.round(value / weldTolerance)).join('|');
  const groups = new Map();
  for (const source of sources) {
    source.vertices.forEach((vertex, index) => {
      const key = positionKey(vertex);
      const entry = groups.get(key) ?? { key, occurrences: [], normalSum: [0, 0, 0], positionSum: [0, 0, 0], minimumPairDot: 1, neighbors: new Set(), boundaryNeighbors: new Set() };
      for (const occurrence of entry.occurrences) entry.minimumPairDot = Math.min(entry.minimumPairDot, dot(source.normals[index], occurrence.normal));
      entry.occurrences.push({ source, index, normal: source.normals[index] });
      entry.normalSum = add(entry.normalSum, source.normals[index]);
      entry.positionSum = add(entry.positionSum, vertex);
      groups.set(key, entry);
    });
  }
  for (const entry of groups.values()) entry.basePosition = scale(entry.positionSum, 1 / entry.occurrences.length);
  const edges = new Map();
  for (const source of sources) {
    const keys = source.vertices.map(positionKey);
    for (const [leftIndex, rightIndex] of [[0, 1], [1, 2], [2, 0]]) {
      const left = keys[leftIndex]; const right = keys[rightIndex]; if (left === right) throw new Error('S4_2_OPTICAL_WELD_DEGENERATE_EDGE');
      groups.get(left).neighbors.add(right); groups.get(right).neighbors.add(left);
      const edgeKey = left < right ? `${left}::${right}` : `${right}::${left}`;
      const edge = edges.get(edgeKey) ?? { left, right, count: 0 }; edge.count += 1; edges.set(edgeKey, edge);
    }
  }
  for (const edge of edges.values()) {
    if (edge.count > 2) throw new Error('S4_2_OPTICAL_WELD_NON_MANIFOLD_EDGE');
    if (edge.count === 1) { groups.get(edge.left).boundaryNeighbors.add(edge.right); groups.get(edge.right).boundaryNeighbors.add(edge.left); }
  }
  let weldedPositionCount = 0; let maximumNormalDisagreementDegrees = 0; let maximumVertexSmoothingRatioObserved = 0;
  for (const entry of groups.values()) {
    const canonicalNormal = normalize(entry.normalSum);
    const neighborEntries = [...entry.neighbors].map((key) => groups.get(key));
    const boundaryEntries = [...entry.boundaryNeighbors].map((key) => groups.get(key));
    let smoothTarget = entry.basePosition;
    if (boundaryEntries.length === 2) smoothTarget = add(scale(entry.basePosition, 0.75), scale(add(boundaryEntries[0].basePosition, boundaryEntries[1].basePosition), 0.125));
    else if (boundaryEntries.length > 0) throw new Error('S4_2_OPTICAL_WELD_BOUNDARY_TOPOLOGY_AMBIGUOUS');
    else if (neighborEntries.length >= 3) {
      const beta = neighborEntries.length === 3 ? 3 / 16 : 3 / (8 * neighborEntries.length);
      smoothTarget = add(scale(entry.basePosition, 1 - neighborEntries.length * beta), scale(neighborEntries.reduce((sum, neighbor) => add(sum, neighbor.basePosition), [0, 0, 0]), beta));
    }
    const minimumNeighborDistance = neighborEntries.reduce((minimumValue, neighbor) => Math.min(minimumValue, length(subtract(neighbor.basePosition, entry.basePosition))), Infinity);
    const rawDisplacement = scale(subtract(smoothTarget, entry.basePosition), S4_2_LIMITS.vertexSmoothingStrength);
    const maximumDisplacement = Number.isFinite(minimumNeighborDistance) ? minimumNeighborDistance * S4_2_LIMITS.maximumVertexSmoothingRatio : 0;
    const rawLength = length(rawDisplacement);
    const boundedDisplacement = rawLength > maximumDisplacement && rawLength > 0 ? scale(rawDisplacement, maximumDisplacement / rawLength) : rawDisplacement;
    const canonicalPosition = add(entry.basePosition, boundedDisplacement);
    if (minimumNeighborDistance > 0 && Number.isFinite(minimumNeighborDistance)) maximumVertexSmoothingRatioObserved = Math.max(maximumVertexSmoothingRatioObserved, length(boundedDisplacement) / minimumNeighborDistance);
    for (const occurrence of entry.occurrences) { occurrence.source.normals[occurrence.index] = canonicalNormal; occurrence.source.vertices[occurrence.index] = canonicalPosition; }
    if (entry.occurrences.length > 1) weldedPositionCount += 1;
    maximumNormalDisagreementDegrees = Math.max(maximumNormalDisagreementDegrees, Math.acos(Math.max(-1, Math.min(1, entry.minimumPairDot))) * 180 / Math.PI);
  }
  for (const source of sources) source.geometricNormal = normalize(cross(subtract(source.vertices[1], source.vertices[0]), subtract(source.vertices[2], source.vertices[0])));
  return { positionGroupCount: groups.size, weldedPositionCount, maximumNormalDisagreementDegrees, weldTolerance, weldPolicy: 'OBJECT_SPACE_BOUNDING_DIAGONAL_TIMES_1E_MINUS_6', vertexSmoothingMode: 'DISABLED_AFTER_GENERIC_BANDING_REGRESSION', vertexSmoothingStrength: S4_2_LIMITS.vertexSmoothingStrength, maximumVertexSmoothingRatio: S4_2_LIMITS.maximumVertexSmoothingRatio, maximumVertexSmoothingRatioObserved };
}

function projectedOpticalVertex(source, weights, projectionStrength, maximumProjectionRatio) {
  const linear = weighted(source.vertices, weights);
  const tangentProjections = source.vertices.map((vertex, index) => {
    const normal = source.normals[index];
    return subtract(linear, scale(normal, dot(subtract(linear, vertex), normal)));
  });
  const tangentTarget = weighted(tangentProjections, weights);
  const projected = addScaled(linear, subtract(tangentTarget, linear), projectionStrength);
  const displacement = subtract(projected, linear);
  const maximumEdge = Math.max(
    length(subtract(source.vertices[1], source.vertices[0])),
    length(subtract(source.vertices[2], source.vertices[1])),
    length(subtract(source.vertices[0], source.vertices[2])),
  );
  const limit = maximumEdge * maximumProjectionRatio;
  const displacementLength = length(displacement);
  const position = displacementLength > limit ? addScaled(linear, displacement, limit / displacementLength) : projected;
  const normal = normalize(weighted(source.normals, weights));
  return { position, normal, displacementLength: Math.min(displacementLength, limit), displacementRatio: maximumEdge > 0 ? Math.min(displacementLength, limit) / maximumEdge : 0 };
}

export function buildProjectedOpticalMicroMesh(sourceTriangles, options = {}) {
  const subdivisionLevel = options.subdivisionLevel ?? CONTINUOUS_OPTICAL_SURFACE_V1.defaultSubdivisionLevel;
  const projectionStrength = options.projectionStrength ?? S4_2_LIMITS.projectionStrength;
  const maximumProjectionRatio = options.maximumProjectionRatio ?? S4_2_LIMITS.maximumProjectionRatio;
  if (!Array.isArray(sourceTriangles) || sourceTriangles.length === 0) throw new Error('S4_2_OPTICAL_SURFACE_REQUIRES_TRIANGLES');
  if (!Number.isInteger(subdivisionLevel) || subdivisionLevel < 0 || subdivisionLevel > S4_2_LIMITS.maximumSubdivisionLevel) throw new Error('S4_2_SUBDIVISION_LEVEL_OUTSIDE_BOUNDED_RANGE');
  if (!Number.isFinite(projectionStrength) || projectionStrength <= 0 || projectionStrength > 1) throw new Error('S4_2_PROJECTION_STRENGTH_OUTSIDE_BOUNDED_RANGE');
  if (!Number.isFinite(maximumProjectionRatio) || maximumProjectionRatio <= 0 || maximumProjectionRatio > S4_2_LIMITS.maximumProjectionRatio) throw new Error('S4_2_PROJECTION_RATIO_OUTSIDE_BOUNDED_RANGE');
  const divisions = 2 ** subdivisionLevel;
  const predictedTriangleCount = sourceTriangles.length * divisions * divisions;
  if (predictedTriangleCount > S4_2_LIMITS.maxOpticalTriangles) throw new Error('S4_2_OPTICAL_TRIANGLE_LIMIT_EXCEEDED');
  const sources = sourceTriangles.map((source, sourceTriangleId) => opticalTriangleSource(source, sourceTriangleId));
  const coincidentNormalAuthority = canonicalizeCoincidentOpticalNormals(sources);
  const triangles = [];
  let maximumDisplacementRatioObserved = 0;
  let orientationCorrections = 0;
  const emit = (source, samples) => {
    const vertices = samples.map((sample) => sample.position);
    const normals = samples.map((sample) => sample.normal);
    const generatedNormal = normalize(cross(subtract(vertices[1], vertices[0]), subtract(vertices[2], vertices[0])));
    if (dot(generatedNormal, source.geometricNormal) < 0) {
      [vertices[1], vertices[2]] = [vertices[2], vertices[1]];
      [normals[1], normals[2]] = [normals[2], normals[1]];
      orientationCorrections += 1;
    }
    for (const sample of samples) maximumDisplacementRatioObserved = Math.max(maximumDisplacementRatioObserved, sample.displacementRatio);
    triangles.push({ vertices, normals, sourceTriangleId: source.sourceTriangleId });
  };
  for (let sourceTriangleId = 0; sourceTriangleId < sources.length; sourceTriangleId += 1) {
    const source = sources[sourceTriangleId];
    const sample = (i, j) => projectedOpticalVertex(source, [1 - ((i + j) / divisions), i / divisions, j / divisions], projectionStrength, maximumProjectionRatio);
    for (let i = 0; i < divisions; i += 1) {
      for (let j = 0; j < divisions - i; j += 1) {
        const a = sample(i, j); const b = sample(i + 1, j); const c = sample(i, j + 1);
        emit(source, [a, b, c]);
        if (i + j < divisions - 1) emit(source, [b, sample(i + 1, j + 1), c]);
      }
    }
  }
  if (triangles.length !== predictedTriangleCount) throw new Error('S4_2_OPTICAL_TRIANGLE_COUNT_INVARIANT_FAILED');
  return {
    mode: CONTINUOUS_OPTICAL_SURFACE_V1.opticalSurfaceMode,
    subdivisionLevel,
    divisions,
    sourceTriangleCount: sourceTriangles.length,
    opticalTriangleCount: triangles.length,
    maximumProjectionRatio,
    projectionStrength,
    maximumDisplacementRatioObserved,
    orientationCorrections,
    coincidentNormalAuthority,
    normalAuthority: 'BOUNDED_COINCIDENT_POSITION_WELDED_OPTICAL_NORMALS',
    topologyPolicy: 'BOUNDED_POSITION_NORMAL_WELD_THEN_PER_SOURCE_TRIANGLE_SUBDIVISION_NO_CROSS_FACE_BRIDGING',
    triangles,
  };
}

function opticalSurfaceFloatData(triangles) {
  const data = new Float32Array(triangles.length * 18);
  let offset = 0;
  for (const triangle of triangles) {
    for (const vertex of triangle.vertices) for (const value of vertex) data[offset++] = value;
    for (const normal of triangle.normals) for (const value of normal) data[offset++] = value;
  }
  return data;
}

async function sha256Hex(data) {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function intersectTriangle(origin, direction, triangle, epsilon = 1e-9) {
  const [a, b, c] = triangle.vertices ?? triangle;
  const edge1 = subtract(b, a); const edge2 = subtract(c, a); const p = cross(direction, edge2);
  const determinant = dot(edge1, p); if (Math.abs(determinant) <= epsilon) return null;
  const inverse = 1 / determinant; const tvec = subtract(origin, a); const u = dot(tvec, p) * inverse;
  if (u < 0 || u > 1) return null;
  const q = cross(tvec, edge1); const v = dot(direction, q) * inverse;
  if (v < 0 || u + v > 1) return null;
  const distance = dot(edge2, q) * inverse; if (distance <= epsilon) return null;
  return { distance, position: addScaled(origin, direction, distance), normal: normalize(cross(edge1, edge2)), triangleId: triangle.id ?? null };
}

function intersectsBounds(origin, inverseDirection, min, max, limit) {
  let near = 0; let far = limit;
  for (let axis = 0; axis < 3; axis += 1) {
    const a = (min[axis] - origin[axis]) * inverseDirection[axis]; const b = (max[axis] - origin[axis]) * inverseDirection[axis];
    near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b)); if (far < near) return false;
  }
  return true;
}

export function intersectBvh(origin, direction, bvh, epsilon = 1e-9) {
  const inverseDirection = direction.map((item) => Math.abs(item) < 1e-15 ? Math.sign(item || 1) * 1e15 : 1 / item);
  const stack = [0]; let nearest = null;
  while (stack.length) {
    const node = bvh.nodes[stack.pop()];
    if (!intersectsBounds(origin, inverseDirection, node.min, node.max, nearest?.distance ?? Infinity)) continue;
    if (node.count > 0) {
      for (let index = node.offset; index < node.offset + node.count; index += 1) {
        const hit = intersectTriangle(origin, direction, bvh.triangles[index], epsilon);
        if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit;
      }
    } else stack.push(node.right, node.left);
  }
  return nearest;
}

export function intersectBruteForce(origin, direction, triangles, epsilon = 1e-9) {
  let nearest = null;
  for (const triangle of triangles) { const hit = intersectTriangle(origin, direction, triangle, epsilon); if (hit && (!nearest || hit.distance < nearest.distance)) nearest = hit; }
  return nearest;
}

export function snellDirection(incident, boundaryNormal, n1, n2) {
  const i = normalize(incident); let n = normalize(boundaryNormal); if (dot(i, n) > 0) n = n.map((item) => -item);
  const eta = n1 / n2; const cosI = -dot(n, i); const k = 1 - eta * eta * (1 - cosI * cosI);
  if (k < 0) { const reflected = subtract(i, n.map((item) => 2 * dot(i, n) * item)); return { tir: true, direction: normalize(reflected) }; }
  return { tir: false, direction: normalize(addScaled(i.map((item) => eta * item), n, eta * cosI - Math.sqrt(k))) };
}

export function segmentAttenuation(attenuationColor, attenuationDistance, gemstoneDistance) {
  finiteVector3(attenuationColor, 'attenuationColor');
  if (!(attenuationDistance > 0) && attenuationDistance !== Infinity) throw new Error('R4_1_ATTENUATION_DISTANCE_INVALID');
  if (!Number.isFinite(gemstoneDistance) || gemstoneDistance < 0) throw new Error('R4_1_GEMSTONE_DISTANCE_INVALID');
  if (attenuationDistance === Infinity) return [1, 1, 1];
  return attenuationColor.map((channel) => Math.exp((Math.log(Math.max(channel, 1e-6)) / attenuationDistance) * gemstoneDistance));
}

export function traceBoundedSequentialRay({ origin, direction, bvh, ior = 1.5, maxInterfaces = 4, epsilon = 1e-6 }) {
  if (maxInterfaces !== 4) throw new Error('R4_1_MAX_INTERFACES_MUST_EQUAL_4');
  let rayOrigin = [...origin]; let rayDirection = normalize(direction); let medium = 'OUTSIDE_OR_CAVITY_AIR';
  let gemstoneDistance = 0; let airDistance = 0; const interfaces = []; let terminationReason = 'MAX_INTERFACES_REACHED';
  for (let index = 0; index < maxInterfaces; index += 1) {
    const hit = intersectBvh(rayOrigin, rayDirection, bvh, epsilon * 0.25);
    if (!hit) { terminationReason = 'ENVIRONMENT_ESCAPE'; break; }
    const segmentMedium = medium;
    if (segmentMedium === 'GEMSTONE') gemstoneDistance += hit.distance; else airDistance += hit.distance;
    const entering = dot(rayDirection, hit.normal) < 0; const n1 = medium === 'GEMSTONE' ? ior : 1;
    const nextMedium = medium === 'GEMSTONE' ? 'OUTSIDE_OR_CAVITY_AIR' : 'GEMSTONE'; const n2 = nextMedium === 'GEMSTONE' ? ior : 1;
    const optical = snellDirection(rayDirection, hit.normal, n1, n2);
    interfaces.push({ index: index + 1, triangleId: hit.triangleId, position: hit.position, normal: hit.normal, mediumIn: medium, mediumOut: optical.tir ? medium : nextMedium, n1, n2, segmentLength: hit.distance, segmentMedium, entering, tir: optical.tir });
    rayDirection = optical.direction; if (!optical.tir) medium = nextMedium; rayOrigin = addScaled(hit.position, rayDirection, epsilon);
  }
  return { interfaces, interfacesUsed: interfaces.length, maxInterfaces, terminationReason, finalMedium: medium, outgoingDirection: rayDirection, gemstoneDistance, airDistance };
}

export function collectCandidateTriangles(candidate) {
  candidate.updateMatrixWorld(true); const rootInverse = candidate.matrixWorld.clone().invert(); const triangles = []; const sourceMeshes = [];
  candidate.traverse((object) => {
    if (!object.isMesh || !object.geometry?.attributes?.position) return;
    const position = object.geometry.attributes.position; const index = object.geometry.index; const toRoot = rootInverse.clone().multiply(object.matrixWorld);
    const normal = object.geometry.attributes.normal; const normalMatrix = new THREE.Matrix3().getNormalMatrix(toRoot);
    const read = (vertexIndex) => new THREE.Vector3().fromBufferAttribute(position, vertexIndex).applyMatrix4(toRoot).toArray();
    const readNormal = (vertexIndex) => normal ? new THREE.Vector3().fromBufferAttribute(normal, vertexIndex).applyNormalMatrix(normalMatrix).normalize().toArray() : null;
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const a = index ? index.getX(triangle * 3) : triangle * 3; const b = index ? index.getX(triangle * 3 + 1) : triangle * 3 + 1; const c = index ? index.getX(triangle * 3 + 2) : triangle * 3 + 2;
      const vertices = [read(a), read(b), read(c)]; const normals = [readNormal(a), readNormal(b), readNormal(c)];
      triangles.push(normals.every(Boolean) ? { vertices, normals } : vertices);
    }
    sourceMeshes.push({ name: object.name || null, triangles: triangleCount, indexed: Boolean(index) });
  });
  if (triangles.length === 0) throw new Error('SEQUENTIAL_V1_CANDIDATE_HAS_NO_TRIANGLES');
  return { triangles, sourceMeshes };
}

function textureDimensions(texelCount) { const width = Math.min(1024, Math.max(1, 2 ** Math.ceil(Math.log2(Math.min(1024, texelCount))))); return { width, height: Math.ceil(texelCount / width) }; }
function floatTexture(texels) {
  const dimensions = textureDimensions(texels.length); const data = new Float32Array(dimensions.width * dimensions.height * 4);
  texels.forEach((value, index) => data.set(value, index * 4));
  const texture = new THREE.DataTexture(data, dimensions.width, dimensions.height, THREE.RGBAFormat, THREE.FloatType);
  texture.minFilter = THREE.NearestFilter; texture.magFilter = THREE.NearestFilter; texture.generateMipmaps = false; texture.needsUpdate = true;
  return { texture, ...dimensions };
}
function packBvh(bvh) {
  const nodeTexels = [];
  for (const node of bvh.nodes) { nodeTexels.push([node.min[0], node.min[1], node.min[2], node.count > 0 ? -(node.offset + 1) : node.left]); nodeTexels.push([node.max[0], node.max[1], node.max[2], node.count > 0 ? node.count : node.right]); }
  const triangleTexels = []; for (const triangle of bvh.triangles) { for (const vertex of triangle.vertices) triangleTexels.push([...vertex, triangle.id]); for (const normal of triangle.normals) triangleTexels.push([...normal, 0]); }
  return { nodes: floatTexture(nodeTexels), triangles: floatTexture(triangleTexels) };
}

const SEQUENTIAL_GLSL = `
uniform sampler2D r41NodeTexture; uniform sampler2D r41TriangleTexture; uniform vec2 r41NodeTextureSize; uniform vec2 r41TriangleTextureSize;
uniform mat4 r41RootWorldMatrix; uniform mat4 r41RootWorldInverse; uniform float r41WorldScale; uniform float r41Epsilon; uniform float r41ResolveDistance;
vec4 r41Fetch(sampler2D map, vec2 size, int index) { float f=float(index); vec2 pixel=vec2(mod(f,size.x),floor(f/size.x)); return texture2D(map,(pixel+0.5)/size); }
bool r41Bounds(vec3 origin, vec3 inverseDirection, vec3 minimum, vec3 maximum, float limit) { vec3 t0=(minimum-origin)*inverseDirection; vec3 t1=(maximum-origin)*inverseDirection; vec3 lo=min(t0,t1); vec3 hi=max(t0,t1); float nearDistance=max(max(lo.x,lo.y),max(lo.z,0.0)); float farDistance=min(min(hi.x,hi.y),hi.z); return farDistance>=nearDistance&&nearDistance<limit; }
bool r41Triangle(vec3 origin, vec3 direction, int triangleIndex, out float distance, out vec3 normal) { int base=triangleIndex*6; vec3 a=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base).xyz; vec3 b=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base+1).xyz; vec3 c=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base+2).xyz; vec3 e1=b-a; vec3 e2=c-a; vec3 p=cross(direction,e2); float d=dot(e1,p); if(abs(d)<1e-8)return false; float inv=1.0/d; vec3 t=origin-a; float u=dot(t,p)*inv; const float edgeTolerance=1e-5; if(u< -edgeTolerance||u>1.0+edgeTolerance)return false; vec3 q=cross(t,e1); float v=dot(direction,q)*inv; if(v< -edgeTolerance||u+v>1.0+edgeTolerance)return false; distance=dot(e2,q)*inv; if(distance<=r41Epsilon*0.25)return false; vec3 geometric=normalize(cross(e1,e2)); vec3 n0=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base+3).xyz; vec3 n1=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base+4).xyz; vec3 n2=r41Fetch(r41TriangleTexture,r41TriangleTextureSize,base+5).xyz; vec3 smoothNormal=normalize(n0*(1.0-u-v)+n1*u+n2*v); if(dot(smoothNormal,geometric)<0.0)smoothNormal=-smoothNormal; normal=dot(smoothNormal,geometric)>0.2?smoothNormal:geometric; return true; }
bool r41Nearest(vec3 origin, vec3 direction, out float nearestDistance, out vec3 nearestNormal) { int stack[32]; int stackSize=1; stack[0]=0; nearestDistance=1e20; bool found=false; vec3 inverseDirection=1.0/max(abs(direction),vec3(1e-10))*sign(direction+vec3(1e-20)); for(int iteration=0;iteration<256;iteration++){ if(stackSize<=0)break; int nodeIndex=stack[--stackSize]; vec4 lower=r41Fetch(r41NodeTexture,r41NodeTextureSize,nodeIndex*2); vec4 upper=r41Fetch(r41NodeTexture,r41NodeTextureSize,nodeIndex*2+1); if(!r41Bounds(origin,inverseDirection,lower.xyz,upper.xyz,nearestDistance))continue; if(lower.w<0.0){ int offset=int(-lower.w-1.0+0.5); int count=int(upper.w+0.5); for(int leaf=0;leaf<8;leaf++){if(leaf>=count)break; float distance; vec3 normal; if(r41Triangle(origin,direction,offset+leaf,distance,normal)&&distance<nearestDistance){found=true;nearestDistance=distance;nearestNormal=normal;}} } else {if(stackSize>29)return false; stack[stackSize++]=int(upper.w+0.5);stack[stackSize++]=int(lower.w+0.5);} } return found; }
vec3 r41SequentialDirection(vec3 entryWorld,vec3 entryNormalWorld,float iorValue,out vec3 exitWorld,out float gemstoneDistanceWorld,out float interfaceCount,out float terminationCode){ vec3 origin=(r41RootWorldInverse*vec4(entryWorld,1.0)).xyz; vec3 direction=normalize(mat3(r41RootWorldInverse)*normalize(entryWorld-cameraPosition)); vec3 normal=normalize(mat3(r41RootWorldInverse)*entryNormalWorld); vec3 oriented=dot(direction,normal)<0.0?normal:-normal; vec3 initial=refract(direction,oriented,1.0/iorValue); interfaceCount=1.0; gemstoneDistanceWorld=0.0; terminationCode=0.0; bool gemstone=true; if(dot(initial,initial)<1e-12){direction=reflect(direction,oriented);gemstone=false;terminationCode=2.0;}else{direction=normalize(initial);} origin+=direction*r41Epsilon; for(int step=1;step<4;step++){float distance;vec3 geometricNormal;if(!r41Nearest(origin,direction,distance,geometricNormal)){terminationCode=1.0;break;}if(gemstone)gemstoneDistanceWorld+=distance*r41WorldScale;origin+=direction*distance;vec3 boundaryNormal=dot(direction,geometricNormal)<0.0?geometricNormal:-geometricNormal;float n1=gemstone?iorValue:1.0;float n2=gemstone?1.0:iorValue;vec3 transmittedDirection=refract(direction,boundaryNormal,n1/n2);interfaceCount+=1.0;if(dot(transmittedDirection,transmittedDirection)<1e-12){direction=normalize(reflect(direction,boundaryNormal));terminationCode=2.0;}else{direction=normalize(transmittedDirection);gemstone=!gemstone;}origin+=direction*r41Epsilon;} exitWorld=(r41RootWorldMatrix*vec4(origin,1.0)).xyz; return normalize(mat3(r41RootWorldMatrix)*direction); }
`;

function replaceTransmissionPars(source) {
  const legacy = THREE.ShaderChunk.transmission_pars_fragment.replace('vec4 getIBLVolumeRefraction(', 'vec4 r41LegacyGetIBLVolumeRefraction(');
  const custom = `vec4 getIBLVolumeRefraction(const in vec3 n,const in vec3 v,const in float roughness,const in vec3 diffuseColor,const in vec3 specularColor,const in float specularF90,const in vec3 position,const in mat4 modelMatrix,const in mat4 viewMatrix,const in mat4 projMatrix,const in float dispersion,const in float ior,const in float thickness,const in vec3 attenuationColor,const in float attenuationDistance){float gemstoneDistance;float interfaceCount;float terminationCode;vec3 exitWorld;vec3 outgoingWorld=r41SequentialDirection(position,n,ior,exitWorld,gemstoneDistance,interfaceCount,terminationCode);vec3 targetWorld=exitWorld+outgoingWorld*r41ResolveDistance;vec4 clip=projMatrix*viewMatrix*vec4(targetWorld,1.0);vec2 uv=clamp((clip.xy/clip.w)*0.5+0.5,vec2(0.001),vec2(0.999));vec4 transmittedLight=getTransmissionSample(uv,roughness,ior);vec3 transmittance=diffuseColor*volumeAttenuation(gemstoneDistance,attenuationColor,attenuationDistance);vec3 F=EnvironmentBRDF(n,v,specularColor,specularF90,roughness);float factor=(transmittance.r+transmittance.g+transmittance.b)/3.0;return vec4((1.0-F)*transmittance*transmittedLight.rgb,1.0-(1.0-transmittedLight.a)*factor);}`;
  return source.replace('#include <transmission_pars_fragment>', `${legacy}\n${SEQUENTIAL_GLSL}\n${custom}`);
}

function transmissiveMaterials(root) { const materials = new Set(); root.traverse((object) => { if (!object.isMesh) return; const list = Array.isArray(object.material) ? object.material : [object.material]; for (const material of list) if (material?.isMeshPhysicalMaterial && material.transmission > 0) materials.add(material); }); return [...materials]; }
function uniformRootScale(candidate) { const scale = new THREE.Vector3(); candidate.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale); const maximum = Math.max(scale.x, scale.y, scale.z); const minimum = Math.min(scale.x, scale.y, scale.z); if (!(minimum > 0) || maximum / minimum > 1.000001) throw new Error('SEQUENTIAL_V1_NONUNIFORM_ROOT_SCALE_UNSUPPORTED'); return (scale.x + scale.y + scale.z) / 3; }

export function createBoundedSequentialRefraction({ renderer, candidate, maxInterfaces = 4, opticalSurfaceMode = 'VISUAL_TRIANGLE_MESH', opticalSurfaceLevel = 0 }) {
  if (!renderer.capabilities.isWebGL2) throw new Error('SEQUENTIAL_V1_REQUIRES_WEBGL2');
  if (maxInterfaces !== 4) throw new Error('SEQUENTIAL_V1_MAX_INTERFACES_MUST_EQUAL_4');
  const s42OpticalSurface = opticalSurfaceMode === CONTINUOUS_OPTICAL_SURFACE_V1.opticalSurfaceMode;
  const s43OpticalSurface = opticalSurfaceMode === LOOP_LIMIT_OPTICAL_SURFACE_V1.opticalSurfaceMode;
  const separateOpticalSurface = s42OpticalSurface || s43OpticalSurface;
  if (!separateOpticalSurface && opticalSurfaceMode !== 'VISUAL_TRIANGLE_MESH') throw new Error('SEQUENTIAL_OPTICAL_SURFACE_MODE_UNSUPPORTED');
  if (!separateOpticalSurface && opticalSurfaceLevel !== 0) throw new Error('SEQUENTIAL_VISUAL_TRIANGLE_MODE_REQUIRES_LEVEL_ZERO');
  const started = performance.now();
  const extractionStarted = performance.now(); const extracted = collectCandidateTriangles(candidate); const extractionMs = performance.now() - extractionStarted;
  const opticalSurfaceStarted = performance.now();
  const opticalSurface = s42OpticalSurface
    ? buildProjectedOpticalMicroMesh(extracted.triangles, { subdivisionLevel: opticalSurfaceLevel })
    : s43OpticalSurface
      ? buildLoopLimitOpticalSurface(extracted.triangles, { refinementLevel: opticalSurfaceLevel })
      : { mode: 'VISUAL_TRIANGLE_MESH', subdivisionLevel: 0, divisions: 1, sourceTriangleCount: extracted.triangles.length, opticalTriangleCount: extracted.triangles.length, projectionStrength: 0, maximumProjectionRatio: 0, maximumDisplacementRatioObserved: 0, orientationCorrections: 0, coincidentNormalAuthority: null, normalAuthority: 'SOURCE_VERTEX_NORMALS', topologyPolicy: 'SOURCE_VISUAL_TRIANGLES', triangles: extracted.triangles };
  const opticalSurfacePreprocessingMs = performance.now() - opticalSurfaceStarted;
  const bvhStarted = performance.now(); const bvh = buildBoundedBvh(opticalSurface.triangles, { maxTriangles: separateOpticalSurface ? S4_2_LIMITS.maxOpticalTriangles : R4_1_LIMITS.maxTriangles }); const bvhBuildMs = performance.now() - bvhStarted;
  if (bvh.nodeCount > R4_1_LIMITS.maxNodes) throw new Error('SEQUENTIAL_BVH_NODE_LIMIT_EXCEEDED');
  const packed = packBvh(bvh);
  const opticalSurfaceSha256Promise = separateOpticalSurface ? sha256Hex(opticalSurfaceFloatData(opticalSurface.triangles)) : Promise.resolve(null);
  const sourceTopologySha256Promise = opticalSurface.sourceTopologySha256Promise ?? Promise.resolve(null);
  const opticalSurfaceDerivationSha256Promise = opticalSurface.derivationSha256Promise ?? Promise.resolve(null);
  const bounds = new THREE.Box3().setFromObject(candidate); const sphere = bounds.getBoundingSphere(new THREE.Sphere()); const scale = uniformRootScale(candidate);
  const epsilon = Math.max(1e-7, (sphere.radius / scale) * EPSILON_SCALE); const materials = transmissiveMaterials(candidate);
  if (materials.length === 0) throw new Error('SEQUENTIAL_V1_REQUIRES_TRANSMISSIVE_PHYSICAL_MATERIAL');
  const rootWorldMatrix = candidate.matrixWorld.clone(); const rootWorldInverse = rootWorldMatrix.clone().invert(); const augmented = [];
  for (const material of materials) {
    const previousCompile = material.onBeforeCompile; const previousKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderObject) => {
      previousCompile?.call(material, shader, renderObject);
      Object.assign(shader.uniforms, { r41NodeTexture:{value:packed.nodes.texture}, r41TriangleTexture:{value:packed.triangles.texture}, r41NodeTextureSize:{value:new THREE.Vector2(packed.nodes.width,packed.nodes.height)}, r41TriangleTextureSize:{value:new THREE.Vector2(packed.triangles.width,packed.triangles.height)}, r41RootWorldMatrix:{value:rootWorldMatrix}, r41RootWorldInverse:{value:rootWorldInverse}, r41WorldScale:{value:scale}, r41Epsilon:{value:epsilon}, r41ResolveDistance:{value:sphere.radius*4} });
      shader.fragmentShader = replaceTransmissionPars(shader.fragmentShader);
    };
    const modeKey = s42OpticalSurface ? `SEQUENTIAL_OPTICAL_SURFACE_V1_L${opticalSurfaceLevel}` : s43OpticalSurface ? `SEQUENTIAL_LOOP_LIMIT_SURFACE_V1_L${opticalSurfaceLevel}` : 'SEQUENTIAL_V1';
    material.customProgramCacheKey = () => `${previousKey?.call(material) ?? ''}|${modeKey}|${bvh.triangleCount}|${bvh.nodeCount}`; material.needsUpdate = true;
    augmented.push({ material, previousCompile, previousKey });
  }
  const identity = s42OpticalSurface ? CONTINUOUS_OPTICAL_SURFACE_V1 : s43OpticalSurface ? LOOP_LIMIT_OPTICAL_SURFACE_V1 : BOUNDED_SEQUENTIAL_REFRACTION_V1;
  return { identity, triangleCount:bvh.triangleCount, visualTriangleCount:extracted.triangles.length, nodeCount:bvh.nodeCount, bvhDepth:bvh.maxDepth, leafSize:bvh.leafSize, sourceMeshes:extracted.sourceMeshes, materialCount:materials.length, worldScale:scale, epsilon, preprocessingMs:performance.now()-started, extractionMs, opticalSurfacePreprocessingMs, bvhBuildMs, opticalSurfaceMode:opticalSurface.mode, opticalSurfaceVersion:opticalSurface.surfaceVersion ?? identity.algorithmVersion, opticalSurfaceLevel:opticalSurface.subdivisionLevel, opticalSurfaceDivisions:opticalSurface.divisions, opticalSurfaceProjectionStrength:opticalSurface.projectionStrength, opticalSurfaceMaximumProjectionRatio:opticalSurface.maximumProjectionRatio, opticalSurfaceMaximumDisplacementRatioObserved:opticalSurface.maximumDisplacementRatioObserved, opticalSurfaceOrientationCorrections:opticalSurface.orientationCorrections, opticalSurfaceCoincidentNormalAuthority:opticalSurface.coincidentNormalAuthority, opticalSurfaceNormalAuthority:opticalSurface.normalAuthority, opticalSurfaceTopologyPolicy:opticalSurface.topologyPolicy, opticalSurfaceContinuityClass:opticalSurface.expectedContinuityClass ?? null, opticalIntersectionContinuityClass:opticalSurface.intersectionContinuityClass ?? null, opticalSurfaceDerivationDeterminism:opticalSurface.derivationDeterminism ?? null, opticalSurfaceAdjacency:opticalSurface.adjacency ?? null, opticalSurfaceRefinedAdjacency:opticalSurface.refinedAdjacency ?? null, opticalSurfaceBoundaryPolicy:opticalSurface.boundaryPolicy ?? null, opticalSurfaceExtraordinaryVertexPolicy:opticalSurface.extraordinaryVertexPolicy ?? null, opticalSurfaceProxySemantics:opticalSurface.proxySemantics ?? null, opticalSurfaceSha256Promise, sourceTopologySha256Promise, opticalSurfaceDerivationSha256Promise, gpuResourceBytes:packed.nodes.texture.image.data.byteLength+packed.triangles.texture.image.data.byteLength,
    dispose(){ for(const entry of augmented){entry.material.onBeforeCompile=entry.previousCompile;entry.material.customProgramCacheKey=entry.previousKey;entry.material.needsUpdate=true;} packed.nodes.texture.dispose();packed.triangles.texture.dispose(); } };
}
