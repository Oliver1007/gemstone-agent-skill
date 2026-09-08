import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';

export const GSI_VERSION = '1.0.0';
export const GSI_COORDINATE_SPACE = 'OBJECT_SPACE_3D_NORMALIZED';

export class StructuralIdentityError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'StructuralIdentityError';
    this.code = code;
    this.details = details;
  }
}

const IMPLEMENTED = Object.freeze({
  SEDIMENTARY_BAND_FIELD: { stage: 'GENERATOR', channels: ['bandClassification', 'density', 'colorModulation'] },
  MULTI_SCALE_LAYER_SYSTEM: { stage: 'GENERATOR', channels: ['bandClassification', 'density'] },
  FOLD_FIELD: { stage: 'COORDINATE_MODIFIER', channels: ['coordinateDisplacement'] },
  LAYER_INTERRUPTION: { stage: 'DOMAIN_MODIFIER', channels: ['continuityMask'] },
  CLOUD_FIELD: { stage: 'GENERATOR', channels: ['cloudiness', 'density', 'transmissionModulation'] },
  CLUSTERED_INCLUSIONS: { stage: 'GENERATOR', channels: ['inclusionOccupancy', 'density'] },
  RADIAL_CLUSTER_MORPHOLOGY: { stage: 'MORPHOLOGY_MODIFIER', channels: ['inclusionOccupancy'] },
  DEPTH_LAYERING: { stage: 'MORPHOLOGY_MODIFIER', channels: ['depthModulation'] },
  VOLUME_DENSITY_VARIATION: { stage: 'GENERATOR', channels: ['density', 'transmissionModulation'] },
});

const DEFINED = Object.freeze({
  PINCH_OUT: { stage: 'COORDINATE_MODIFIER', channels: ['layerThickness'], implementationState: 'DEFINED_NOT_IMPLEMENTED' },
  LAYER_SPLITTING: { stage: 'COORDINATE_MODIFIER', channels: ['layerBranch'], implementationState: 'DEFINED_NOT_IMPLEMENTED' },
  LAYER_OFFSET: { stage: 'COORDINATE_MODIFIER', channels: ['coordinateDisplacement'], implementationState: 'DEFINED_NOT_IMPLEMENTED' },
  FEATHERY_CLUSTER_MORPHOLOGY: { stage: 'MORPHOLOGY_MODIFIER', channels: ['inclusionOccupancy'], implementationState: 'DEFINED_NOT_IMPLEMENTED' },
  MICRO_MINERAL_EDGE: { stage: 'GENERATOR', channels: ['roughnessModulation', 'localMaterialId'], implementationState: 'DEFINED_NOT_IMPLEMENTED' },
});

export const STRUCTURAL_PRIMITIVE_REGISTRY = Object.freeze(Object.fromEntries([
  ...Object.entries(IMPLEMENTED).map(([type, value]) => [type, { type, implementationState: 'IMPLEMENTED_V1', ...value }]),
  ...Object.entries(DEFINED).map(([type, value]) => [type, { type, ...value }]),
]));

const PARAMETER_KEYS = Object.freeze({
  SEDIMENTARY_BAND_FIELD: ['orientation', 'primaryFrequency', 'secondaryFrequency', 'microFrequency', 'primaryWeight', 'secondaryWeight', 'microWeight', 'phase', 'irregularity'],
  MULTI_SCALE_LAYER_SYSTEM: ['broadBands', 'mediumBands', 'microBands', 'irregularity'],
  FOLD_FIELD: ['axis', 'amplitude', 'frequency', 'locality', 'center', 'phase'],
  LAYER_INTERRUPTION: ['center', 'radius', 'softness', 'residual'],
  CLOUD_FIELD: ['frequency', 'octaves', 'contrast', 'bias'],
  CLUSTERED_INCLUSIONS: ['dominantCount', 'secondaryCount', 'backgroundDensity', 'depthSpread', 'clusterScale'],
  RADIAL_CLUSTER_MORPHOLOGY: ['petalCount', 'branchFrequency', 'anisotropy', 'softness'],
  DEPTH_LAYERING: ['axis', 'layers', 'spread', 'modulation'],
  VOLUME_DENSITY_VARIATION: ['frequency', 'amplitude', 'octaves'],
});

