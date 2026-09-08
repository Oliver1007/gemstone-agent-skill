import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';

const filename = path.resolve(process.argv[2] ?? 'output/yellow-citrine-csg-realistic.glb');
const bytes = fs.readFileSync(filename);
if (bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
  throw new Error('Expected a binary glTF 2.0 file.');
}

let offset = 12;
let json;
let binary;
while (offset < bytes.length) {
  const length = bytes.readUInt32LE(offset);
  const type = bytes.readUInt32LE(offset + 4);
  const data = bytes.subarray(offset + 8, offset + 8 + length);
  if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8').trimEnd());
  if (type === 0x004e4942) binary = data;
  offset += 8 + length;
}
if (!json || !binary) throw new Error('GLB is missing its JSON or BIN chunk.');

const componentInfo = {
  5120: [Int8Array, 1],
  5121: [Uint8Array, 1],
  5122: [Int16Array, 2],
  5123: [Uint16Array, 2],
  5125: [Uint32Array, 4],
  5126: [Float32Array, 4],
};
const componentCounts = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT2: 4, MAT3: 9, MAT4: 16 };

function readAccessor(index) {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const [ArrayType, componentBytes] = componentInfo[accessor.componentType];
  const components = componentCounts[accessor.type];
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const stride = view.byteStride ?? components * componentBytes;
  const result = new Array(accessor.count);
  for (let i = 0; i < accessor.count; i += 1) {
    const item = new Array(components);
    for (let c = 0; c < components; c += 1) {
      const byteOffset = binary.byteOffset + start + i * stride + c * componentBytes;
      item[c] = new ArrayType(binary.buffer, byteOffset, 1)[0];
    }
    result[i] = components === 1 ? item[0] : item;
  }
  return { accessor, values: result };
}

function nodeMatrix(node) {
  if (node.matrix) return new THREE.Matrix4().fromArray(node.matrix);
  return new THREE.Matrix4().compose(
    new THREE.Vector3().fromArray(node.translation ?? [0, 0, 0]),
    new THREE.Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
    new THREE.Vector3().fromArray(node.scale ?? [1, 1, 1]),
  );
}

