const MAX_SOURCE_TRIANGLES = 16384;
const MAX_OPTICAL_TRIANGLES = 65536;
const MAX_REFINEMENT_LEVEL = 2;

export const LOOP_LIMIT_OPTICAL_SURFACE_V1 = Object.freeze({
  mode: 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1',
  opticalSurfaceMode: 'LOOP_SUBDIVISION_LIMIT_ENVELOPE_V1',
  algorithmVersion: 'BOUNDED_LOOP_LIMIT_SURFACE_ENVELOPE_BVH_SEQUENTIAL_REFRACTION_V1',
  surfaceFamily: 'LOOP_SUBDIVISION_LIMIT_SURFACE',
  expectedContinuityClass: 'C2_REGULAR_C1_EXTRAORDINARY_LIMIT_SURFACE',
  intersectionContinuityClass: 'APPROXIMATE_CONTINUOUS_BOUNDED_ENVELOPE_PROXY',
  defaultRefinementLevel: 1,
  maximumRefinementLevel: MAX_REFINEMENT_LEVEL,
  maxInterfaces: 4,
  maxSourceTriangles: MAX_SOURCE_TRIANGLES,
  maxOpticalTriangles: MAX_OPTICAL_TRIANGLES,
  nonManifoldPolicy: 'FAIL_CLOSED',
  boundaryPolicy: 'LOOP_CUBIC_BSPLINE_BOUNDARY_RULE_NO_CROSS_BOUNDARY_SMOOTHING',
  featurePolicy: 'TOPOLOGY_DERIVED_BOUNDARIES_ONLY_NO_CASE_TAGS',
  maturity: 'EXPERIMENTAL_R_AND_D',
});