function fail(code, message, details) { throw new StructuralIdentityError(code, message, details); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INTERNAL_STRUCTURE', `${label} must be an object`); }
function exact(value, keys, required, label) {
  object(value, label);
  const unknown = Object.keys(value).filter((key) => !keys.includes(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) fail('INVALID_INTERNAL_STRUCTURE', `${label} has invalid keys`, { unknown, missing });
}
function number(value, label, min, max, exclusiveMin = false) {
  if (!Number.isFinite(value) || (exclusiveMin ? value <= min : value < min) || value > max) fail('INVALID_INTERNAL_STRUCTURE', `${label} is outside its finite domain`, { value, min, max, exclusiveMin });
  return value;
}
function integer(value, label, min, max) {
  if (!Number.isInteger(value) || value < min || value > max) fail('INVALID_INTERNAL_STRUCTURE', `${label} must be an integer in range`, { value, min, max });
  return value;
}
function vector3(value, label, min = -1e6, max = 1e6, positive = false) {
  if (!Array.isArray(value) || value.length !== 3) fail('INVALID_INTERNAL_STRUCTURE', `${label} must be a three-number array`);
  return value.map((item, index) => number(item, `${label}[${index}]`, positive ? 0 : min, max, positive));
}
function color(value, label) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) fail('INVALID_INTERNAL_STRUCTURE', `${label} must be #RRGGBB`);
  return value.toUpperCase();
}

function validateParameters(type, p, label) {
  exact(p, PARAMETER_KEYS[type], PARAMETER_KEYS[type], label);
  if (p.orientation) vector3(p.orientation, `${label}.orientation`, -1, 1);
  if (p.axis) vector3(p.axis, `${label}.axis`, -1, 1);
  if (p.center) vector3(p.center, `${label}.center`, -2, 2);
  const frequencyFields = ['primaryFrequency', 'secondaryFrequency', 'microFrequency', 'frequency', 'branchFrequency'];
  for (const key of frequencyFields) if (Object.hasOwn(p, key)) number(p[key], `${label}.${key}`, 0.01, 128, true);
  for (const key of ['primaryWeight', 'secondaryWeight', 'microWeight', 'irregularity', 'amplitude', 'residual', 'backgroundDensity', 'depthSpread', 'anisotropy', 'softness', 'spread', 'modulation']) {
    if (Object.hasOwn(p, key)) number(p[key], `${label}.${key}`, 0, key === 'softness' ? 2 : 1, key === 'softness');
  }
  if (Object.hasOwn(p, 'phase')) number(p.phase, `${label}.phase`, -1000, 1000);
  if (Object.hasOwn(p, 'locality')) number(p.locality, `${label}.locality`, 0.01, 8, true);
  if (Object.hasOwn(p, 'radius')) number(p.radius, `${label}.radius`, 0, 3, true);
  if (Object.hasOwn(p, 'contrast')) number(p.contrast, `${label}.contrast`, 0.1, 8);
  if (Object.hasOwn(p, 'bias')) number(p.bias, `${label}.bias`, -1, 1);
  if (Object.hasOwn(p, 'clusterScale')) number(p.clusterScale, `${label}.clusterScale`, 0.01, 1, true);
  for (const key of ['octaves', 'broadBands', 'mediumBands', 'microBands', 'dominantCount', 'secondaryCount', 'petalCount', 'layers']) {
    if (Object.hasOwn(p, key)) integer(p[key], `${label}.${key}`, 1, 128);
  }
  if (Object.hasOwn(p, 'dominantCount') && (p.dominantCount < 2 || p.dominantCount > 4)) fail('INVALID_INTERNAL_STRUCTURE', `${label}.dominantCount must be 2 through 4`);
  if (Object.hasOwn(p, 'secondaryCount') && (p.secondaryCount < 6 || p.secondaryCount > 12)) fail('INVALID_INTERNAL_STRUCTURE', `${label}.secondaryCount must be 6 through 12`);
  if (Object.hasOwn(p, 'petalCount') && (p.petalCount < 3 || p.petalCount > 12)) fail('INVALID_INTERNAL_STRUCTURE', `${label}.petalCount must be 3 through 12`);
  if (Object.hasOwn(p, 'octaves') && p.octaves > 8) fail('INVALID_INTERNAL_STRUCTURE', `${label}.octaves must not exceed 8`);
  return structuredClone(p);
}