function auditPrimitive(primitive, worldMatrix) {
  const positions = readAccessor(primitive.attributes.POSITION).values;
  const indices = primitive.indices == null
    ? positions.map((_, index) => index)
    : readAccessor(primitive.indices).values;
  const edges = new Map();
  const triangles = new Set();
  const box = new THREE.Box3();
  let duplicates = 0;
  let zeroArea = 0;
  let outerOutward = 0;
  let outerInward = 0;
  let cavityInward = 0;
  let cavityOutward = 0;
  let axial = 0;
  const radialSamples = [];
  const topRadii = [];
  const bottomRadii = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const faceNormal = new THREE.Vector3();
  const centroid = new THREE.Vector3();

  for (const position of positions) box.expandByPoint(new THREE.Vector3().fromArray(position).applyMatrix4(worldMatrix));
  for (let i = 0; i < indices.length; i += 3) {
    const ids = [indices[i], indices[i + 1], indices[i + 2]];
    const triangleKey = [...ids].sort((x, y) => x - y).join(',');
    if (triangles.has(triangleKey)) duplicates += 1;
    triangles.add(triangleKey);
    for (const [u, v] of [[ids[0], ids[1]], [ids[1], ids[2]], [ids[2], ids[0]]]) {
      const key = u < v ? `${u},${v}` : `${v},${u}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    a.fromArray(positions[ids[0]]);
    b.fromArray(positions[ids[1]]);
    c.fromArray(positions[ids[2]]);
    faceNormal.copy(ab.subVectors(b, a).cross(ac.subVectors(c, a)));
    if (faceNormal.lengthSq() < 1e-16) { zeroArea += 1; continue; }
    faceNormal.normalize();
    centroid.copy(a).add(b).add(c).multiplyScalar(1 / 3);
    const radial = Math.hypot(centroid.x, centroid.z);
    if (radial < 0.18) {
      const radialDot = radial > 1e-8 ? (faceNormal.x * centroid.x + faceNormal.z * centroid.z) / radial : 0;
      if (Math.abs(faceNormal.y) > 0.72) axial += 1;
      else if (radialDot < 0) cavityInward += 1;
      else cavityOutward += 1;
    } else if (faceNormal.dot(centroid) > 0) outerOutward += 1;
    else outerInward += 1;
  }
  for (const position of positions) {
    const radial = Math.hypot(position[0], position[2]);
    if (Math.abs(position[1]) < 0.95 && radial < 0.18) radialSamples.push(radial);
    if (position[1] >= 0.935 && position[1] <= 0.970 && radial < 0.18) topRadii.push(radial);
    if (position[1] <= -0.940 && position[1] >= -0.980 && radial < 0.18) bottomRadii.push(radial);
  }
  const edgeCounts = [...edges.values()];
  return {
    vertices: positions.length,
    triangles: indices.length / 3,
    boundaryEdges: edgeCounts.filter((count) => count === 1).length,
    nonManifoldEdges: edgeCounts.filter((count) => count !== 2).length,
    duplicateTriangles: duplicates,
    zeroAreaTriangles: zeroArea,
    bounds: { min: box.min.toArray(), max: box.max.toArray(), size: box.getSize(new THREE.Vector3()).toArray() },
    normals: { outerOutward, outerInward, cavityInward, cavityOutward, axial },
    profile: {
      throughHoleRadiusObject: radialSamples.length ? Math.min(...radialSamples) : null,
      topOuterRadiusObject: topRadii.length ? Math.max(...topRadii) : null,
      bottomOuterRadiusObject: bottomRadii.length ? Math.max(...bottomRadii) : null,
    },
  };
}

const sceneIndices = json.scene == null ? [0] : [json.scene];
const audited = [];
function visit(nodeIndex, parentMatrix) {
  const node = json.nodes[nodeIndex];
  const worldMatrix = parentMatrix.clone().multiply(nodeMatrix(node));
  if (node.mesh != null) {
    const mesh = json.meshes[node.mesh];
    mesh.primitives.forEach((primitive, primitiveIndex) => {
      audited.push({
        node: node.name ?? nodeIndex,
        mesh: mesh.name ?? node.mesh,
        primitive: primitiveIndex,
        material: primitive.material == null ? null : json.materials[primitive.material]?.name ?? primitive.material,
        ...auditPrimitive(primitive, worldMatrix),
      });
    });
  }
  for (const child of node.children ?? []) visit(child, worldMatrix);
}
for (const sceneIndex of sceneIndices) {
  for (const nodeIndex of json.scenes[sceneIndex].nodes ?? []) visit(nodeIndex, new THREE.Matrix4());
}

const totalBounds = new THREE.Box3();
for (const item of audited) totalBounds.union(new THREE.Box3(new THREE.Vector3().fromArray(item.bounds.min), new THREE.Vector3().fromArray(item.bounds.max)));
const main = [...audited].sort((a, b) => b.triangles - a.triangles)[0];
const report = {
  file: filename,
  bytes: bytes.length,
  asset: json.asset,
  sceneCount: json.scenes?.length ?? 0,
  nodeCount: json.nodes?.length ?? 0,
  meshCount: json.meshes?.length ?? 0,
  materialCount: json.materials?.length ?? 0,
  totalVertices: audited.reduce((sum, item) => sum + item.vertices, 0),
  totalTriangles: audited.reduce((sum, item) => sum + item.triangles, 0),
  dimensions: totalBounds.getSize(new THREE.Vector3()).toArray(),
  boundingBox: { min: totalBounds.min.toArray(), max: totalBounds.max.toArray() },
  extensionsUsed: json.extensionsUsed ?? [],
  extensionsRequired: json.extensionsRequired ?? [],
  mainPrimitive: main,
  materials: (json.materials ?? []).map((material) => ({
    name: material.name,
    pbr: material.pbrMetallicRoughness,
    extensions: material.extensions,
    alphaMode: material.alphaMode,
    doubleSided: material.doubleSided,
  })),
  nodeExtras: (json.nodes ?? []).filter((node) => node.extras).map((node) => ({ name: node.name, extras: node.extras })),
};
console.log(JSON.stringify(report, null, 2));