function add(a, b) { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function subtract(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(value, amount) { return [value[0] * amount, value[1] * amount, value[2] * amount]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function length(value) { return Math.hypot(...value); }
function normalize(value) { const magnitude = length(value); if (!(magnitude > 1e-15)) throw new Error('S4_3_ZERO_LENGTH_VECTOR'); return scale(value, 1 / magnitude); }
function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

function finiteVertex(value, label) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((component) => !Number.isFinite(component))) throw new Error(`${label}_MUST_BE_FINITE_VECTOR3`);
  return [...value];
}

function loopBeta(valence) {
  if (!Number.isInteger(valence) || valence < 3) throw new Error('S4_3_LOOP_INTERIOR_VALENCE_INVALID');
  const inner = 3 / 8 + Math.cos((2 * Math.PI) / valence) / 4;
  return (5 / 8 - inner * inner) / valence;
}

function canonicalControlMesh(sourceTriangles) {
  if (!Array.isArray(sourceTriangles) || sourceTriangles.length === 0) throw new Error('S4_3_LOOP_SURFACE_REQUIRES_TRIANGLES');
  if (sourceTriangles.length > MAX_SOURCE_TRIANGLES) throw new Error('S4_3_LOOP_SOURCE_TRIANGLE_LIMIT_EXCEEDED');
  const rawTriangles = sourceTriangles.map((source, triangleIndex) => {
    const vertices = (Array.isArray(source) ? source : source.vertices)?.map((value, corner) => finiteVertex(value, `S4_3_TRIANGLE_${triangleIndex}_${corner}`));
    if (!vertices || vertices.length !== 3) throw new Error('S4_3_LOOP_TRIANGLE_SHAPE_INVALID');
    return vertices;
  });
  const all = rawTriangles.flat();
  const minimum = [Infinity, Infinity, Infinity]; const maximum = [-Infinity, -Infinity, -Infinity];
  for (const vertex of all) for (let axis = 0; axis < 3; axis += 1) { minimum[axis] = Math.min(minimum[axis], vertex[axis]); maximum[axis] = Math.max(maximum[axis], vertex[axis]); }
  const diagonal = length(subtract(maximum, minimum));
  const weldTolerance = Math.max(1e-10, diagonal * 1e-7);
  const keyFor = (vertex) => vertex.map((component) => Math.round(component / weldTolerance)).join('|');
  const groups = new Map();
  for (const vertex of all) {
    const key = keyFor(vertex); const group = groups.get(key) ?? { sum: [0, 0, 0], count: 0 };
    group.sum = add(group.sum, vertex); group.count += 1; groups.set(key, group);
  }
  const keys = [...groups.keys()].sort();
  const keyToIndex = new Map(keys.map((key, index) => [key, index]));
  const vertices = keys.map((key) => scale(groups.get(key).sum, 1 / groups.get(key).count));
  const rotateToMinimum = (face) => {
    const minimum = Math.min(...face); const offset = face.indexOf(minimum);
    return [face[offset], face[(offset + 1) % 3], face[(offset + 2) % 3]];
  };
  const faces = rawTriangles
    .map((triangle) => rotateToMinimum(triangle.map((vertex) => keyToIndex.get(keyFor(vertex)))))
    .sort((left, right) => left[0] - right[0] || left[1] - right[1] || left[2] - right[2]);
  for (const face of faces) if (new Set(face).size !== 3) throw new Error('S4_3_LOOP_WELD_CREATED_DEGENERATE_FACE');
  return { vertices, faces, weldTolerance, sourceCornerCount: all.length, weldedVertexCount: all.length - vertices.length };
}

export function analyzeLoopTopology(vertices, faces) {
  const neighbors = vertices.map(() => new Set());
  const boundaryNeighbors = vertices.map(() => new Set());
  const edges = new Map();
  for (let faceIndex = 0; faceIndex < faces.length; faceIndex += 1) {
    const face = faces[faceIndex];
    if (!Array.isArray(face) || face.length !== 3 || face.some((index) => !Number.isInteger(index) || index < 0 || index >= vertices.length)) throw new Error('S4_3_LOOP_FACE_INDEX_INVALID');
    for (const [a, b, opposite] of [[face[0], face[1], face[2]], [face[1], face[2], face[0]], [face[2], face[0], face[1]]]) {
      neighbors[a].add(b); neighbors[b].add(a);
      const key = edgeKey(a, b); const edge = edges.get(key) ?? { key, a: Math.min(a, b), b: Math.max(a, b), uses: [] };
      edge.uses.push({ faceIndex, from: a, to: b, opposite }); edges.set(key, edge);
    }
  }
  let boundaryEdgeCount = 0; let interiorEdgeCount = 0;
  for (const edge of edges.values()) {
    if (edge.uses.length > 2) throw new Error('S4_3_LOOP_NON_MANIFOLD_EDGE_UNSUPPORTED');
    if (edge.uses.length === 1) { boundaryEdgeCount += 1; boundaryNeighbors[edge.a].add(edge.b); boundaryNeighbors[edge.b].add(edge.a); }
    else {
      interiorEdgeCount += 1;
      if (edge.uses[0].from === edge.uses[1].from && edge.uses[0].to === edge.uses[1].to) throw new Error('S4_3_LOOP_INCONSISTENT_WINDING');
    }
  }
  for (let vertex = 0; vertex < vertices.length; vertex += 1) {
    const boundaryValence = boundaryNeighbors[vertex].size;
    if (boundaryValence !== 0 && boundaryValence !== 2) throw new Error('S4_3_LOOP_BOUNDARY_TOPOLOGY_AMBIGUOUS');
    if (boundaryValence === 0 && neighbors[vertex].size < 3) throw new Error('S4_3_LOOP_INTERIOR_VERTEX_VALENCE_INVALID');
  }
  const interiorExtraordinaryVertices = neighbors.reduce((count, set, vertex) => count + (boundaryNeighbors[vertex].size === 0 && set.size !== 6 ? 1 : 0), 0);
  const boundaryVertices = boundaryNeighbors.reduce((count, set) => count + (set.size === 2 ? 1 : 0), 0);
  let connectedComponents = 0; const visited = new Set();
  for (let start = 0; start < vertices.length; start += 1) if (!visited.has(start)) {
    connectedComponents += 1; const pending = [start]; visited.add(start);
    while (pending.length) for (const neighbor of neighbors[pending.pop()]) if (!visited.has(neighbor)) { visited.add(neighbor); pending.push(neighbor); }
  }
  return { edges, neighbors, boundaryNeighbors, interiorEdgeCount, boundaryEdgeCount, boundaryVertices, interiorExtraordinaryVertices, connectedComponents, nonManifoldEdges: 0 };
}

function refineOnce(mesh) {
  const topology = analyzeLoopTopology(mesh.vertices, mesh.faces);
  const even = mesh.vertices.map((vertex, index) => {
    const boundary = [...topology.boundaryNeighbors[index]].sort((a, b) => a - b);
    if (boundary.length === 2) return add(scale(vertex, 3 / 4), scale(add(mesh.vertices[boundary[0]], mesh.vertices[boundary[1]]), 1 / 8));
    const adjacent = [...topology.neighbors[index]].sort((a, b) => a - b); const beta = loopBeta(adjacent.length);
    return add(scale(vertex, 1 - adjacent.length * beta), scale(adjacent.reduce((sum, neighbor) => add(sum, mesh.vertices[neighbor]), [0, 0, 0]), beta));
  });
  const edgeIndices = new Map(); const vertices = [...even];
  for (const edge of [...topology.edges.values()].sort((left, right) => left.key.localeCompare(right.key))) {
    let position;
    if (edge.uses.length === 1) position = scale(add(mesh.vertices[edge.a], mesh.vertices[edge.b]), 1 / 2);
    else {
      const oppositeA = mesh.vertices[edge.uses[0].opposite]; const oppositeB = mesh.vertices[edge.uses[1].opposite];
      position = add(scale(add(mesh.vertices[edge.a], mesh.vertices[edge.b]), 3 / 8), scale(add(oppositeA, oppositeB), 1 / 8));
    }
    edgeIndices.set(edge.key, vertices.length); vertices.push(position);
  }
  const faces = [];
  for (const [a, b, c] of mesh.faces) {
    const ab = edgeIndices.get(edgeKey(a, b)); const bc = edgeIndices.get(edgeKey(b, c)); const ca = edgeIndices.get(edgeKey(c, a));
    faces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
  }
  return { vertices, faces };
}

function triangleRecords(mesh) {
  const normalSums = mesh.vertices.map(() => [0, 0, 0]);
  for (const [a, b, c] of mesh.faces) {
    const normal = cross(subtract(mesh.vertices[b], mesh.vertices[a]), subtract(mesh.vertices[c], mesh.vertices[a]));
    if (!(length(normal) > 1e-15)) throw new Error('S4_3_LOOP_REFINEMENT_DEGENERATE_FACE');
    normalSums[a] = add(normalSums[a], normal); normalSums[b] = add(normalSums[b], normal); normalSums[c] = add(normalSums[c], normal);
  }
  const normals = normalSums.map(normalize);
  return mesh.faces.map((face, sourceTriangleId) => ({ sourceTriangleId, vertices: face.map((index) => [...mesh.vertices[index]]), normals: face.map((index) => [...normals[index]]) }));
}

function floatIdentityData(mesh) {
  const data = new Float64Array(mesh.vertices.length * 3 + mesh.faces.length * 3);
  let offset = 0;
  for (const vertex of mesh.vertices) for (const value of vertex) data[offset++] = value;
  for (const face of mesh.faces) for (const index of face) data[offset++] = index;
  return data;
}

async function sha256(data) {
  const bytes = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function buildLoopLimitOpticalSurface(sourceTriangles, options = {}) {
  const refinementLevel = options.refinementLevel ?? LOOP_LIMIT_OPTICAL_SURFACE_V1.defaultRefinementLevel;
  if (!Number.isInteger(refinementLevel) || refinementLevel < 1 || refinementLevel > MAX_REFINEMENT_LEVEL) throw new Error('S4_3_LOOP_REFINEMENT_LEVEL_OUTSIDE_BOUNDED_RANGE');
  const canonical = canonicalControlMesh(sourceTriangles);
  const sourceTopology = analyzeLoopTopology(canonical.vertices, canonical.faces);
  const predictedTriangles = canonical.faces.length * (4 ** refinementLevel);
  if (predictedTriangles > MAX_OPTICAL_TRIANGLES) throw new Error('S4_3_LOOP_OPTICAL_TRIANGLE_LIMIT_EXCEEDED');
  let mesh = { vertices: canonical.vertices, faces: canonical.faces };
  for (let level = 0; level < refinementLevel; level += 1) mesh = refineOnce(mesh);
  const refinedTopology = analyzeLoopTopology(mesh.vertices, mesh.faces);
  const triangles = triangleRecords(mesh);
  return {
    mode: LOOP_LIMIT_OPTICAL_SURFACE_V1.opticalSurfaceMode,
    surfaceVersion: LOOP_LIMIT_OPTICAL_SURFACE_V1.algorithmVersion,
    subdivisionLevel: refinementLevel,
    refinementLevel,
    divisions: 2 ** refinementLevel,
    sourceTriangleCount: canonical.faces.length,
    opticalTriangleCount: triangles.length,
    sourceVertexCount: canonical.vertices.length,
    opticalVertexCount: mesh.vertices.length,
    sourceTopologySha256Promise: sha256(floatIdentityData({ vertices: canonical.vertices, faces: canonical.faces })),
    derivationSha256Promise: sha256(floatIdentityData(mesh)),
    expectedContinuityClass: LOOP_LIMIT_OPTICAL_SURFACE_V1.expectedContinuityClass,
    intersectionContinuityClass: LOOP_LIMIT_OPTICAL_SURFACE_V1.intersectionContinuityClass,
    derivationDeterminism: 'DETERMINISTIC_SORTED_WELD_EDGE_AND_VERTEX_STENCILS',
    adjacency: {
      interiorEdges: sourceTopology.interiorEdgeCount,
      boundaryEdges: sourceTopology.boundaryEdgeCount,
      boundaryVertices: sourceTopology.boundaryVertices,
      extraordinaryVertices: sourceTopology.interiorExtraordinaryVertices,
      connectedComponents: sourceTopology.connectedComponents,
      nonManifoldEdges: sourceTopology.nonManifoldEdges,
      weldTolerance: canonical.weldTolerance,
      weldedVertexCount: canonical.weldedVertexCount,
    },
    refinedAdjacency: {
      interiorEdges: refinedTopology.interiorEdgeCount,
      boundaryEdges: refinedTopology.boundaryEdgeCount,
      boundaryVertices: refinedTopology.boundaryVertices,
      extraordinaryVertices: refinedTopology.interiorExtraordinaryVertices,
      connectedComponents: refinedTopology.connectedComponents,
    },
    normalAuthority: 'AREA_WEIGHTED_REFINED_LOOP_CONTROL_NET_OPTICAL_NORMALS',
    topologyPolicy: 'GLOBAL_TOPOLOGY_AWARE_LOOP_STENCILS_PRESERVE_COMPONENTS_GENUS_AND_OPEN_BOUNDARIES',
    boundaryPolicy: LOOP_LIMIT_OPTICAL_SURFACE_V1.boundaryPolicy,
    extraordinaryVertexPolicy: 'LOOP_EIGENSTRUCTURE_C1_LIMIT_EXPECTATION_WITH_BOUNDED_PROXY_ARTIFACT_RISK',
    proxySemantics: 'FINITE_ENVELOPE_APPROXIMATION_OF_LOOP_LIMIT_SURFACE_NOT_MATHEMATICALLY_C1_BY_ITSELF',
    projectionStrength: 0,
    maximumProjectionRatio: 0,
    maximumDisplacementRatioObserved: 0,
    orientationCorrections: 0,
    coincidentNormalAuthority: null,
    triangles,
  };
}

export function measureProxyEdgeNormalVariation(surface) {
  const topology = canonicalControlMesh(surface.triangles);
  const analyzed = analyzeLoopTopology(topology.vertices, topology.faces);
  let maximumDegrees = 0; let samples = 0;
  const faceNormals = topology.faces.map(([a, b, c]) => normalize(cross(subtract(topology.vertices[b], topology.vertices[a]), subtract(topology.vertices[c], topology.vertices[a]))));
  for (const edge of analyzed.edges.values()) if (edge.uses.length === 2) {
    const cosine = Math.max(-1, Math.min(1, dot(faceNormals[edge.uses[0].faceIndex], faceNormals[edge.uses[1].faceIndex])));
    maximumDegrees = Math.max(maximumDegrees, Math.acos(cosine) * 180 / Math.PI); samples += 1;
  }
  return { samples, maximumGeometricNormalAngleDegrees: maximumDegrees };
}