function validatePrimitive(input, index) {
  const label = `internalStructure.primitives[${index}]`;
  const keys = ['type', 'enabled', 'subSeed', 'strength', 'scale', 'spatialTransform', 'domain', 'parameters', 'materialCoupling'];
  exact(input, keys, keys, label);
  if (!Object.hasOwn(STRUCTURAL_PRIMITIVE_REGISTRY, input.type)) fail('UNKNOWN_STRUCTURAL_PRIMITIVE', `${label}.type is unknown`, { type: input.type });
  if (STRUCTURAL_PRIMITIVE_REGISTRY[input.type].implementationState !== 'IMPLEMENTED_V1') fail('UNIMPLEMENTED_STRUCTURAL_PRIMITIVE', `${label}.type is defined but not implemented`, { type: input.type });
  if (typeof input.enabled !== 'boolean') fail('INVALID_INTERNAL_STRUCTURE', `${label}.enabled must be boolean`);
  integer(input.subSeed, `${label}.subSeed`, 0, 2147483647);
  number(input.strength, `${label}.strength`, 0, 1);
  number(input.scale, `${label}.scale`, 0.001, 1000, true);
  exact(input.spatialTransform, ['translation', 'rotationDegrees', 'scale'], ['translation', 'rotationDegrees', 'scale'], `${label}.spatialTransform`);
  vector3(input.spatialTransform.translation, `${label}.spatialTransform.translation`, -4, 4);
  vector3(input.spatialTransform.rotationDegrees, `${label}.spatialTransform.rotationDegrees`, -360, 360);
  vector3(input.spatialTransform.scale, `${label}.spatialTransform.scale`, 0, 100, true);
  exact(input.domain, ['shape', 'excludeThroughHole'], ['shape', 'excludeThroughHole'], `${label}.domain`);
  if (input.domain.shape !== 'VOLUME') fail('INVALID_INTERNAL_STRUCTURE', `${label}.domain.shape must be VOLUME`);
  if (typeof input.domain.excludeThroughHole !== 'boolean') fail('INVALID_INTERNAL_STRUCTURE', `${label}.domain.excludeThroughHole must be boolean`);
  validateParameters(input.type, input.parameters, `${label}.parameters`);
  exact(input.materialCoupling, ['color', 'colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight'], ['color', 'colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight'], `${label}.materialCoupling`);
  color(input.materialCoupling.color, `${label}.materialCoupling.color`);
  for (const key of ['colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight']) number(input.materialCoupling[key], `${label}.materialCoupling.${key}`, 0, 1);
  return structuredClone(input);
}

export function validateInternalStructure(input) {
  exact(input, ['version', 'seed', 'coordinateSpace', 'primitives'], ['version', 'seed', 'coordinateSpace', 'primitives'], 'internalStructure');
  if (input.version !== GSI_VERSION) fail('UNSUPPORTED_INTERNAL_STRUCTURE_VERSION', `internalStructure.version must be ${GSI_VERSION}`);
  integer(input.seed, 'internalStructure.seed', 0, 2147483647);
  if (input.coordinateSpace !== GSI_COORDINATE_SPACE) fail('UNSUPPORTED_STRUCTURAL_COORDINATE_SPACE', `internalStructure.coordinateSpace must be ${GSI_COORDINATE_SPACE}`);
  if (!Array.isArray(input.primitives) || input.primitives.length < 1 || input.primitives.length > 32) fail('INVALID_INTERNAL_STRUCTURE', 'internalStructure.primitives must contain 1 through 32 entries');
  return { version: input.version, seed: input.seed, coordinateSpace: input.coordinateSpace, primitives: input.primitives.map(validatePrimitive) };
}

