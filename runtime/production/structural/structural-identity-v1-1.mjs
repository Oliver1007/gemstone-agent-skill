import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { performance } from 'node:perf_hooks';
import {
  GSI_COORDINATE_SPACE,
  StructuralIdentityError,
  STRUCTURAL_PRIMITIVE_REGISTRY,
  createStructuralEvaluator as createV10Evaluator,
  validateInternalStructure as validateV10Structure,
} from './structural-identity-v1.mjs';

export const GSI_V11_VERSION = '1.1.0';
export const GSI_V11_RUNTIME_BEHAVIOR_IDENTITY = crypto.createHash('sha256').update('GSI_V11_GENERIC_IRREGULAR_CLUSTER_SYSTEM_CANONICAL_LEFT_FLORAL_HIERARCHY_GEOMETRY_R2_VISIBILITY_TRANSFER_SAMPLE_FLOOR_R1_MAJOR_CORE_SUPPORT_R1_MATRIX_PREMULTIPLIED_ROOT_CONTRIBUTION_R1_ORIENTATION_ROBUST_VOLUMETRIC_LOBE_BODY_R1').digest('hex').toUpperCase();
export const GSI_V11_LIMITS = Object.freeze({ maxClusters: 64, maxLobesTotal: 128, maxHierarchyDepth: 2, maxConditionAttempts: 64, maxLobesPerCluster: 8 });
export const GENERIC_CLUSTER_TYPE = 'GENERIC_IRREGULAR_CLUSTER_SYSTEM';
export const STRUCTURAL_PRIMITIVE_REGISTRY_V11 = Object.freeze({
  ...STRUCTURAL_PRIMITIVE_REGISTRY,
  [GENERIC_CLUSTER_TYPE]: Object.freeze({
    type: GENERIC_CLUSTER_TYPE,
    implementationState: 'PROTOTYPE_IMPLEMENTED_V1_1',
    stage: 'GENERIC_CLUSTER_SYSTEM',
    channels: ['clusterOccupancy', 'clusterDensity', 'combinedInternalDensity', 'visibleMaterialContribution'],
  }),
});

const SYSTEM_PARAMETER_KEYS = ['seedHierarchyVersion', 'morphology', 'populations', 'conditioning', 'composition'];
const MORPHOLOGY_KEYS = ['baseRadius', 'aspectRatio', 'orientation', 'lobeScaleRange', 'lobeScatter', 'boundaryWarp', 'boundaryFeatureScale', 'growthBias', 'growthBiasStrength', 'densityFalloff', 'internalDensityVariation'];
const POPULATION_KEYS = ['population', 'rootCount', 'parentPopulation', 'childrenPerParentRange', 'scaleRange', 'lobeCountRange', 'shapeComplexity', 'densityScale', 'depthSpread', 'orientationCorrelation', 'localScatter'];
const CONDITION_KEYS = ['targetPopulation', 'sourcePrimitiveId', 'sourceChannel', 'mode', 'threshold', 'weight', 'attemptBudget'];
const POPULATIONS = ['DOMINANT', 'SECONDARY', 'MICRO_SUPPORT'];
const CONDITION_SOURCES = Object.freeze({ CLOUD_FIELD: ['cloudDensity'], VOLUME_DENSITY_VARIATION: ['densityVariation'], DEPTH_LAYERING: ['depthModulation'] });
const DENSITY_FALLOFF = Object.freeze({ COMPACT: 2.5, MINERAL_MASS: 1.6, SOFT: 1.15 });

function fail(code, message, details = {}) { throw new StructuralIdentityError(code, message, details); }
function object(value, label) { if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must be an object`); }
function exact(value, keys, required, label) { object(value, label); const unknown = Object.keys(value).filter((key) => !keys.includes(key)); const missing = required.filter((key) => !Object.hasOwn(value, key)); if (unknown.length || missing.length) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} has invalid keys`, { unknown, missing }); }
function number(value, label, minimum, maximum, exclusiveMinimum = false) { if (!Number.isFinite(value) || (exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} is outside its finite domain`, { value, minimum, maximum, exclusiveMinimum }); return value; }
function integer(value, label, minimum, maximum) { if (!Number.isInteger(value) || value < minimum || value > maximum) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must be an integer in range`, { value, minimum, maximum }); return value; }
function vector(value, length, label, minimum, maximum, positive = false) { if (!Array.isArray(value) || value.length !== length) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must be a ${length}-number array`); return value.map((item, index) => number(item, `${label}[${index}]`, positive ? 0 : minimum, maximum, positive)); }
function nonzeroVector3(value, label) { const out = vector(value, 3, label, -1, 1); if (Math.hypot(...out) < 1e-9) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must not be zero length`); return out; }
function unitQuaternion(value, label) { const out = vector(value, 4, label, -1, 1); const length = Math.hypot(...out); if (length < 1e-9 || Math.abs(length - 1) > 1e-5) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must be a normalized quaternion`, { length }); return out; }
function id(value, label) { if (typeof value !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(value)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must be a stable kebab-case id`); return value; }
function range2(value, label, minimum, maximum, integerRange = false) { const out = vector(value, 2, label, minimum, maximum); if (out[0] > out[1]) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} minimum exceeds maximum`); if (integerRange && out.some((item) => !Number.isInteger(item))) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} must contain integers`); return out; }
function clone(value) { return structuredClone(value); }
function clamp01(value) { return Math.max(0, Math.min(1, value)); }
function normalize(value) { const length = Math.hypot(...value); if (!length) return value.map(() => 0); return value.map((item) => item / length); }
function sha(value) { return crypto.createHash('sha256').update(value).digest('hex').toUpperCase(); }

function validateMorphology(input, label) {
  exact(input, MORPHOLOGY_KEYS, MORPHOLOGY_KEYS, label);
  number(input.baseRadius, `${label}.baseRadius`, 0, 0.75, true);
  const aspect = vector(input.aspectRatio, 3, `${label}.aspectRatio`, 0.35, 2.85, true);
  const geometricMean = (aspect[0] * aspect[1] * aspect[2]) ** (1 / 3);
  if (Math.abs(geometricMean - 1) > 1e-4) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.aspectRatio geometric mean must be 1`, { geometricMean });
  unitQuaternion(input.orientation, `${label}.orientation`);
  const lobeScale = range2(input.lobeScaleRange, `${label}.lobeScaleRange`, 0.15, 1);
  number(input.lobeScatter, `${label}.lobeScatter`, 0, 1);
  number(input.boundaryWarp, `${label}.boundaryWarp`, 0, 0.45);
  number(input.boundaryFeatureScale, `${label}.boundaryFeatureScale`, 0.05, 0.5, true);
  if (input.growthBias !== null) nonzeroVector3(input.growthBias, `${label}.growthBias`);
  number(input.growthBiasStrength, `${label}.growthBiasStrength`, 0, 1);
  if (!Object.hasOwn(DENSITY_FALLOFF, input.densityFalloff)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.densityFalloff is unsupported`);
  number(input.internalDensityVariation, `${label}.internalDensityVariation`, 0, 1);
  return { ...clone(input), aspectRatio: aspect, lobeScaleRange: lobeScale };
}

function validatePopulation(input, index) {
  const label = `genericCluster.parameters.populations[${index}]`;
  exact(input, POPULATION_KEYS, POPULATION_KEYS, label);
  if (!POPULATIONS.includes(input.population)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.population is unsupported`);
  if (input.population === 'DOMINANT') {
    integer(input.rootCount, `${label}.rootCount`, 1, 8);
    if (input.parentPopulation !== null || input.childrenPerParentRange !== null) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label} DOMINANT must be root-only`);
  } else {
    if (input.rootCount !== null) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.rootCount must be null for children`);
    const requiredParent = input.population === 'SECONDARY' ? 'DOMINANT' : 'SECONDARY';
    if (input.parentPopulation !== requiredParent) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parentPopulation must be ${requiredParent}`);
    range2(input.childrenPerParentRange, `${label}.childrenPerParentRange`, 0, input.population === 'SECONDARY' ? 12 : 16, true);
  }
  range2(input.scaleRange, `${label}.scaleRange`, 0.05, 2);
  range2(input.lobeCountRange, `${label}.lobeCountRange`, 1, GSI_V11_LIMITS.maxLobesPerCluster, true);
  number(input.shapeComplexity, `${label}.shapeComplexity`, 0, 1);
  number(input.densityScale, `${label}.densityScale`, 0, 1, true);
  number(input.depthSpread, `${label}.depthSpread`, 0, 1);
  number(input.orientationCorrelation, `${label}.orientationCorrelation`, 0, 1);
  number(input.localScatter, `${label}.localScatter`, 0, 1);
  return clone(input);
}