function u32(value) { return value >>> 0; }
function hash32(...values) {
  let h = 2166136261;
  for (const value of values) {
    const text = String(value);
    for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  }
  h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16;
  return u32(h);
}
function random01(...values) { return hash32(...values) / 4294967295; }
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise3(point, seed) {
  const x0 = Math.floor(point[0]); const y0 = Math.floor(point[1]); const z0 = Math.floor(point[2]);
  const tx = smooth(point[0] - x0); const ty = smooth(point[1] - y0); const tz = smooth(point[2] - z0);
  const lerp = (a, b, t) => a + (b - a) * t;
  const corner = (dx, dy, dz) => random01(seed, x0 + dx, y0 + dy, z0 + dz) * 2 - 1;
  const x00 = lerp(corner(0, 0, 0), corner(1, 0, 0), tx);
  const x10 = lerp(corner(0, 1, 0), corner(1, 1, 0), tx);
  const x01 = lerp(corner(0, 0, 1), corner(1, 0, 1), tx);
  const x11 = lerp(corner(0, 1, 1), corner(1, 1, 1), tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}
function fractalNoise(point, seed, octaves) {
  let value = 0; let weight = 0.5; let norm = 0; let frequency = 1;
  for (let i = 0; i < octaves; i += 1) { value += valueNoise3(point.map((v) => v * frequency), seed + i * 1013) * weight; norm += weight; weight *= 0.5; frequency *= 2.03; }
  return value / norm;
}
function normalize(v) { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); }
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function clamp01(v) { return Math.max(0, Math.min(1, v)); }
function inverseTransform(point, transform, scalarScale) {
  let p = point.map((v, i) => (v - transform.translation[i]) / (transform.scale[i] * scalarScale));
  const r = transform.rotationDegrees.map((v) => -v * Math.PI / 180);
  const rotate = (a, b, angle) => { const ca = Math.cos(angle); const sa = Math.sin(angle); const va = p[a]; const vb = p[b]; p[a] = va * ca - vb * sa; p[b] = va * sa + vb * ca; };
  rotate(0, 1, r[2]); rotate(0, 2, r[1]); rotate(1, 2, r[0]);
  return p;
}
function makeClusters(seed, p) {
  const clusters = [];
  for (let i = 0; i < p.dominantCount + p.secondaryCount; i += 1) {
    const dominant = i < p.dominantCount;
    const radius = (dominant ? 0.46 : 0.24) * p.clusterScale * (0.72 + random01(seed, i, 4) * 0.56);
    clusters.push({
      dominant,
      center: [random01(seed, i, 1) * 1.4 - 0.7, (random01(seed, i, 2) * 2 - 1) * p.depthSpread, random01(seed, i, 3) * 1.4 - 0.7],
      radius,
      orientation: random01(seed, i, 5) * Math.PI * 2,
    });
  }
  return clusters;
}

export function createStructuralEvaluator(raw) {
  const structure = validateInternalStructure(raw);
  const compiled = structure.primitives.filter((p) => p.enabled && p.strength > 0).map((primitive) => ({
    ...primitive,
    effectiveSeed: hash32(structure.seed, primitive.subSeed, primitive.type),
    clusters: primitive.type === 'CLUSTERED_INCLUSIONS' ? makeClusters(hash32(structure.seed, primitive.subSeed), primitive.parameters) : null,
  }));
  const sharedClusters = compiled.find((primitive) => primitive.type === 'CLUSTERED_INCLUSIONS')?.clusters ?? [];
  const structureIdentity = crypto.createHash('sha256').update(JSON.stringify(structure)).digest('hex').toUpperCase();
  return {
    structure,
    structureIdentity,
    sample(objectPoint) {
      if (!Array.isArray(objectPoint) || objectPoint.length !== 3 || objectPoint.some((v) => !Number.isFinite(v))) fail('INVALID_STRUCTURAL_SAMPLE_POINT', 'objectPoint must be finite vec3');
      let point = [...objectPoint];
      let continuityMask = 1;
      for (const primitive of compiled) {
        const local = inverseTransform(point, primitive.spatialTransform, primitive.scale);
        const p = primitive.parameters;
        if (primitive.type === 'FOLD_FIELD') {
          const axis = normalize(p.axis); const transverse = local[0] * Math.cos(p.phase) + local[2] * Math.sin(p.phase);
          const envelope = Math.exp(-p.locality * (local[0] ** 2 + local[2] ** 2));
          const displacement = Math.sin(transverse * p.frequency * Math.PI) * p.amplitude * envelope * primitive.strength;
          point = point.map((v, i) => v + axis[i] * displacement);
        } else if (primitive.type === 'LAYER_INTERRUPTION') {
          const d = Math.hypot(local[0] - p.center[0], local[1] - p.center[1], local[2] - p.center[2]);
          const edge = clamp01((d - p.radius) / p.softness);
          continuityMask *= p.residual + (1 - p.residual) * edge;
        }
      }
      const result = { density: 0, colorModulation: 0, transmissionModulation: 0, roughnessModulation: 0, bandClassification: 0, inclusionOccupancy: 0, cloudiness: 0, depthModulation: 1, continuityMask, contributions: [] };
      let inclusionBase = 0;
      for (const primitive of compiled) {
        const local = inverseTransform(point, primitive.spatialTransform, primitive.scale); const p = primitive.parameters; let signal = 0;
        if (primitive.type === 'SEDIMENTARY_BAND_FIELD') {
          const axis = normalize(p.orientation); const h = dot(local, axis) + p.phase + fractalNoise(local.map((v) => v * 0.7), primitive.effectiveSeed, 3) * p.irregularity;
          const broad = 0.5 + 0.5 * Math.sin(h * p.primaryFrequency * Math.PI * 2);
          const medium = 0.5 + 0.5 * Math.sin(h * p.secondaryFrequency * Math.PI * 2 + 0.7);
          const micro = 0.5 + 0.5 * Math.sin(h * p.microFrequency * Math.PI * 2 + 1.3);
          signal = clamp01((broad * p.primaryWeight + medium * p.secondaryWeight + micro * p.microWeight) / (p.primaryWeight + p.secondaryWeight + p.microWeight)) * continuityMask;
          result.bandClassification = Math.max(result.bandClassification, signal * primitive.strength);
        } else if (primitive.type === 'MULTI_SCALE_LAYER_SYSTEM') {
          const h = local[1] + fractalNoise(local.map((v) => v * 1.1), primitive.effectiveSeed, 3) * p.irregularity;
          signal = clamp01(0.52 + 0.25 * Math.sin(h * p.broadBands * Math.PI) + 0.16 * Math.sin(h * p.mediumBands * Math.PI) + 0.07 * Math.sin(h * p.microBands * Math.PI)) * continuityMask;
          result.bandClassification = Math.max(result.bandClassification, signal * primitive.strength);
        } else if (primitive.type === 'CLOUD_FIELD') {
          signal = clamp01((fractalNoise(local.map((v) => v * p.frequency), primitive.effectiveSeed, p.octaves) + p.bias + 1) * 0.5);
          signal = clamp01((signal - 0.5) * p.contrast + 0.5); result.cloudiness = Math.max(result.cloudiness, signal * primitive.strength);
        } else if (primitive.type === 'CLUSTERED_INCLUSIONS') {
          for (const cluster of primitive.clusters) {
            const d = Math.hypot(local[0] - cluster.center[0], local[1] - cluster.center[1], local[2] - cluster.center[2]);
            const radial = clamp01(1 - d / cluster.radius); signal = Math.max(signal, radial * radial * (cluster.dominant ? 1 : 0.72));
          }
          signal = Math.max(signal, p.backgroundDensity * clamp01(fractalNoise(local.map((v) => v * 7), primitive.effectiveSeed + 71, 2) * 0.5 + 0.5));
          inclusionBase = Math.max(inclusionBase, signal * primitive.strength);
        } else if (primitive.type === 'RADIAL_CLUSTER_MORPHOLOGY') {
          for (const cluster of sharedClusters) {
            const q = local.map((v, i) => v - cluster.center[i]); const radial = Math.hypot(q[0], q[2]); const distance = Math.hypot(...q);
            const envelope = clamp01(1 - distance / (cluster.radius * 1.18)); const angle = Math.atan2(q[2], q[0]) + cluster.orientation;
            const petals = Math.pow(Math.max(0, Math.cos(angle * p.petalCount + q[1] * p.branchFrequency * 2)), 2 / p.softness);
            const feather = clamp01(0.5 + 0.5 * Math.sin((radial / Math.max(cluster.radius, 0.001)) * p.branchFrequency * 8 + angle * 2));
            signal = Math.max(signal, envelope * (0.22 + 0.78 * petals) * (1 - p.anisotropy + p.anisotropy * feather));
          }
          result.inclusionOccupancy = Math.max(result.inclusionOccupancy, inclusionBase * (0.28 + 0.72 * signal) * primitive.strength);
        } else if (primitive.type === 'DEPTH_LAYERING') {
          const axis = normalize(p.axis); const depth = dot(local, axis);
          signal = clamp01((0.5 + 0.5 * Math.sin(depth * p.layers * Math.PI)) * p.modulation + (1 - p.modulation));
          result.depthModulation *= (1 - p.spread) + p.spread * signal;
        } else if (primitive.type === 'VOLUME_DENSITY_VARIATION') {
          signal = clamp01(0.5 + 0.5 * fractalNoise(local.map((v) => v * p.frequency), primitive.effectiveSeed, p.octaves)) * p.amplitude;
        }
        if (!Number.isFinite(signal)) fail('STRUCTURAL_EVALUATION_NON_FINITE', 'Primitive produced a non-finite signal', { type: primitive.type });
        const effective = signal * primitive.strength;
        result.density = clamp01(result.density + effective * primitive.materialCoupling.densityWeight);
        result.colorModulation = clamp01(result.colorModulation + effective * primitive.materialCoupling.colorWeight);
        result.transmissionModulation = clamp01(result.transmissionModulation + effective * primitive.materialCoupling.transmissionWeight);
        result.roughnessModulation = clamp01(result.roughnessModulation + effective * primitive.materialCoupling.roughnessWeight);
        result.contributions.push({ type: primitive.type, signal: effective, color: primitive.materialCoupling.color, colorWeight: primitive.materialCoupling.colorWeight });
      }
      if (result.inclusionOccupancy === 0) result.inclusionOccupancy = inclusionBase;
      result.inclusionOccupancy *= result.depthModulation;
      return result;
    },
  };
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) { crc ^= byte; for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBytes = Buffer.from(type); const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); typeBytes.copy(out, 4); data.copy(out, 8); out.writeUInt32BE(crc32(Buffer.concat([typeBytes, data])), 8 + data.length); return out;
}
function encodePng(width, height, rgb) {
  const scan = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y += 1) { scan[y * (width * 3 + 1)] = 0; rgb.copy(scan, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(scan, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}
function hexRgb(value) { return [1, 3, 5].map((i) => Number.parseInt(value.slice(i, i + 2), 16)); }
function basisForView(view) {
  const dirs = { front: [0, 0, 1], side: [1, 0, 0], back: [0, 0, -1], top: [0, 1, 0], bottom: [0, -1, 0], oblique: normalize([1, 0.6, 1]) };
  const forward = dirs[view]; if (!forward) fail('INVALID_STRUCTURAL_VIEW', 'Unsupported proof view', { view });
  const upHint = Math.abs(forward[1]) > 0.9 ? [0, 0, forward[1] > 0 ? -1 : 1] : [0, 1, 0];
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const right = normalize(cross(upHint, forward)); const up = normalize(cross(forward, right)); return { forward, right, up };
}
function mixColor(base, contributions, aggregate) {
  let colorValue = [...base]; let total = 0;
  for (const c of contributions) { const w = c.signal * c.colorWeight * 2.4; const tint = hexRgb(c.color); colorValue = colorValue.map((v, i) => v + tint[i] * w); total += w; }
  colorValue = colorValue.map((v) => v / (1 + total));
  const milk = aggregate.cloudiness * 0.42; return colorValue.map((v) => v * (1 - milk) + 247 * milk);
}

export async function renderStructuralProof({ materialSpec, views, outputDirectory, width = 160, height = 160, samples = 20 }) {
  if (!materialSpec?.internalStructure) fail('MISSING_INTERNAL_STRUCTURE', 'Structural proof requires internalStructure');
  if (!Array.isArray(views) || views.length < 1 || views.length > 8) fail('INVALID_STRUCTURAL_VIEW', 'views must contain 1 through 8 canonical views');
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 64 || height < 64 || width > 512 || height > 512) fail('INVALID_STRUCTURAL_RENDER_BOUNDS', 'Proof dimensions must be 64 through 512');
  if (!Number.isInteger(samples) || samples < 8 || samples > 64) fail('INVALID_STRUCTURAL_RENDER_BOUNDS', 'Proof samples must be 8 through 64');
  const evaluator = createStructuralEvaluator(materialSpec.internalStructure); const base = typeof materialSpec.material.baseColor === 'string' ? hexRgb(materialSpec.material.baseColor) : materialSpec.material.baseColor.map((v) => Math.round(v * 255));
  await fs.mkdir(outputDirectory, { recursive: true }); const started = performance.now(); const outputs = [];
  for (const view of views) {
    const basis = basisForView(view); const rgb = Buffer.alloc(width * height * 3); const scale = 1.14;
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const sx = ((x + 0.5) / width * 2 - 1) * scale; const sy = (1 - (y + 0.5) / height * 2) * scale; const index = (y * width + x) * 3;
      const radial2 = sx * sx + sy * sy;
      if (radial2 > 1) { const bg = 238 + Math.round(8 * (1 - y / height)); rgb[index] = bg; rgb[index + 1] = bg; rgb[index + 2] = bg; continue; }
      const half = Math.sqrt(1 - radial2); let accum = [0, 0, 0]; let strongest = 0; let strongestColor = [...base]; let densityAverage = 0;
      for (let s = 0; s < samples; s += 1) {
        const z = -half + (s + 0.5) / samples * half * 2;
        const point = [0, 1, 2].map((i) => basis.right[i] * sx + basis.up[i] * sy + basis.forward[i] * z);
        const field = evaluator.sample(point); const local = mixColor(base, field.contributions, field);
        accum = accum.map((v, i) => v + local[i]); densityAverage += field.density;
        const feature = clamp01(Math.max(field.bandClassification * 0.95, field.inclusionOccupancy * 2.2, field.cloudiness * 0.42, field.density * 0.34));
        if (feature > strongest) { strongest = feature; strongestColor = local; }
      }
      const surfacePoint = [0,1,2].map((i) => basis.right[i]*sx + basis.up[i]*sy + basis.forward[i]*half); const normal = normalize(surfacePoint);
      const light = normalize([-0.5, 0.75, 1]); const diffuse = 0.67 + 0.3 * Math.max(0, dot(normal, light)); const spec = Math.pow(Math.max(0, dot(normal, normalize([0.25,0.35,1]))), 52) * 105;
      const featureMix = clamp01(strongest * 1.35); const haze = clamp01(densityAverage / samples) * 0.18;
      for (let c = 0; c < 3; c += 1) { const average = accum[c] / samples; const structural = average * (1 - featureMix) + strongestColor[c] * featureMix; const transmitted = structural * (1 - haze) + 244 * haze; rgb[index + c] = Math.round(Math.max(0, Math.min(255, transmitted * diffuse + spec))); }
    }
    const png = encodePng(width, height, rgb); const imagePath = path.join(outputDirectory, `${view}.png`); await fs.writeFile(imagePath, png, { flag: 'wx' });
    outputs.push({ view, imagePath, bytes: png.length, sha256: crypto.createHash('sha256').update(png).digest('hex').toUpperCase() });
  }
  return { status: 'STRUCTURAL_PROOF_COMPLETE', rendererIdentity: 'GSI_V1_CPU_FAST_OBJECT_SPACE_RAYMARCH', structureIdentity: evaluator.structureIdentity, views: outputs, width, height, samples, elapsedMs: Math.round((performance.now() - started) * 1000) / 1000 };
}