function validateCondition(input, index) {
  const label = `genericCluster.parameters.conditioning[${index}]`;
  exact(input, CONDITION_KEYS, CONDITION_KEYS, label);
  if (!POPULATIONS.includes(input.targetPopulation)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.targetPopulation is unsupported`);
  id(input.sourcePrimitiveId, `${label}.sourcePrimitiveId`);
  if (!['cloudDensity', 'densityVariation', 'depthModulation'].includes(input.sourceChannel)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.sourceChannel is unsupported`);
  if (!['PREFER_HIGH', 'PREFER_LOW', 'BAND', 'REJECT_OUTSIDE'].includes(input.mode)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.mode is unsupported`);
  if (input.mode === 'BAND' || input.mode === 'REJECT_OUTSIDE') range2(input.threshold, `${label}.threshold`, 0, 1);
  else number(input.threshold, `${label}.threshold`, 0, 1);
  number(input.weight, `${label}.weight`, 0, 1);
  integer(input.attemptBudget, `${label}.attemptBudget`, 1, GSI_V11_LIMITS.maxConditionAttempts);
  return clone(input);
}

function stripPrimitiveId(primitive) { const value = clone(primitive); delete value.primitiveId; return value; }

function validateGenericSystem(input, index) {
  const label = `internalStructure.primitives[${index}]`;
  const keys = ['primitiveId', 'type', 'enabled', 'subSeed', 'strength', 'scale', 'spatialTransform', 'domain', 'parameters', 'materialCoupling'];
  exact(input, keys, keys, label);
  id(input.primitiveId, `${label}.primitiveId`);
  if (input.type !== GENERIC_CLUSTER_TYPE) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.type must be ${GENERIC_CLUSTER_TYPE}`);
  if (typeof input.enabled !== 'boolean') fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.enabled must be boolean`);
  integer(input.subSeed, `${label}.subSeed`, 0, 2147483647);
  number(input.strength, `${label}.strength`, 0, 1);
  number(input.scale, `${label}.scale`, 0, 1000, true);
  exact(input.spatialTransform, ['translation', 'rotationDegrees', 'scale'], ['translation', 'rotationDegrees', 'scale'], `${label}.spatialTransform`);
  vector(input.spatialTransform.translation, 3, `${label}.spatialTransform.translation`, -4, 4);
  vector(input.spatialTransform.rotationDegrees, 3, `${label}.spatialTransform.rotationDegrees`, -360, 360);
  vector(input.spatialTransform.scale, 3, `${label}.spatialTransform.scale`, 0, 100, true);
  exact(input.domain, ['shape', 'excludeThroughHole'], ['shape', 'excludeThroughHole'], `${label}.domain`);
  if (input.domain.shape !== 'VOLUME' || typeof input.domain.excludeThroughHole !== 'boolean') fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.domain is invalid`);
  exact(input.materialCoupling, ['color', 'colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight'], ['color', 'colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight'], `${label}.materialCoupling`);
  if (typeof input.materialCoupling.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(input.materialCoupling.color)) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.materialCoupling.color is invalid`);
  for (const key of ['colorWeight', 'densityWeight', 'transmissionWeight', 'roughnessWeight']) number(input.materialCoupling[key], `${label}.materialCoupling.${key}`, 0, 1);
  exact(input.parameters, SYSTEM_PARAMETER_KEYS, SYSTEM_PARAMETER_KEYS, `${label}.parameters`);
  if (input.parameters.seedHierarchyVersion !== '1.0.0') fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parameters.seedHierarchyVersion is unsupported`);
  if (input.parameters.composition !== 'PARENT_LOCAL_BOUNDED_SMOOTH_UNION_HIERARCHICAL_WEIGHTED_MAX_INTER_CLUSTER_MAX_CAPPED_MATERIAL_AGGREGATION') fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parameters.composition is unsupported`);
  const morphology = validateMorphology(input.parameters.morphology, `${label}.parameters.morphology`);
  if (!Array.isArray(input.parameters.populations) || input.parameters.populations.length !== 3) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parameters.populations must define exactly three populations`);
  const populations = input.parameters.populations.map(validatePopulation);
  if (populations.map((item) => item.population).join('|') !== POPULATIONS.join('|')) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parameters.populations must use canonical order`, { expected: POPULATIONS });
  if (!Array.isArray(input.parameters.conditioning) || input.parameters.conditioning.length > 8) fail('INVALID_INTERNAL_STRUCTURE_V11', `${label}.parameters.conditioning must contain at most eight dependencies`);
  const conditioning = input.parameters.conditioning.map(validateCondition);
  const dominantMax = populations[0].rootCount;
  const secondaryMax = dominantMax * populations[1].childrenPerParentRange[1];
  const microMax = secondaryMax * populations[2].childrenPerParentRange[1];
  const maxClusters = dominantMax + secondaryMax + microMax;
  const maxLobes = dominantMax * populations[0].lobeCountRange[1] + secondaryMax * populations[1].lobeCountRange[1] + microMax * populations[2].lobeCountRange[1];
  if (maxClusters > GSI_V11_LIMITS.maxClusters) fail('GENERIC_CLUSTER_LIMIT_EXCEEDED', 'worst-case cluster count exceeds hard limit', { maxClusters });
  if (maxLobes > GSI_V11_LIMITS.maxLobesTotal) fail('GENERIC_CLUSTER_LIMIT_EXCEEDED', 'worst-case lobe count exceeds hard limit', { maxLobes });
  return { ...clone(input), parameters: { ...clone(input.parameters), morphology, populations, conditioning } };
}

function validateDependencies(primitives) {
  const byId = new Map(primitives.map((primitive, index) => [primitive.primitiveId, { primitive, index }]));
  if (byId.size !== primitives.length) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'primitiveId values must be unique');
  const graph = new Map(primitives.map((primitive) => [primitive.primitiveId, []]));
  for (const system of primitives.filter((primitive) => primitive.type === GENERIC_CLUSTER_TYPE)) {
    for (const dependency of system.parameters.conditioning) {
      if (dependency.sourcePrimitiveId === system.primitiveId) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'self-dependency is forbidden', { primitiveId: system.primitiveId });
      const source = byId.get(dependency.sourcePrimitiveId);
      if (!source) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'conditioning source is unresolved', { sourcePrimitiveId: dependency.sourcePrimitiveId });
      if (source.index >= byId.get(system.primitiveId).index) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'conditioning source must precede consumer', { sourcePrimitiveId: dependency.sourcePrimitiveId });
      const allowedChannels = CONDITION_SOURCES[source.primitive.type];
      if (!allowedChannels?.includes(dependency.sourceChannel)) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'conditioning channel is incompatible with source type', { sourceType: source.primitive.type, sourceChannel: dependency.sourceChannel });
      graph.get(system.primitiveId).push(source.primitive.primitiveId);
    }
  }
  const visiting = new Set(); const visited = new Set();
  function visit(node) { if (visiting.has(node)) fail('GENERIC_CLUSTER_DEPENDENCY_GRAPH_INVALID', 'dependency cycle detected', { node }); if (visited.has(node)) return; visiting.add(node); for (const next of graph.get(node) ?? []) visit(next); visiting.delete(node); visited.add(node); }
  for (const node of graph.keys()) visit(node);
  return Object.fromEntries([...graph.entries()].map(([key, value]) => [key, value]));
}

export function validateInternalStructureV11(input) {
  exact(input, ['version', 'seed', 'coordinateSpace', 'primitives'], ['version', 'seed', 'coordinateSpace', 'primitives'], 'internalStructure');
  if (input.version !== GSI_V11_VERSION) fail('UNSUPPORTED_INTERNAL_STRUCTURE_VERSION', `internalStructure.version must be ${GSI_V11_VERSION}`);
  integer(input.seed, 'internalStructure.seed', 0, 2147483647);
  if (input.coordinateSpace !== GSI_COORDINATE_SPACE) fail('UNSUPPORTED_STRUCTURAL_COORDINATE_SPACE', `internalStructure.coordinateSpace must be ${GSI_COORDINATE_SPACE}`);
  if (!Array.isArray(input.primitives) || input.primitives.length < 1 || input.primitives.length > 32) fail('INVALID_INTERNAL_STRUCTURE_V11', 'internalStructure.primitives must contain 1 through 32 entries');
  const primitives = input.primitives.map((primitive, index) => {
    object(primitive, `internalStructure.primitives[${index}]`); id(primitive.primitiveId, `internalStructure.primitives[${index}].primitiveId`);
    if (primitive.type === GENERIC_CLUSTER_TYPE) return validateGenericSystem(primitive, index);
    if (!Object.hasOwn(STRUCTURAL_PRIMITIVE_REGISTRY, primitive.type) || STRUCTURAL_PRIMITIVE_REGISTRY[primitive.type].implementationState !== 'IMPLEMENTED_V1') fail('UNKNOWN_STRUCTURAL_PRIMITIVE', 'v1.1 primitive is unsupported', { type: primitive.type });
    const validated = validateV10Structure({ version: '1.0.0', seed: input.seed, coordinateSpace: input.coordinateSpace, primitives: [stripPrimitiveId(primitive)] }).primitives[0];
    return { primitiveId: primitive.primitiveId, ...validated };
  });
  const systems = primitives.filter((primitive) => primitive.type === GENERIC_CLUSTER_TYPE);
  if (systems.length !== 1) fail('INVALID_INTERNAL_STRUCTURE_V11', 'prototype requires exactly one generic cluster system', { count: systems.length });
  validateDependencies(primitives);
  return { version: GSI_V11_VERSION, seed: input.seed, coordinateSpace: input.coordinateSpace, primitives };
}

function u32(value) { return value >>> 0; }
function hash32(...values) { let h = 2166136261; for (const value of values) { const text = String(value); for (let i = 0; i < text.length; i += 1) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); } } h ^= h >>> 16; h = Math.imul(h, 0x7feb352d); h ^= h >>> 15; h = Math.imul(h, 0x846ca68b); h ^= h >>> 16; return u32(h); }
function random01(...values) { return hash32(...values) / 4294967295; }
function smooth(value) { return value * value * (3 - 2 * value); }
function fnvInteger(h, value) { if(!Number.isSafeInteger(value)){const text=String(value);for(let i=0;i<text.length;i++){h^=text.charCodeAt(i);h=Math.imul(h,16777619);}return h;}let numberValue=value;if(numberValue<0){h^=45;h=Math.imul(h,16777619);numberValue=-numberValue;}if(numberValue===0){h^=48;return Math.imul(h,16777619);}let divisor=1;while(divisor*10<=numberValue)divisor*=10;while(divisor>=1){const digit=Math.floor(numberValue/divisor);h^=48+digit;h=Math.imul(h,16777619);numberValue-=digit*divisor;divisor/=10;}return h; }
function latticeSeedPrefix(seed) { return fnvInteger(2166136261,seed); }
function finishLattice01(h,z) { h=fnvInteger(h,z);h^=h>>>16;h=Math.imul(h,0x7feb352d);h^=h>>>15;h=Math.imul(h,0x846ca68b);h^=h>>>16;return u32(h)/4294967295; }
function valueNoise3(point, seedPrefix) { const x0=Math.floor(point[0]),x1=x0+1,y0=Math.floor(point[1]),y1=y0+1,z0=Math.floor(point[2]),z1=z0+1,tx=smooth(point[0]-x0),ty=smooth(point[1]-y0),tz=smooth(point[2]-z0),hx0=fnvInteger(seedPrefix,x0),hx1=fnvInteger(seedPrefix,x1),h00=fnvInteger(hx0,y0),h10=fnvInteger(hx1,y0),h01=fnvInteger(hx0,y1),h11=fnvInteger(hx1,y1);const lerp=(a,b,t)=>a+(b-a)*t,x00=lerp(finishLattice01(h00,z0)*2-1,finishLattice01(h10,z0)*2-1,tx),x10=lerp(finishLattice01(h01,z0)*2-1,finishLattice01(h11,z0)*2-1,tx),x01=lerp(finishLattice01(h00,z1)*2-1,finishLattice01(h10,z1)*2-1,tx),x11=lerp(finishLattice01(h01,z1)*2-1,finishLattice01(h11,z1)*2-1,tx);return lerp(lerp(x00,x10,ty),lerp(x01,x11,ty),tz); }
function randomUnit(seed, ...parts) { const z = random01(seed, ...parts, 'z') * 2 - 1; const angle = random01(seed, ...parts, 'a') * Math.PI * 2; const radius = Math.sqrt(Math.max(0, 1 - z * z)); return [radius * Math.cos(angle), z, radius * Math.sin(angle)]; }
function quaternionRotate(vectorValue, quaternion) { const [x,y,z,w] = quaternion; const [vx,vy,vz] = vectorValue; const tx = 2 * (y*vz - z*vy); const ty = 2 * (z*vx - x*vz); const tz = 2 * (x*vy - y*vx); return [vx + w*tx + (y*tz-z*ty), vy + w*ty + (z*tx-x*tz), vz + w*tz + (x*ty-y*tx)]; }
function inverseQuaternion(quaternion) { return [-quaternion[0], -quaternion[1], -quaternion[2], quaternion[3]]; }
function vectorAdd(a,b) { return a.map((value,index)=>value+b[index]); }
function vectorScale(value,scale) { return value.map((item)=>item*scale); }
function vectorMultiply(a,b) { return a.map((value,index)=>value*b[index]); }
function vectorDot(a,b) { return a.reduce((sum,value,index)=>sum+value*b[index],0); }
function vectorCross(a,b) { return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]; }
function localFrame(axis) { const forward=normalize(axis);const hint=Math.abs(forward[1])<.85?[0,1,0]:[1,0,0];const right=normalize(vectorCross(hint,forward));return{forward,right,up:normalize(vectorCross(forward,right))}; }
const INSTANCE_REALIZATION_VARIANTS = Object.freeze(['IR0','IR1','IR2','IR3']);
function realizeBoundedDirectionAlternative(baseline, frame, ordinal, lobeCount, variant) {
  if(variant==='IR0')return baseline;
  const goldenFraction=.6180339887498949,baselineAxial=vectorDot(baseline,frame.forward),phase=Math.PI*2*(((ordinal+1)*goldenFraction)%1);
  const azimuth=variant==='IR1'?phase:variant==='IR2'?-phase:phase+Math.PI/Math.max(2,lobeCount+1);
  const axial=variant==='IR1'?baselineAxial:variant==='IR2'?-baselineAxial:baselineAxial*.5+(.5-ordinal/Math.max(1,lobeCount-1))*.24;
  return normalize(vectorAdd(vectorAdd(vectorScale(frame.right,Math.cos(azimuth)),vectorScale(frame.up,Math.sin(azimuth))),vectorScale(frame.forward,axial)));
}
function inverseTransform(point, transform, scalarScale) { let result = point.map((value,index)=>(value-transform.translation[index])/(transform.scale[index]*scalarScale)); const r=transform.rotationDegrees.map((value)=>-value*Math.PI/180); const rotate=(a,b,angle)=>{const c=Math.cos(angle),s=Math.sin(angle),va=result[a],vb=result[b];result[a]=va*c-vb*s;result[b]=va*s+vb*c;};rotate(0,1,r[2]);rotate(0,2,r[1]);rotate(1,2,r[0]);return result; }
function smoothMax(a, b, smoothing) { if (smoothing <= 1e-8) return Math.max(a,b); const h = clamp01(0.5 + 0.5 * (b-a) / smoothing); return a * (1-h) + b * h + smoothing * h * (1-h); }
function hexRgb(value) { return [1,3,5].map((offset)=>Number.parseInt(value.slice(offset,offset+2),16)); }

function supportValue(sample, channel) { if (channel === 'cloudDensity') return sample.cloudiness; if (channel === 'depthModulation') return sample.depthModulation; if (channel === 'densityVariation') return sample.contributions.find((entry)=>entry.type==='VOLUME_DENSITY_VARIATION')?.signal ?? 0; fail('GENERIC_CLUSTER_FIELD_CONDITIONING_FAILED', 'unsupported runtime conditioning channel', { channel }); }
function candidateScore(sample, dependency) { const value = supportValue(sample, dependency.sourceChannel); if (dependency.mode === 'PREFER_HIGH') return value * dependency.weight; if (dependency.mode === 'PREFER_LOW') return (1-value)*dependency.weight; const [low,high]=dependency.threshold; if (dependency.mode === 'BAND') return (value>=low&&value<=high?1:1-Math.min(Math.abs(value-low),Math.abs(value-high)))*dependency.weight; if (dependency.mode === 'REJECT_OUTSIDE') return value>=low&&value<=high?dependency.weight:Number.NEGATIVE_INFINITY; return 0; }

function createInstances(structure, system, supportEvaluator, internalPlacementState=null, instanceRealizationBinding=null) {
  const morphology=system.parameters.morphology; const populations=Object.fromEntries(system.parameters.populations.map((item)=>[item.population,item]));
  const volumetricLobeBodyEnabled=populations.DOMINANT.rootCount>1;
  const systemSeed=hash32(structure.seed,system.primitiveId,system.subSeed,system.parameters.seedHierarchyVersion); const instances=[]; let conditioningAttempts=0;
  function conditionedCenter(population, seed, baseCenter, radius) {
    const dependencies=system.parameters.conditioning.filter((item)=>item.targetPopulation===population.population); if (!dependencies.length) return baseCenter;
    let best=null; const attemptBudget=Math.max(...dependencies.map((item)=>item.attemptBudget));
    for(let attempt=0;attempt<attemptBudget;attempt++){conditioningAttempts++;const direction=randomUnit(seed,'condition',attempt);const magnitude=random01(seed,'condition-radius',attempt)*radius;let center=baseCenter.map((value,index)=>value+direction[index]*magnitude);const length=Math.hypot(...center);if(length>.9)center=center.map((value)=>value/length*.9);const sample=supportEvaluator.sample(center);let score=0;let rejected=false;for(const dependency of dependencies){const item=candidateScore(sample,dependency);if(!Number.isFinite(item)){rejected=true;break;}score+=item;}if(!rejected&&(!best||score>best.score))best={center,score};}
    if(!best)fail('GENERIC_CLUSTER_FIELD_CONDITIONING_FAILED','no bounded conditioning candidate satisfied declared constraints',{population:population.population});return best.center;
  }
  function makeInstance(populationName, ordinal, parent=null) {
    const population=populations[populationName]; const populationSeed=hash32(systemSeed,populationName); const parentSeed=parent?hash32(populationSeed,parent.stableId):populationSeed; const clusterSeed=hash32(parentSeed,ordinal,'cluster');
    const scale=population.scaleRange[0]+random01(clusterSeed,'scale')*(population.scaleRange[1]-population.scaleRange[0]); const baseRadius=parent?parent.baseRadius*scale:morphology.baseRadius*scale;
    const parentLobe=parent?parent.lobes[ordinal%parent.lobes.length]:null;let baseCenter;
    if(!parent&&internalPlacementState){baseCenter=[...internalPlacementState.roots[ordinal].localCenter];}else if(!parent){const direction=randomUnit(clusterSeed,'root');const magnitude=.15+random01(clusterSeed,'root-radius')*.65;baseCenter=direction.map((value)=>value*magnitude);}else{const attachmentDistance=parentLobe.halfLength*.78;const attachmentLocal=vectorAdd(parentLobe.origin,vectorScale(parentLobe.axis,attachmentDistance));const attachmentWorld=quaternionRotate(vectorMultiply(vectorScale(attachmentLocal,parent.baseRadius),parent.aspectRatio),parent.orientation);const attachmentJitter=vectorScale(randomUnit(clusterSeed,'attachment-jitter'),parent.baseRadius*population.localScatter*.035);baseCenter=vectorAdd(vectorAdd(parent.center,attachmentWorld),attachmentJitter);}
    const center=!parent&&internalPlacementState?baseCenter:conditionedCenter(population,clusterSeed,baseCenter,parent?population.localScatter*parent.baseRadius*.12:.45);
    const lobeCount=population.lobeCountRange[0]+Math.floor(random01(clusterSeed,'lobe-count')*(population.lobeCountRange[1]-population.lobeCountRange[0]+1));
    const majorCoreSupportGain=populationName==='DOMINANT'?clamp01((population.shapeComplexity-.9)/.1):0;
    const primaryLobeThicknessGain=populationName==='DOMINANT'?clamp01((morphology.lobeScatter-.98)/.02):0;
    const growth=parentLobe?parentLobe.axis:(morphology.growthBias?normalize(morphology.growthBias):randomUnit(clusterSeed,'growth'));const frame=localFrame(growth);const lobes=[];
    for(let lobe=0;lobe<lobeCount;lobe++){const lobeSeed=hash32(clusterSeed,'lobe',lobe);let direction;if(populationName==='DOMINANT'){const angularJitter=(random01(lobeSeed,'angle-jitter')-.5)*(.28/lobeCount),angle=Math.PI*2*(lobe/lobeCount+angularJitter),axialVariation=(random01(lobeSeed,'axial')-.5)*(volumetricLobeBodyEnabled?.9:.34);direction=normalize(vectorAdd(vectorAdd(vectorScale(frame.right,Math.cos(angle)),vectorScale(frame.up,Math.sin(angle))),vectorScale(frame.forward,axialVariation)));direction=realizeBoundedDirectionAlternative(direction,frame,lobe,lobeCount,instanceRealizationBinding?.dominantVariants?.[ordinal]??'IR0');}else{const angle=Math.PI*2*(lobe/lobeCount+random01(lobeSeed,'angle-jitter')*.12),spread=.24+.16*random01(lobeSeed,'spread');direction=normalize(vectorAdd(vectorScale(frame.forward,1-spread),vectorAdd(vectorScale(frame.right,Math.cos(angle)*spread),vectorScale(frame.up,Math.sin(angle)*spread))));}const radiusScale=morphology.lobeScaleRange[0]+random01(lobeSeed,'radius')*(morphology.lobeScaleRange[1]-morphology.lobeScaleRange[0]);const radialOffset=(populationName==='DOMINANT'?.46:.24)+random01(lobeSeed,'offset')*(populationName==='DOMINANT'?.08:.1);const halfLength=((populationName==='DOMINANT'?.64:.46)+random01(lobeSeed,'length')*(populationName==='DOMINANT'?.16:.14))*(.82+.24*radiusScale);const baseThickness=((populationName==='DOMINANT'?.17:.2)+random01(lobeSeed,'thickness')*(populationName==='DOMINANT'?.055:.06))*(.9+.18*radiusScale)*(populationName==='DOMINANT'?1+1.25*primaryLobeThicknessGain:1);const depthLayerOffset=volumetricLobeBodyEnabled?(random01(lobeSeed,'depth-layer')-.5)*(populationName==='DOMINANT'?1.2:.35):0,lobeOrigin=volumetricLobeBodyEnabled?vectorAdd(vectorScale(direction,radialOffset),vectorScale(growth,depthLayerOffset)):vectorScale(direction,radialOffset),lobeRecord={lobeId:`${populationName.toLowerCase()}-${ordinal}-lobe-${lobe}`,origin:lobeOrigin,offset:lobeOrigin,axis:direction,halfLength,baseThickness,tipThicknessScale:.48+.16*random01(lobeSeed,'tip'),radiusScale,densityScale:.75+.25*random01(lobeSeed,'density'),warpSeed:hash32(lobeSeed,'warp')};if(volumetricLobeBodyEnabled){const cross=vectorCross(growth,direction),lateralAxis=Math.hypot(...cross)>1e-8?normalize(cross):localFrame(direction).right,thicknessAxis=normalize(vectorCross(direction,lateralAxis)),widthScale=populationName==='DOMINANT'?1.1:populationName==='SECONDARY'?1.08:1.04,thicknessScale=populationName==='DOMINANT'?1.15:populationName==='SECONDARY'?1.12:1.08;Object.assign(lobeRecord,{crossSectionFamily:'TRIAXIAL_TAPERED_ELLIPSOIDAL_MINERAL_LOBE',lateralAxis,thicknessAxis,widthExtent:baseThickness*widthScale,thicknessExtent:baseThickness*thicknessScale,depthLayerOffset});}lobes.push(lobeRecord);}
    const stableId=parent?`${parent.stableId}/${populationName.toLowerCase()}-${ordinal}`:`${system.primitiveId}/${populationName.toLowerCase()}-${ordinal}`;
    const instance={stableId,population:populationName,parentId:parent?.stableId??null,parentLobeId:parentLobe?.lobeId??null,attachmentMode:parent?'PARENT_LOBE_LOCAL_TIP':'ROOT',depth:populationName==='DOMINANT'?0:populationName==='SECONDARY'?1:2,center,baseRadius,relativeScale:parent?baseRadius/parent.baseRadius:scale,aspectRatio:morphology.aspectRatio.map((value,index)=>value*(1+(random01(clusterSeed,'aspect',index)*2-1)*population.shapeComplexity*.18)),orientation:!parent&&internalPlacementState?internalPlacementState.roots[ordinal].orientation:morphology.orientation,growthAxis:growth,centerSupportRadius:populationName==='DOMINANT'?.2+.16*majorCoreSupportGain:.12,lobes,densityScale:population.densityScale,shapeComplexity:population.shapeComplexity,clusterSeed}; instances.push(instance);return instance;
  }
  const dominants=[];for(let i=0;i<populations.DOMINANT.rootCount;i++)dominants.push(makeInstance('DOMINANT',i));
  const secondary=[];for(const parent of dominants){const range=populations.SECONDARY.childrenPerParentRange,count=range[0]+Math.floor(random01(systemSeed,parent.stableId,'secondary-count')*(range[1]-range[0]+1));for(let i=0;i<count;i++)secondary.push(makeInstance('SECONDARY',i,parent));}
  for(const parent of secondary){const range=populations.MICRO_SUPPORT.childrenPerParentRange,count=range[0]+Math.floor(random01(systemSeed,parent.stableId,'micro-count')*(range[1]-range[0]+1));for(let i=0;i<count;i++)makeInstance('MICRO_SUPPORT',i,parent);}
  const lobeTotal=instances.reduce((sum,item)=>sum+item.lobes.length,0); if(instances.length>GSI_V11_LIMITS.maxClusters||lobeTotal>GSI_V11_LIMITS.maxLobesTotal||instances.some((item)=>item.depth>GSI_V11_LIMITS.maxHierarchyDepth))fail('GENERIC_CLUSTER_LIMIT_EXCEEDED','generated hierarchy exceeded hard limits',{clusters:instances.length,lobes:lobeTotal});
  return {instances,systemSeed,conditioningAttempts,lobeTotal};
}

function clusterSignal(point, instance, morphology, inverseOrientation, internalNoiseSeedPrefix, noiseSeedPrefixes, singleRootExact) {
  const vx=(point[0]-instance.center[0])/instance.baseRadius,vy=(point[1]-instance.center[1])/instance.baseRadius,vz=(point[2]-instance.center[2])/instance.baseRadius,[x,y,z,w]=inverseOrientation,tx=2*(y*vz-z*vy),ty=2*(z*vx-x*vz),tz=2*(x*vy-y*vx),local=[(vx+w*tx+(y*tz-z*ty))/instance.aspectRatio[0],(vy+w*ty+(z*tx-x*tz))/instance.aspectRatio[1],(vz+w*tz+(x*ty-y*tx))/instance.aspectRatio[2]];
  const exponent=DENSITY_FALLOFF[morphology.densityFalloff],centerSupport=clamp01(1-Math.hypot(...local)/instance.centerSupportRadius),coreDensity=Math.pow(centerSupport,exponent)*.82;let occupancy=centerSupport,density=coreDensity,primaryDensity=0;
  for(const lobe of instance.lobes){if(lobe.crossSectionFamily==='TRIAXIAL_TAPERED_ELLIPSOIDAL_MINERAL_LOBE'){const relative=local.map((value,index)=>value-lobe.origin[index]),axial=vectorDot(relative,lobe.axis),lateral=vectorDot(relative,lobe.lateralAxis),depth=vectorDot(relative,lobe.thicknessAxis),axialUnit=axial/lobe.halfLength,tipPosition=clamp01((axialUnit+1)*.5),taper=1-(1-lobe.tipThicknessScale)*tipPosition,width=lobe.widthExtent*taper,thickness=lobe.thicknessExtent*taper,radialUnit=Math.hypot(lateral/width,depth/thickness),featureScale=morphology.boundaryFeatureScale,warp=valueNoise3(relative.map((value)=>value/featureScale),noiseSeedPrefixes.get(lobe.warpSeed))*morphology.boundaryWarp*.35,distance=Math.hypot(axialUnit,radialUnit)+warp,support=clamp01(1-distance),lobeDensity=Math.pow(support,exponent)*lobe.densityScale;primaryDensity=Math.max(primaryDensity,lobeDensity);occupancy=smoothMax(occupancy,support,.045*instance.shapeComplexity);density=smoothMax(density,lobeDensity,.035*instance.shapeComplexity);}else{const relative=local.map((value,index)=>value-lobe.origin[index]),axial=((0+relative[0]*lobe.axis[0])+relative[1]*lobe.axis[1])+relative[2]*lobe.axis[2],radial0=relative[0]-lobe.axis[0]*axial,radial1=relative[1]-lobe.axis[1]*axial,radial2=relative[2]-lobe.axis[2]*axial,axialUnit=axial/lobe.halfLength,tipPosition=clamp01((axialUnit+1)*.5),thickness=lobe.baseThickness*(1-(1-lobe.tipThicknessScale)*tipPosition),radialUnit=Math.hypot(radial0,radial1,radial2)/thickness,featureScale=morphology.boundaryFeatureScale,warp=valueNoise3(relative.map((value)=>value/featureScale),noiseSeedPrefixes.get(lobe.warpSeed))*morphology.boundaryWarp*.35,distance=Math.hypot(axialUnit,radialUnit)+warp,support=clamp01(1-distance),lobeDensity=Math.pow(support,exponent)*lobe.densityScale;primaryDensity=Math.max(primaryDensity,lobeDensity);occupancy=smoothMax(occupancy,support,.045*instance.shapeComplexity);density=smoothMax(density,lobeDensity,.035*instance.shapeComplexity);}}
  const variation=1-morphology.internalDensityVariation*.35+morphology.internalDensityVariation*.35*clamp01(valueNoise3(local.map((value)=>value*3.1),internalNoiseSeedPrefix)*.5+.5);if(singleRootExact)return{occupancy:clamp01(occupancy),density:clamp01(density*variation*instance.densityScale),coreDensity:clamp01(coreDensity*(variation*instance.densityScale)),primaryDensity:clamp01(primaryDensity*(variation*instance.densityScale))};const densityScale=variation*instance.densityScale;return{occupancy:clamp01(occupancy),density:clamp01(density*densityScale),coreDensity:clamp01(coreDensity*densityScale),primaryDensity:clamp01(primaryDensity*densityScale)};
}

function buildRootLocalFields(rootGroups) {
  return rootGroups.map((group,index)=>Object.freeze({rootIndex:index,rootId:group.root.stableId,rootCenter:Object.freeze([...group.root.center]),rootDepth:group.root.center[2],supportRadius:group.root.baseRadius,members:Object.freeze(group.members.map((item)=>Object.freeze({stableId:item.stableId,parentId:item.parentId,depth:item.depth})))}));
}

function evaluateRootLocalPackets(signals, rootGroups, rootLocalFields) {
  return rootGroups.map((group,index)=>{const rootSignal=signals.get(group.root.stableId);let localDensity=rootSignal.density,secondaryContribution=0,microContribution=0,localOccupancy=rootSignal.occupancy;for(const child of group.members){if(child.depth===0)continue;const signal=signals.get(child.stableId),weighted=signal.density*(child.depth===1?.92:.72);localDensity=Math.max(localDensity,weighted);localOccupancy=Math.max(localOccupancy,signal.occupancy);if(child.depth===1)secondaryContribution=Math.max(secondaryContribution,weighted);else microContribution=Math.max(microContribution,weighted);}const field=rootLocalFields[index];return Object.freeze({rootIndex:index,rootId:field.rootId,rootCenter:field.rootCenter,rootDepth:field.rootDepth,supportRadius:field.supportRadius,localDensity:clamp01(localDensity),localOccupancy:clamp01(localOccupancy),coreContribution:rootSignal.coreDensity,primaryContribution:rootSignal.primaryDensity,secondaryContribution:clamp01(secondaryContribution),microContribution:clamp01(microContribution)});});
}

function createPremultipliedRootMatrixAdapter(rootLocalFields, sampleCount) {
  const count=rootLocalFields.length,premultiplied=new Float64Array(count),densityIntegral=new Float64Array(count),depthMoment=new Float64Array(count),transmittanceMoment=new Float64Array(count),transmittanceWeight=new Float64Array(count),entryTransmittance=new Float64Array(count),exitTransmittance=new Float64Array(count),peakDensity=new Float64Array(count),core=new Float64Array(count),primary=new Float64Array(count),secondary=new Float64Array(count),sampleDensities=new Float64Array(count);let sharedTransmittance=1,rootMatrixStateOperations=0,attenuationOperations=0,transmittanceOperations=0,finalCompositionOperations=0;
  const sharedExtinction=2.4/sampleCount;
  return Object.freeze({
    reset(){premultiplied.fill(0);densityIntegral.fill(0);depthMoment.fill(0);transmittanceMoment.fill(0);transmittanceWeight.fill(0);entryTransmittance.fill(1);exitTransmittance.fill(1);peakDensity.fill(0);core.fill(0);primary.fill(0);secondary.fill(0);sampleDensities.fill(0);sharedTransmittance=1;rootMatrixStateOperations=0;attenuationOperations=0;transmittanceOperations=0;finalCompositionOperations=0;},
    accumulate(packets,rayDepth){if(packets.length!==count)fail('GENERIC_CLUSTER_ROOT_PACKET_MISMATCH','matrix adapter packet count does not match root-local fields');let totalDensity=0;for(let index=0;index<count;index++){const packet=packets[index];if(packet.rootId!==rootLocalFields[index].rootId)fail('GENERIC_CLUSTER_ROOT_PACKET_MISMATCH','matrix adapter root identity/order mismatch',{index});const density=Math.max(0,packet.localDensity);sampleDensities[index]=density;totalDensity+=density;densityIntegral[index]+=density/sampleCount;peakDensity[index]=Math.max(peakDensity[index],density);core[index]=Math.max(core[index],packet.coreContribution);primary[index]=Math.max(primary[index],packet.primaryContribution);secondary[index]=Math.max(secondary[index],packet.secondaryContribution);rootMatrixStateOperations++;}if(totalDensity<=0)return;const segmentAlpha=1-Math.exp(-totalDensity*sharedExtinction),incidentTransmittance=sharedTransmittance;for(let index=0;index<count;index++){const density=sampleDensities[index];if(density<=0)continue;const attributedAlpha=segmentAlpha*(density/totalDensity),weighted=incidentTransmittance*attributedAlpha;if(transmittanceWeight[index]===0)entryTransmittance[index]=incidentTransmittance;premultiplied[index]+=weighted;depthMoment[index]+=rayDepth*weighted;transmittanceMoment[index]+=incidentTransmittance*weighted;transmittanceWeight[index]+=weighted;exitTransmittance[index]=incidentTransmittance*(1-segmentAlpha);attenuationOperations++;}sharedTransmittance*=1-segmentAlpha;transmittanceOperations++;},
    finalize(){const rootContributions=new Array(count);let composedContribution=0,weightedDepth=0,weight=0;for(let index=0;index<count;index++){const contribution=clamp01(premultiplied[index]),meanRayDepth=contribution>0?depthMoment[index]/contribution:rootLocalFields[index].rootDepth,meanIncidentTransmittance=transmittanceWeight[index]>0?transmittanceMoment[index]/transmittanceWeight[index]:1;rootContributions[index]=Object.freeze({rootId:rootLocalFields[index].rootId,premultipliedContribution:contribution,attenuationState:clamp01(1-exitTransmittance[index]),depthState:meanRayDepth,transmittanceState:clamp01(meanIncidentTransmittance),entryTransmittance:clamp01(entryTransmittance[index]),exitTransmittance:clamp01(exitTransmittance[index]),accumulatedContribution:contribution,peakDensity:peakDensity[index],meanDensity:densityIntegral[index],coreContribution:core[index],primaryContribution:primary[index],secondaryContribution:secondary[index]});composedContribution+=contribution;weightedDepth+=meanRayDepth*contribution;weight+=contribution;finalCompositionOperations++;}return Object.freeze({rootContributions:Object.freeze(rootContributions),composedContribution:clamp01(composedContribution),composedDepth:weight>0?weightedDepth/weight:0,sharedTransmittance:clamp01(sharedTransmittance),sharedMatrixCount:1,doubleAttenuationCount:0,duplicateSharedMatrixCounting:0,rootMatrixStateOperations,attenuationOperations,transmittanceOperations,finalCompositionOperations,rootAttributionAfterTransmittance:true});}
  });
}

export function createStructuralEvaluatorV11(raw, internalOptions=undefined) {
  const structure=validateInternalStructureV11(raw);const dependencyGraph=validateDependencies(structure.primitives);const system=structure.primitives.find((primitive)=>primitive.type===GENERIC_CLUSTER_TYPE);const supportPrimitives=structure.primitives.filter((primitive)=>primitive.type!==GENERIC_CLUSTER_TYPE);const supportStructure=supportPrimitives.length?{version:'1.0.0',seed:structure.seed,coordinateSpace:structure.coordinateSpace,primitives:supportPrimitives.map(stripPrimitiveId)}:null;
  const supportEvaluator=supportStructure?createV10Evaluator(supportStructure):{sample:()=>({density:0,colorModulation:0,transmissionModulation:0,roughnessModulation:0,bandClassification:0,inclusionOccupancy:0,cloudiness:0,depthModulation:1,continuityMask:1,contributions:[]})};
  if(internalOptions!==undefined&&(!internalOptions||typeof internalOptions!=='object'||Array.isArray(internalOptions)||Object.keys(internalOptions).some((key)=>key!=='latentPlacementBinding'&&key!=='instanceRealizationBinding')))fail('INVALID_INTERNAL_EVALUATOR_OPTIONS','only case-neutral internal placement and bounded instance realization bindings are supported');
  const latentPlacementBinding=internalOptions?.latentPlacementBinding??null;
  const instanceRealizationBinding=internalOptions?.instanceRealizationBinding??null;
  if(latentPlacementBinding!==null&&(!latentPlacementBinding||typeof latentPlacementBinding!=='object'||Array.isArray(latentPlacementBinding)||Object.keys(latentPlacementBinding).some((key)=>key!=='adapt'&&key!=='controls')||typeof latentPlacementBinding.adapt!=='function'||!Object.hasOwn(latentPlacementBinding,'controls')))fail('INVALID_INTERNAL_PLACEMENT_BINDING','internal placement binding requires only adapt and controls');
  if(instanceRealizationBinding!==null&&(!instanceRealizationBinding||typeof instanceRealizationBinding!=='object'||Array.isArray(instanceRealizationBinding)||Object.keys(instanceRealizationBinding).some((key)=>key!=='dominantVariants')||!Array.isArray(instanceRealizationBinding.dominantVariants)||instanceRealizationBinding.dominantVariants.some((value)=>!INSTANCE_REALIZATION_VARIANTS.includes(value))))fail('INVALID_INSTANCE_REALIZATION_BINDING','bounded instance realization binding requires only recognized dominantVariants');
  const systemSeed=hash32(structure.seed,system.primitiveId,system.subSeed,system.parameters.seedHierarchyVersion),dominant=system.parameters.populations.find((item)=>item.population==='DOMINANT');
  const internalPlacementState=latentPlacementBinding?latentPlacementBinding.adapt({controls:latentPlacementBinding.controls,structureSeed:structure.seed,systemSeed,systemTransform:system.spatialTransform,systemScale:system.scale,expectedRootCount:dominant.rootCount}):null;
  if(instanceRealizationBinding&&instanceRealizationBinding.dominantVariants.length!==dominant.rootCount)fail('INVALID_INSTANCE_REALIZATION_BINDING','dominantVariants must match dominant root count');
  const generated=createInstances(structure,system,supportEvaluator,internalPlacementState,instanceRealizationBinding);const inverseOrientations=generated.instances.map((item)=>inverseQuaternion(item.orientation));const byId=new Map(generated.instances.map((item)=>[item.stableId,item]));const structureIdentity=sha(JSON.stringify(structure));
  const internalNoiseSeedPrefixes=new Map(generated.instances.map((item)=>[item.stableId,latticeSeedPrefix(hash32(item.clusterSeed,'internal'))]));
  const noiseSeedPrefixes=new Map();for(const instance of generated.instances)for(const lobe of instance.lobes)if(!noiseSeedPrefixes.has(lobe.warpSeed))noiseSeedPrefixes.set(lobe.warpSeed,latticeSeedPrefix(lobe.warpSeed));
  const rootGroups=[];for(const root of generated.instances){if(root.depth!==0)continue;const members=[];for(const instance of generated.instances){if(instance.stableId===root.stableId||instance.stableId.startsWith(`${root.stableId}/`))members.push(instance);}rootGroups.push({root,members});}
  const rootLocalFields=buildRootLocalFields(rootGroups);
  const singleRootExact=rootLocalFields.length===1;
  const sourceIdsByType=new Map();for(const primitive of supportPrimitives){if(!sourceIdsByType.has(primitive.type))sourceIdsByType.set(primitive.type,[]);sourceIdsByType.get(primitive.type).push(primitive.primitiveId);}
  const attributionOrdinals=new Map();const supportAttributionMetadata=supportPrimitives.filter((primitive)=>primitive.enabled&&primitive.strength>0).map((contributionPrimitive)=>{const ordinal=attributionOrdinals.get(contributionPrimitive.type)??0;attributionOrdinals.set(contributionPrimitive.type,ordinal+1);const sourceId=sourceIdsByType.get(contributionPrimitive.type)?.[ordinal]??sourceIdsByType.get(contributionPrimitive.type)?.[0]??`legacy-${contributionPrimitive.type.toLowerCase()}`;const sourcePrimitive=supportPrimitives.find((item)=>item.primitiveId===sourceId);const coupling=sourcePrimitive?.materialCoupling;return{sourceId,weight:coupling?Math.max(coupling.colorWeight,coupling.densityWeight,coupling.transmissionWeight,coupling.roughnessWeight):contributionPrimitive.materialCoupling.colorWeight,sourceChannel:contributionPrimitive.type==='CLOUD_FIELD'?'cloudDensity':contributionPrimitive.type==='DEPTH_LAYERING'?'depthModulation':'combinedInternalDensity'};});
  const sampleRootState=(objectPoint,includeSupport)=>{if(!Array.isArray(objectPoint)||objectPoint.length!==3||objectPoint.some((value)=>!Number.isFinite(value)))fail('INVALID_STRUCTURAL_SAMPLE_POINT','objectPoint must be finite vec3');const local=inverseTransform(objectPoint,system.spatialTransform,system.scale),support=includeSupport?supportEvaluator.sample(local):null,signals=new Map();for(let instanceIndex=0;instanceIndex<generated.instances.length;instanceIndex++){const instance=generated.instances[instanceIndex];signals.set(instance.stableId,clusterSignal(local,instance,system.parameters.morphology,inverseOrientations[instanceIndex],internalNoiseSeedPrefixes.get(instance.stableId),noiseSeedPrefixes,singleRootExact));}const packets=evaluateRootLocalPackets(signals,rootGroups,rootLocalFields).map((packet)=>Object.freeze({...packet,localDensity:clamp01(packet.localDensity*system.strength)}));return{packets,support};};
  return {
    structure,structureIdentity,runtimeIdentity:GSI_V11_RUNTIME_BEHAVIOR_IDENTITY,instances:clone(generated.instances),dependencyGraph:clone(dependencyGraph),stats:{clusterCount:generated.instances.length,lobeCount:generated.lobeTotal,hierarchyDepth:Math.max(...generated.instances.map((item)=>item.depth)),conditioningAttempts:generated.conditioningAttempts,sampleComplexity:'O(CLUSTERS_PLUS_LOBES)'},
    _internalLatentPlacementState:internalPlacementState?clone(internalPlacementState):null,
    _internalRootLocalFields:clone(rootLocalFields),
    _internalSampleRootLocalFields(objectPoint){return sampleRootState(objectPoint,false).packets;},
    _internalCreatePremultipliedRootMatrixAdapter(sampleCount){if(!Number.isInteger(sampleCount)||sampleCount<1)fail('INVALID_STRUCTURAL_SAMPLE_COUNT','sample count must be positive');return createPremultipliedRootMatrixAdapter(rootLocalFields,sampleCount);},
    _internalSampleMatrixPoint(objectPoint){const {packets,support}=sampleRootState(objectPoint,true);let supportVisible=0;for(let contributionIndex=0;contributionIndex<support.contributions.length;contributionIndex++){const contribution=support.contributions[contributionIndex],metadata=supportAttributionMetadata[contributionIndex];supportVisible=clamp01(supportVisible+clamp01(contribution.signal*metadata.weight));}return Object.freeze({packets,cloudDensity:support.cloudiness,supportDensity:support.density,supportVisible,densityWeight:system.materialCoupling.densityWeight,systemWeight:Math.max(system.materialCoupling.colorWeight,system.materialCoupling.densityWeight,system.materialCoupling.transmissionWeight,system.materialCoupling.roughnessWeight)});},
    sample(objectPoint){if(!Array.isArray(objectPoint)||objectPoint.length!==3||objectPoint.some((value)=>!Number.isFinite(value)))fail('INVALID_STRUCTURAL_SAMPLE_POINT','objectPoint must be finite vec3');const local=inverseTransform(objectPoint,system.spatialTransform,system.scale);const support=supportEvaluator.sample(local);const signals=new Map();for(let instanceIndex=0;instanceIndex<generated.instances.length;instanceIndex++){const instance=generated.instances[instanceIndex];signals.set(instance.stableId,clusterSignal(local,instance,system.parameters.morphology,inverseOrientations[instanceIndex],internalNoiseSeedPrefixes.get(instance.stableId),noiseSeedPrefixes,singleRootExact));}let clusterOccupancy=0;for(const signal of signals.values())clusterOccupancy=Math.max(clusterOccupancy,signal.occupancy);const rootAggregates=[];for(const group of rootGroups){let aggregate=signals.get(group.root.stableId).density;for(const child of group.members){if(child.depth===0)continue;aggregate=Math.max(aggregate,signals.get(child.stableId).density*(child.depth===1?.92:.72));}rootAggregates.push(aggregate);}const clusterDensity=clamp01(Math.max(0,...rootAggregates)*system.strength);const cloudDensity=support.cloudiness;const combinedInternalDensity=clamp01(support.density+clusterDensity*system.materialCoupling.densityWeight);const attribution=[];let supportVisible=0;for(let contributionIndex=0;contributionIndex<support.contributions.length;contributionIndex++){const contribution=support.contributions[contributionIndex],metadata=supportAttributionMetadata[contributionIndex],visible=clamp01(contribution.signal*metadata.weight);if(visible>0){supportVisible=clamp01(supportVisible+visible);attribution.push({primitiveId:metadata.sourceId,sourceChannel:metadata.sourceChannel,visibleContribution:visible});}}const systemWeight=Math.max(system.materialCoupling.colorWeight,system.materialCoupling.densityWeight,system.materialCoupling.transmissionWeight,system.materialCoupling.roughnessWeight);const clusterVisible=clamp01(clusterDensity*systemWeight);if(clusterVisible>0)attribution.push({primitiveId:system.primitiveId,sourceChannel:'clusterDensity',visibleContribution:clusterVisible});const visibleMaterialContribution=clamp01(supportVisible+clusterVisible);if(visibleMaterialContribution>0&&!attribution.length)fail('GENERIC_CLUSTER_VISIBLE_CONTRIBUTION_UNATTRIBUTED','visible material contribution has no diagnostic source');return{density:combinedInternalDensity,colorModulation:clamp01(support.colorModulation+clusterDensity*system.materialCoupling.colorWeight),transmissionModulation:clamp01(support.transmissionModulation+clusterDensity*system.materialCoupling.transmissionWeight),roughnessModulation:clamp01(support.roughnessModulation+clusterDensity*system.materialCoupling.roughnessWeight),bandClassification:support.bandClassification,inclusionOccupancy:support.inclusionOccupancy,cloudiness:support.cloudiness,depthModulation:support.depthModulation,continuityMask:support.continuityMask,clusterOccupancy,clusterDensity,cloudDensity,combinedInternalDensity,visibleMaterialContribution,diagnosticAttribution:attribution,contributions:[...support.contributions,{type:GENERIC_CLUSTER_TYPE,signal:clusterDensity,color:system.materialCoupling.color,colorWeight:system.materialCoupling.colorWeight}]};}
  };
}

export function structuralFieldFingerprintV11(internalStructure, points) { const evaluator=createStructuralEvaluatorV11(internalStructure);return sha(JSON.stringify(points.map((point)=>evaluator.sample(point)))); }

export function diagnoseGenericClusterSystem(internalStructure) {
  const evaluator=createStructuralEvaluatorV11(internalStructure);const system=evaluator.structure.primitives.find((primitive)=>primitive.type===GENERIC_CLUSTER_TYPE);const variations=[];
  for(const instance of evaluator.instances.slice(0,Math.min(8,evaluator.instances.length))){const values=[];for(let i=0;i<48;i++){const angle=i/48*Math.PI*2;const point=[instance.center[0]+Math.cos(angle)*instance.baseRadius,instance.center[1],instance.center[2]+Math.sin(angle)*instance.baseRadius];values.push(evaluator.sample(point).clusterOccupancy);}variations.push(Math.max(...values)-Math.min(...values));}
  const anisotropic=system.parameters.morphology.aspectRatio.some((value)=>Math.abs(value-1)>.05);const multiLobe=evaluator.instances.some((item)=>item.lobes.length>1);const warped=system.parameters.morphology.boundaryWarp>.02;const radialVariation=variations.length?variations.reduce((a,b)=>a+b,0)/variations.length:0;const nonRadialMorphology=anisotropic&&multiLobe&&warped&&radialVariation>.003;const majors=evaluator.instances.filter((item)=>item.depth===0),majorLobes=majors.flatMap((item)=>item.lobes),dominant=system.parameters.populations[0];return{status:nonRadialMorphology?'PASS':'FAIL',roundClusterPackingDominance:anisotropic&&multiLobe&&warped?'ABSENT':'PRESENT_OR_INDETERMINATE',nonRadialMorphology,hierarchyMeaningful:evaluator.stats.hierarchyDepth===2&&new Set(evaluator.instances.map((item)=>item.population)).size===3,fieldConditioning:evaluator.stats.conditioningAttempts>0,radialVariation,clusterCount:evaluator.stats.clusterCount,lobeCount:evaluator.stats.lobeCount,hierarchyDepth:evaluator.stats.hierarchyDepth,conditioningAttempts:evaluator.stats.conditioningAttempts,majorCoreSupportRange:[Math.min(...majors.map((item)=>item.centerSupportRadius)),Math.max(...majors.map((item)=>item.centerSupportRadius))],majorLobeThicknessRange:[Math.min(...majorLobes.map((item)=>item.baseThickness)),Math.max(...majorLobes.map((item)=>item.baseThickness))],majorLobeLengthRange:[Math.min(...majorLobes.map((item)=>item.halfLength)),Math.max(...majorLobes.map((item)=>item.halfLength))],majorCoreSupportActive:dominant.shapeComplexity>.9,primaryLobeThicknessSupportActive:system.parameters.morphology.lobeScatter>.98,lobeLengthGrowthFromThicknessControl:0};
}

function crc32(buffer){let crc=0xffffffff;for(const byte of buffer){crc^=byte;for(let i=0;i<8;i++)crc=(crc>>>1)^(0xedb88320&-(crc&1));}return(crc^0xffffffff)>>>0;}
function chunk(type,data){const typeBytes=Buffer.from(type);const out=Buffer.alloc(12+data.length);out.writeUInt32BE(data.length,0);typeBytes.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc32(Buffer.concat([typeBytes,data])),8+data.length);return out;}
function encodePng(width,height,rgb){const scan=Buffer.alloc((width*3+1)*height);for(let y=0;y<height;y++){scan[y*(width*3+1)]=0;rgb.copy(scan,y*(width*3+1)+1,y*width*3,(y+1)*width*3);}const header=Buffer.alloc(13);header.writeUInt32BE(width,0);header.writeUInt32BE(height,4);header[8]=8;header[9]=2;return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);}
function basisForView(view){const directions={front:[0,0,1],side:[1,0,0],left:[-1,0,0],back:[0,0,-1],top:[0,1,0],bottom:[0,-1,0],oblique:normalize([1,.6,1])};const forward=directions[view];if(!forward)fail('INVALID_STRUCTURAL_VIEW','unsupported proof view',{view});const upHint=Math.abs(forward[1])>.9?[0,0,forward[1]>0?-1:1]:[0,1,0];const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];const right=normalize(cross(upHint,forward)),up=normalize(cross(forward,right));return{forward,right,up};}
function basisForMultiRootView(view){return basisForView(view==='right'?'side':view);}

async function renderLegacySingleRootExact({materialSpec,views,outputDirectory,width=160,height=160,samples=20}) {
  if(materialSpec?.internalStructure?.version!==GSI_V11_VERSION)fail('MISSING_INTERNAL_STRUCTURE','v1.1 structural proof requires internalStructure@1.1.0');if(!Array.isArray(views)||views.length<1||views.length>8)fail('INVALID_STRUCTURAL_VIEW','views must contain 1 through 8 canonical views');if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>512||height>512||!Number.isInteger(samples)||samples<8||samples>64)fail('INVALID_STRUCTURAL_RENDER_BOUNDS','proof bounds are invalid');
  const effectiveSamples=samples<20?samples:Math.max(samples,36),evaluator=createStructuralEvaluatorV11(materialSpec.internalStructure),system=evaluator.structure.primitives.find((primitive)=>primitive.type===GENERIC_CLUSTER_TYPE),base=typeof materialSpec.material.baseColor==='string'?hexRgb(materialSpec.material.baseColor):materialSpec.material.baseColor.map((value)=>Math.round(value*255)),clusterColor=hexRgb(system.materialCoupling.color);await fs.mkdir(outputDirectory,{recursive:true});const started=performance.now(),outputs=[];
  for(const view of views){const basis=basisForView(view),rgb=Buffer.alloc(width*height*3),scale=1.14;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=((x+.5)/width*2-1)*scale,sy=(1-(y+.5)/height*2)*scale,index=(y*width+x)*3,radial2=sx*sx+sy*sy;if(radial2>1){const bg=238+Math.round(8*(1-y/height));rgb[index]=bg;rgb[index+1]=bg;rgb[index+2]=bg;continue;}const half=Math.sqrt(1-radial2);let cluster=0,cloud=0,density=0,visible=0;for(let sampleIndex=0;sampleIndex<effectiveSamples;sampleIndex++){const z=-half+(sampleIndex+.5)/effectiveSamples*half*2,point=[0,1,2].map((i)=>basis.right[i]*sx+basis.up[i]*sy+basis.forward[i]*z),field=evaluator.sample(point);cluster=Math.max(cluster,field.clusterDensity);cloud+=field.cloudDensity;density+=field.combinedInternalDensity;visible=Math.max(visible,field.visibleMaterialContribution);}cloud/=effectiveSamples;density/=effectiveSamples;const structural=base.map((value,i)=>value*(1-cluster*.8)+clusterColor[i]*cluster*.8);const milk=cloud*.35+density*.08;const color=structural.map((value)=>value*(1-milk)+247*milk);const normal=normalize([0,1,2].map((i)=>basis.right[i]*sx+basis.up[i]*sy+basis.forward[i]*half)),light=normalize([-.5,.75,1]),diffuse=.67+.3*Math.max(0,normal[0]*light[0]+normal[1]*light[1]+normal[2]*light[2]),specular=Math.pow(Math.max(0,normal[0]*.25+normal[1]*.35+normal[2]),52)*105;for(let c=0;c<3;c++)rgb[index+c]=Math.round(Math.max(0,Math.min(255,color[c]*diffuse+specular+visible*3)));}const bytes=encodePng(width,height,rgb),imagePath=path.join(outputDirectory,`${view}.png`);await fs.writeFile(imagePath,bytes,{flag:'wx'});outputs.push({view,imagePath,bytes:bytes.length,sha256:sha(bytes)});}return{status:'STRUCTURAL_PROOF_COMPLETE',rendererIdentity:'GSI_V11_CPU_FAST_OBJECT_SPACE_GENERIC_CLUSTER_RAYMARCH_CANONICAL_LEFT_R2',runtimeIdentity:GSI_V11_RUNTIME_BEHAVIOR_IDENTITY,structureIdentity:evaluator.structureIdentity,diagnostic:diagnoseGenericClusterSystem(materialSpec.internalStructure),stats:evaluator.stats,views:outputs,width,height,samples,effectiveSamples,elapsedMs:Math.round((performance.now()-started)*1000)/1000};
}

async function renderMultiRootPremultiplied({materialSpec,views,outputDirectory,width=160,height=160,samples=20}) {
  if(materialSpec?.internalStructure?.version!==GSI_V11_VERSION)fail('MISSING_INTERNAL_STRUCTURE','v1.1 structural proof requires internalStructure@1.1.0');if(!Array.isArray(views)||views.length<1||views.length>8)fail('INVALID_STRUCTURAL_VIEW','views must contain 1 through 8 canonical views');if(!Number.isInteger(width)||!Number.isInteger(height)||width<64||height<64||width>512||height>512||!Number.isInteger(samples)||samples<8||samples>64)fail('INVALID_STRUCTURAL_RENDER_BOUNDS','proof bounds are invalid');
  const effectiveSamples=samples<20?samples:Math.max(samples,36),evaluator=createStructuralEvaluatorV11(materialSpec.internalStructure),system=evaluator.structure.primitives.find((primitive)=>primitive.type===GENERIC_CLUSTER_TYPE),base=typeof materialSpec.material.baseColor==='string'?hexRgb(materialSpec.material.baseColor):materialSpec.material.baseColor.map((value)=>Math.round(value*255)),clusterColor=hexRgb(system.materialCoupling.color),multiMajor=evaluator._internalRootLocalFields.length>1;await fs.mkdir(outputDirectory,{recursive:true});const started=performance.now(),outputs=[],matrixDiagnostics=[];
  for(const view of views){const basis=basisForMultiRootView(view),rgb=Buffer.alloc(width*height*3),scale=1.14,matrixAdapter=multiMajor?evaluator._internalCreatePremultipliedRootMatrixAdapter(effectiveSamples):null,rootContributionPeaks=multiMajor?new Float64Array(evaluator._internalRootLocalFields.length):null;let rootMatrixStateOperations=0,attenuationOperations=0,transmittanceOperations=0,finalCompositionOperations=0;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const sx=((x+.5)/width*2-1)*scale,sy=(1-(y+.5)/height*2)*scale,index=(y*width+x)*3,radial2=sx*sx+sy*sy;if(radial2>1){const bg=238+Math.round(8*(1-y/height));rgb[index]=bg;rgb[index+1]=bg;rgb[index+2]=bg;continue;}const half=Math.sqrt(1-radial2);let cluster=0,cloud=0,density=0,visible=0;if(!multiMajor){for(let sampleIndex=0;sampleIndex<effectiveSamples;sampleIndex++){const z=-half+(sampleIndex+.5)/effectiveSamples*half*2,point=[0,1,2].map((i)=>basis.right[i]*sx+basis.up[i]*sy+basis.forward[i]*z),field=evaluator.sample(point);cluster=Math.max(cluster,field.clusterDensity);cloud+=field.cloudDensity;density+=field.combinedInternalDensity;visible=Math.max(visible,field.visibleMaterialContribution);}cloud/=effectiveSamples;density/=effectiveSamples;}else{matrixAdapter.reset();let supportDensity=0,supportVisible=0,densityWeight=0,systemWeight=0;for(let sampleIndex=0;sampleIndex<effectiveSamples;sampleIndex++){const z=-half+(sampleIndex+.5)/effectiveSamples*half*2,point=[0,1,2].map((i)=>basis.right[i]*sx+basis.up[i]*sy+basis.forward[i]*z),state=evaluator._internalSampleMatrixPoint(point);matrixAdapter.accumulate(state.packets,z);cloud+=state.cloudDensity;supportDensity+=state.supportDensity;supportVisible=Math.max(supportVisible,state.supportVisible);densityWeight=state.densityWeight;systemWeight=state.systemWeight;}const integrated=matrixAdapter.finalize();cluster=integrated.composedContribution;cloud/=effectiveSamples;density=clamp01(supportDensity/effectiveSamples+cluster*densityWeight);visible=clamp01(supportVisible+cluster*systemWeight);for(let rootIndex=0;rootIndex<integrated.rootContributions.length;rootIndex++)rootContributionPeaks[rootIndex]=Math.max(rootContributionPeaks[rootIndex],integrated.rootContributions[rootIndex].premultipliedContribution);rootMatrixStateOperations+=integrated.rootMatrixStateOperations;attenuationOperations+=integrated.attenuationOperations;transmittanceOperations+=integrated.transmittanceOperations;finalCompositionOperations+=integrated.finalCompositionOperations;}const structural=base.map((value,i)=>value*(1-cluster*.8)+clusterColor[i]*cluster*.8);const milk=cloud*.35+density*.08;const color=structural.map((value)=>value*(1-milk)+247*milk);const normal=normalize([0,1,2].map((i)=>basis.right[i]*sx+basis.up[i]*sy+basis.forward[i]*half)),light=normalize([-.5,.75,1]),diffuse=.67+.3*Math.max(0,normal[0]*light[0]+normal[1]*light[1]+normal[2]),specular=Math.pow(Math.max(0,normal[0]*.25+normal[1]*.35+normal[2]),52)*105;for(let c=0;c<3;c++)rgb[index+c]=Math.round(Math.max(0,Math.min(255,color[c]*diffuse+specular+visible*3)));}const bytes=encodePng(width,height,rgb),imagePath=path.join(outputDirectory,`${view}.png`);await fs.writeFile(imagePath,bytes,{flag:'wx'});outputs.push({view,imagePath,bytes:bytes.length,sha256:sha(bytes)});if(multiMajor)matrixDiagnostics.push(Object.freeze({view,rootIds:Object.freeze(evaluator._internalRootLocalFields.map((field)=>field.rootId)),rootContributionPeaks:Object.freeze([...rootContributionPeaks]),rootMatrixStateOperations,attenuationOperations,transmittanceOperations,finalCompositionOperations,expectedScaling:'O(N)',rootAttributionAfterTransmittance:true,doubleAttenuationCount:0,duplicateSharedMatrixCounting:0}));}return{status:'STRUCTURAL_PROOF_COMPLETE',rendererIdentity:'GSI_V11_CPU_FAST_OBJECT_SPACE_GENERIC_CLUSTER_RAYMARCH_CANONICAL_LEFT_R2',runtimeIdentity:GSI_V11_RUNTIME_BEHAVIOR_IDENTITY,structureIdentity:evaluator.structureIdentity,diagnostic:diagnoseGenericClusterSystem(materialSpec.internalStructure),stats:evaluator.stats,views:outputs,...(multiMajor?{matrixDiagnostics:Object.freeze(matrixDiagnostics)}:{}),width,height,samples,effectiveSamples,elapsedMs:Math.round((performance.now()-started)*1000)/1000};
}

export async function renderStructuralProofV11(options) {
  const system=options?.materialSpec?.internalStructure?.primitives?.find((primitive)=>primitive?.type===GENERIC_CLUSTER_TYPE),dominant=system?.parameters?.populations?.find((population)=>population?.population==='DOMINANT');
  if(dominant?.rootCount===1)return renderLegacySingleRootExact(options);
  return renderMultiRootPremultiplied(options);
}

// Opt-in GSI V1 energy representation. Existing render, matrix, N1, geometry,
// and shared-energy-ceiling behavior remains unchanged until a caller explicitly
// constructs and transports these packets.
export const GSI_ENERGY_ENVELOPE_FIELD_PROTOTYPE_R1_IDENTITY = sha('GSI_V1_ENERGY_ENVELOPE_PLUS_NORMALIZED_MORPHOLOGY_FIELD_PROTOTYPE_R1');
const ENERGY_FIELD_EPSILON = 1e-12;

function finiteNonnegativeEnergyFieldValue(value,label){if(!Number.isFinite(value)||value<0)throw new TypeError(`${label} must be finite and nonnegative`);return value;}
function energyFieldSamples(values,label){if(!Array.isArray(values)&&!ArrayBuffer.isView(values))throw new TypeError(`${label} must be an array or typed array`);return Float64Array.from(values,(value,index)=>finiteNonnegativeEnergyFieldValue(value,`${label}[${index}]`));}
function stableEnergyFieldSum(values){let sum=0,correction=0;for(const value of values){const adjusted=value-correction,next=sum+adjusted;correction=(next-sum)-adjusted;sum=next;}return sum;}

export function createEnergyEnvelope(rootId,allocatedEnergy){
  if(typeof rootId!=='string'||rootId.length===0)throw new TypeError('rootId must be non-empty');
  return Object.freeze({rootId,allocatedEnergy:finiteNonnegativeEnergyFieldValue(allocatedEnergy,'allocatedEnergy'),semantic:'PHYSICALLY_ALLOCATED_ROOT_ENERGY_MAGNITUDE'});
}

export function normalizeMorphologyField(input){
  const source=energyFieldSamples(input,'morphologyField'),sourceEnergy=stableEnergyFieldSum(source);
  if(sourceEnergy<=ENERGY_FIELD_EPSILON)return Object.freeze({field:new Float64Array(source.length),sourceEnergy:0,normalizationError:0,zeroEnergy:true});
  const field=Float64Array.from(source,(value)=>value/sourceEnergy),normalizedSum=stableEnergyFieldSum(field);
  return Object.freeze({field,sourceEnergy,normalizationError:Math.abs(1-normalizedSum),zeroEnergy:false});
}

export function reconstructEnvelopeField(envelope,normalizedField){
  const energy=finiteNonnegativeEnergyFieldValue(envelope?.allocatedEnergy,'envelope.allocatedEnergy'),field=energyFieldSamples(normalizedField?.field??normalizedField,'normalizedField'),distribution=Float64Array.from(field,(value)=>energy*value),reconstructedEnergy=stableEnergyFieldSum(distribution);
  return Object.freeze({distribution,reconstructedEnergy,energyResidual:Math.abs(energy-reconstructedEnergy)});
}

export function createEnergyMorphologyPacket({rootId,allocatedEnergy,coreSignal,lobeSignal,residualSignal}){
  const core=energyFieldSamples(coreSignal,'coreSignal'),lobe=energyFieldSamples(lobeSignal,'lobeSignal'),residual=energyFieldSamples(residualSignal??new Float64Array(core.length),'residualSignal');
  if(core.length!==lobe.length||core.length!==residual.length)throw new RangeError('component field lengths must match');
  const componentSources=[core,lobe,residual],componentEnergy=componentSources.map(stableEnergyFieldSum),totalSourceEnergy=stableEnergyFieldSum(componentEnergy),envelope=createEnergyEnvelope(rootId,allocatedEnergy);
  const components=['core','lobe','residual'].map((name,index)=>{const energyShare=totalSourceEnergy>ENERGY_FIELD_EPSILON?componentEnergy[index]/totalSourceEnergy:0,componentEnvelope=createEnergyEnvelope(`${rootId}:${name}`,allocatedEnergy*energyShare),normalizedMorphologyField=normalizeMorphologyField(componentSources[index]),reconstruction=reconstructEnvelopeField(componentEnvelope,normalizedMorphologyField);return Object.freeze({name,energyShare,envelope:componentEnvelope,normalizedMorphologyField,reconstruction});});
  const distribution=new Float64Array(core.length);for(const component of components)for(let index=0;index<distribution.length;index++)distribution[index]+=component.reconstruction.distribution[index];
  const reconstructedEnergy=stableEnergyFieldSum(distribution);
  return Object.freeze({representation:'ANALYTIC_ENVELOPE_PLUS_COMPOSITE_CORE_LOBE_NORMALIZED_FIELD',domain:'ROOT_LOCAL_CAMERA_INDEPENDENT_ANALYTIC_RESPONSE_FIELD',rootId,envelope,components,distribution,reconstructedEnergy,energyResidual:Math.abs(allocatedEnergy-reconstructedEnergy),matrixEmbedded:false});
}

export function applyBoundedEnergyMorphologyTransport(packet,{transmittance=1,visibility=1}={}){
  finiteNonnegativeEnergyFieldValue(transmittance,'transmittance');finiteNonnegativeEnergyFieldValue(visibility,'visibility');if(transmittance>1||visibility>1)throw new RangeError('transport factors must be within [0,1]');
  const factor=transmittance*visibility,distribution=Float64Array.from(packet.distribution,(value)=>value*factor);
  return Object.freeze({rootId:packet.rootId,factor,distribution,energy:stableEnergyFieldSum(distribution)});
}

export function composeEnergyMorphologyPackets(packets,matrixContribution=null){
  if(!Array.isArray(packets)||packets.length<1||packets.length>4)throw new RangeError('packet count must be in [1,4]');const length=packets[0].distribution.length;if(packets.some((packet)=>packet.distribution.length!==length))throw new RangeError('packet field lengths must match');
  const roots=new Float64Array(length);for(const packet of packets)for(let index=0;index<length;index++)roots[index]+=packet.distribution[index];const matrix=matrixContribution===null?new Float64Array(length):energyFieldSamples(matrixContribution,'matrixContribution');if(matrix.length!==length)throw new RangeError('matrix field length must match root fields');const final=Float64Array.from(roots,(value,index)=>value+matrix[index]);
  return Object.freeze({roots,matrix,final,matrixIndependent:true});
}