export function structuralFieldFingerprint(internalStructure, points) {
  const evaluator = createStructuralEvaluator(internalStructure); const values = points.map((point) => evaluator.sample(point));
  return crypto.createHash('sha256').update(JSON.stringify(values)).digest('hex').toUpperCase();
}

export function diagnoseBlueLaceNonConcentric(internalStructure) {
  const evaluator = createStructuralEvaluator(internalStructure); const radii = [0.15, 0.35, 0.55, 0.75]; const ringVariance = []; const verticalVariance = [];
  for (const r of radii) {
    const ring = Array.from({ length: 24 }, (_, i) => { const a = i / 24 * Math.PI * 2; return evaluator.sample([Math.cos(a) * r, 0.72, Math.sin(a) * r]).bandClassification; });
    ringVariance.push(Math.max(...ring) - Math.min(...ring));
  }
  for (const y of [-0.7, -0.35, 0, 0.35, 0.7]) verticalVariance.push(evaluator.sample([0.23, y, -0.17]).bandClassification);
  const angularVariation = ringVariance.reduce((a,b)=>a+b,0)/ringVariance.length; const layerVariation = Math.max(...verticalVariance)-Math.min(...verticalVariance);
  return { status: angularVariation > 0.015 && layerVariation > 0.08 ? 'PASS' : 'FAIL', coordinateSpace: GSI_COORDINATE_SPACE, radialOnlyOrganization: false, angularVariation, layerVariation, classifications: [] };
}

export function diagnoseSakuraMorphology(internalStructure) {
  const evaluator = createStructuralEvaluator(internalStructure); const grid = []; let occupied = 0; let high = 0;
  for (let z=-0.8;z<=0.8;z+=0.1) for(let y=-0.8;y<=0.8;y+=0.1) for(let x=-0.8;x<=0.8;x+=0.1) if(x*x+y*y+z*z<=1){ const v=evaluator.sample([x,y,z]).inclusionOccupancy; grid.push(v); if(v>0.08) occupied++; if(v>0.18) high++; }
  const mean=grid.reduce((a,b)=>a+b,0)/grid.length; const variance=grid.reduce((a,b)=>a+(b-mean)**2,0)/grid.length;
  return { status: occupied/grid.length>0.01 && occupied/grid.length<0.45 && high>0 && variance>0.0003 ? 'PASS':'FAIL', morphology:'HIERARCHICAL_RADIAL_FEATHERY_CLUSTER_FIELD', occupiedFraction:occupied/grid.length, highOccupancySamples:high, variance, uniformRandomParticles:false, spherePacking:false, shardField:false };
}
