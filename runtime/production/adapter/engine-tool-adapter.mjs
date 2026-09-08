import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  StructuralIdentityError,
  renderStructuralProof,
  validateInternalStructure,
} from '../structural/structural-identity-dispatch.mjs';

const ADAPTER_DIR = path.dirname(fileURLToPath(import.meta.url));
const CAPABILITIES_PATH = path.join(ADAPTER_DIR, 'engine-capabilities.json');
const TOP_LEVEL_KEYS = ['family', 'features', 'geometry', 'material', 'internalStructure', 'environment', 'camera', 'optimization', 'notes'];
const REQUIRED_TOP_LEVEL_KEYS = ['family', 'features', 'geometry', 'material', 'environment', 'camera', 'optimization', 'notes'];
const MATERIAL_KEYS = ['baseColor', 'metalness', 'roughness', 'transmission', 'ior', 'attenuationColor', 'attenuationDistance', 'dispersion', 'thickness', 'extensions'];
const REQUIRED_MATERIAL_KEYS = ['baseColor', 'metalness', 'roughness', 'transmission', 'ior', 'attenuationColor', 'attenuationDistance', 'dispersion', 'thickness'];
const ENGINE_EXTENSION_KEYS = ['materialName', 'specularIntensity', 'clearcoat', 'clearcoatRoughness', 'envMapIntensity', 'mineralLabel', 'purpose'];
const ENGINE_IDENTITIES = Object.freeze({
  'package.json': 'BA8D2A69E15DF23831F0E5644D193514CB3BF071751AD4E8A4C726DC2CC9C14A',
  'build-gemstone-mutator-v1.mjs': '80D354DA0500035A662827580B18D133886833F1FF0C4A01A74605886D70E265',
  'mutator-interface-v1.mjs': 'BCEB04B8E8D04BFDEC12328DE57C7C28B6A5D713DD7B990833E641B0F676D482',
  'audit-glb.mjs': '13D483F7E61410EC929FD342E2127B16EC20F918D7C70776DEF8E09362192495',
  'render-generic-candidate-v1.mjs': 'DAAE64D2EEBB2E0CEA2519432A768527BD78EB3CC7B7E3B2538F71CBD9AF7C10',
  'generic-render.html': 'AE26006B5D24E61FB1D5667513DAD8362D5A2E98156D6C130D52FA12CC0EB866',
  'generic-render.mjs': '2D66F016B96AB162C3E9B134F5C5D09337CC664C8F02E656779DF368F8AE80DD',
});

export class AdapterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'AdapterError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new AdapterError(code, message, details);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertObject(value, label) {
  if (!isPlainObject(value)) fail('INVALID_MATERIAL_SPEC', `${label} must be an object`);
}

function assertExactKeys(value, allowed, required, label, code = 'INVALID_MATERIAL_SPEC') {
  assertObject(value, label);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length) fail(code, `${label} contains unsupported keys`, { keys: unknown });
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (missing.length) fail('INVALID_MATERIAL_SPEC', `${label} is missing required keys`, { keys: missing });
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') fail('INVALID_MATERIAL_SPEC', `${label} must be a non-empty string`);
  return value.trim();
}

function assertNumber(value, label, minimum, maximum, exclusiveMinimum = false) {
  if (!Number.isFinite(value)) fail('INVALID_MATERIAL_SPEC', `${label} must be finite`);
  if ((exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
    fail('INVALID_MATERIAL_SPEC', `${label} is outside the supported domain`, { minimum, maximum, exclusiveMinimum, value });
  }
  return value;
}

function assertInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail('INVALID_MATERIAL_SPEC', `${label} must be an integer in the supported domain`, { minimum, maximum, value });
  }
  return value;
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

function validateColor(value, label) {
  if (typeof value === 'string') {
    if (!/^#[0-9A-Fa-f]{6}$/.test(value)) fail('INVALID_MATERIAL_SPEC', `${label} must be #RRGGBB`);
    return value.toUpperCase();
  }
  if (!Array.isArray(value) || value.length !== 3) fail('INVALID_MATERIAL_SPEC', `${label} must be #RRGGBB or a linear RGB triplet`);
  return value.map((channel, index) => assertNumber(channel, `${label}[${index}]`, 0, 1));
}

function validateVector3(value, label, code = 'INVALID_RENDER_CONFIGURATION') {
  if (!Array.isArray(value) || value.length !== 3 || value.some((channel) => !Number.isFinite(channel))) {
    fail(code, `${label} must be a finite three-number array`);
  }
  return [...value];
}

function validateLooseSection(value, allowed, label) {
  assertExactKeys(value, allowed, [], label);
  return structuredClone(value);
}

function assertStringArray(value, label) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    fail('INVALID_MATERIAL_SPEC', `${label} must be an array of strings`);
  }
  return [...value];
}

export function validateMaterialSpec(input) {
  assertExactKeys(input, TOP_LEVEL_KEYS, REQUIRED_TOP_LEVEL_KEYS, 'material_spec');
  if (!/^M(0[1-9]|10)$/.test(input.family)) fail('INVALID_MATERIAL_SPEC', 'family must be M01 through M10');
  if (!Array.isArray(input.features) || new Set(input.features).size !== input.features.length || input.features.some((item) => typeof item !== 'string' || !/^[A-Z][A-Z0-9_]*$/.test(item))) {
    fail('INVALID_MATERIAL_SPEC', 'features must contain unique uppercase feature identifiers');
  }

  assertExactKeys(input.geometry, ['shape', 'dimensions', 'unit', 'throughHole', 'sourceArtifact', 'modifiers'], [], 'geometry');
  if (input.geometry.shape !== undefined) assertString(input.geometry.shape, 'geometry.shape');
  if (input.geometry.unit !== undefined && !['m', 'cm', 'mm', 'engine_unit'].includes(input.geometry.unit)) fail('INVALID_MATERIAL_SPEC', 'geometry.unit is unsupported');
  if (input.geometry.dimensions !== undefined) {
    assertObject(input.geometry.dimensions, 'geometry.dimensions');
    for (const [key, value] of Object.entries(input.geometry.dimensions)) assertNumber(value, `geometry.dimensions.${key}`, 0, Number.MAX_VALUE, true);
  }
  if (input.geometry.modifiers !== undefined) assertObject(input.geometry.modifiers, 'geometry.modifiers');
  if (input.geometry.throughHole !== undefined) {
    assertExactKeys(input.geometry.throughHole, ['enabled', 'axis', 'diameter'], ['enabled'], 'geometry.throughHole');
    if (typeof input.geometry.throughHole.enabled !== 'boolean') fail('INVALID_MATERIAL_SPEC', 'geometry.throughHole.enabled must be boolean');
    if (input.geometry.throughHole.axis !== undefined && !['X', 'Y', 'Z'].includes(input.geometry.throughHole.axis)) fail('INVALID_MATERIAL_SPEC', 'geometry.throughHole.axis is unsupported');
    if (input.geometry.throughHole.diameter !== undefined) assertNumber(input.geometry.throughHole.diameter, 'geometry.throughHole.diameter', 0, Number.MAX_VALUE, true);
  }
  if (input.geometry.sourceArtifact !== undefined) assertString(input.geometry.sourceArtifact, 'geometry.sourceArtifact');

  assertExactKeys(input.material, MATERIAL_KEYS, ['baseColor', 'metalness', 'roughness', 'transmission', 'ior'], 'material', 'UNSUPPORTED_MATERIAL_PARAMETER');
  validateColor(input.material.baseColor, 'material.baseColor');
  assertNumber(input.material.metalness, 'material.metalness', 0, 1);
  assertNumber(input.material.roughness, 'material.roughness', 0, 1);
  assertNumber(input.material.transmission, 'material.transmission', 0, 1);
  assertNumber(input.material.ior, 'material.ior', 1, 4, true);
  if (input.material.attenuationColor !== undefined) validateColor(input.material.attenuationColor, 'material.attenuationColor');
  if (input.material.attenuationDistance !== undefined) assertNumber(input.material.attenuationDistance, 'material.attenuationDistance', 0, Number.MAX_VALUE, true);
  if (input.material.dispersion !== undefined) assertNumber(input.material.dispersion, 'material.dispersion', 0, Number.MAX_VALUE);
  if (input.material.thickness !== undefined) assertNumber(input.material.thickness, 'material.thickness', 0, Number.MAX_VALUE);
  if (input.material.extensions !== undefined) assertObject(input.material.extensions, 'material.extensions');

  if (input.internalStructure !== undefined) {
    try { validateInternalStructure(input.internalStructure); }
    catch (error) {
      if (error instanceof StructuralIdentityError) fail(error.code, error.message, error.details);
      throw error;
    }
  }

  validateLooseSection(input.environment, ['lightingPreset', 'environmentMap', 'background', 'exposure', 'toneMapping', 'seed', 'options'], 'environment');
  if (input.environment.lightingPreset !== undefined) assertString(input.environment.lightingPreset, 'environment.lightingPreset');
  if (input.environment.environmentMap !== undefined) assertString(input.environment.environmentMap, 'environment.environmentMap');
  if (input.environment.background !== undefined) validateColor(input.environment.background, 'environment.background');
  if (input.environment.exposure !== undefined) assertNumber(input.environment.exposure, 'environment.exposure', -Number.MAX_VALUE, Number.MAX_VALUE);
  if (input.environment.toneMapping !== undefined) assertString(input.environment.toneMapping, 'environment.toneMapping');
  if (input.environment.seed !== undefined && !Number.isInteger(input.environment.seed)) fail('INVALID_MATERIAL_SPEC', 'environment.seed must be an integer');
  if (input.environment.options !== undefined) assertObject(input.environment.options, 'environment.options');

  validateLooseSection(input.camera, ['projection', 'position', 'target', 'focalLengthMm', 'fieldOfViewDegrees', 'framing', 'viewId'], 'camera');
  if (input.camera.projection !== undefined && !['perspective', 'orthographic'].includes(input.camera.projection)) fail('INVALID_MATERIAL_SPEC', 'camera.projection is unsupported');
  if (input.camera.position !== undefined) validateVector3(input.camera.position, 'camera.position', 'INVALID_MATERIAL_SPEC');
  if (input.camera.target !== undefined) validateVector3(input.camera.target, 'camera.target', 'INVALID_MATERIAL_SPEC');
  if (input.camera.focalLengthMm !== undefined) assertNumber(input.camera.focalLengthMm, 'camera.focalLengthMm', 0, Number.MAX_VALUE, true);
  if (input.camera.fieldOfViewDegrees !== undefined) assertNumber(input.camera.fieldOfViewDegrees, 'camera.fieldOfViewDegrees', 0, 180, true);
  if (input.camera.framing !== undefined) assertString(input.camera.framing, 'camera.framing');
  if (input.camera.viewId !== undefined) assertString(input.camera.viewId, 'camera.viewId');

  validateLooseSection(input.optimization, ['maxIterations', 'noMeaningfulImprovementRounds', 'minimumRelativeImprovement', 'currentHypothesis', 'searchParameters', 'weights'], 'optimization');
  if (input.optimization.maxIterations !== undefined) assertInteger(input.optimization.maxIterations, 'optimization.maxIterations', 1, 100);
  if (input.optimization.noMeaningfulImprovementRounds !== undefined) assertInteger(input.optimization.noMeaningfulImprovementRounds, 'optimization.noMeaningfulImprovementRounds', 1, 20);
  if (input.optimization.minimumRelativeImprovement !== undefined) assertNumber(input.optimization.minimumRelativeImprovement, 'optimization.minimumRelativeImprovement', 0, 1);
  if (input.optimization.currentHypothesis !== undefined) assertString(input.optimization.currentHypothesis, 'optimization.currentHypothesis');
  if (input.optimization.searchParameters !== undefined) {
    const values = assertStringArray(input.optimization.searchParameters, 'optimization.searchParameters');
    if (values.length > 2 || new Set(values).size !== values.length) fail('INVALID_MATERIAL_SPEC', 'optimization.searchParameters must contain at most two unique values');
  }
  if (input.optimization.weights !== undefined) {
    assertObject(input.optimization.weights, 'optimization.weights');
    for (const [key, value] of Object.entries(input.optimization.weights)) assertNumber(value, `optimization.weights.${key}`, 0, Number.MAX_VALUE);
  }

  validateLooseSection(input.notes, ['observations', 'assumptions', 'unresolved', 'approximations', 'units', 'provenance', 'freeform'], 'notes');
  for (const key of ['observations', 'assumptions', 'unresolved', 'approximations', 'provenance']) {
    if (input.notes[key] !== undefined) assertStringArray(input.notes[key], `notes.${key}`);
  }
  if (input.notes.units !== undefined) {
    assertObject(input.notes.units, 'notes.units');
    for (const [key, value] of Object.entries(input.notes.units)) assertString(value, `notes.units.${key}`);
  }
  if (input.notes.freeform !== undefined) assertString(input.notes.freeform, 'notes.freeform');
  return structuredClone(input);
}

function srgbChannelToLinear(channel) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function colorToEngineLinear(value) {
  if (Array.isArray(value)) return [...value];
  return [1, 3, 5].map((offset) => srgbChannelToLinear(Number.parseInt(value.slice(offset, offset + 2), 16)));
}

function requireBuildFields(spec) {
  if (spec.family !== 'M01') fail('ENGINE_CAPABILITY_LIMIT', 'Current generic builder supports only M01', { family: spec.family });
  const unsupportedFeatures = spec.features.filter((feature) => feature !== 'THROUGH_HOLE');
  if (unsupportedFeatures.length) fail('UNSUPPORTED_ENGINE_FEATURE', 'Requested feature is not supported by the generic builder', { unsupportedFeatures });
  if (spec.features.length !== 1 || spec.features[0] !== 'THROUGH_HOLE') {
    fail('UNSUPPORTED_ENGINE_FEATURE', 'Current generic builder requires explicit THROUGH_HOLE feature', { supportedFeatures: ['THROUGH_HOLE'] });
  }
  if (spec.geometry.shape !== 'BEAD_SPHERE_THROUGH_HOLE') fail('ENGINE_CAPABILITY_LIMIT', 'Current builder supports only BEAD_SPHERE_THROUGH_HOLE geometry');
  if (!isPlainObject(spec.geometry.throughHole) || spec.geometry.throughHole.enabled !== true || spec.geometry.throughHole.axis !== 'Y') {
    fail('ENGINE_CAPABILITY_LIMIT', 'Current builder requires an explicit enabled Y-axis through-hole');
  }
  if (!['m', 'cm', 'mm'].includes(spec.geometry.unit)) fail('INVALID_MATERIAL_SPEC', 'geometry.unit must be m, cm, or mm; hidden engine_unit conversion is denied');
  assertExactKeys(spec.geometry.dimensions, ['diameter', 'holeDiameter', 'topBevelOuterDiameter', 'bottomBevelOuterDiameter'], ['diameter', 'holeDiameter', 'topBevelOuterDiameter', 'bottomBevelOuterDiameter'], 'geometry.dimensions');
  assertExactKeys(spec.geometry.modifiers, ['radialSegments', 'profileSteps'], ['radialSegments', 'profileSteps'], 'geometry.modifiers');
  for (const key of REQUIRED_MATERIAL_KEYS) {
    if (!Object.hasOwn(spec.material, key)) fail('INVALID_MATERIAL_SPEC', `material.${key} is required for build_candidate`);
  }
  if (!isPlainObject(spec.material.extensions)) fail('INVALID_MATERIAL_SPEC', 'material.extensions.engine is required for build_candidate');
  const unsupportedExtensions = Object.keys(spec.material.extensions).filter((key) => key !== 'engine');
  if (unsupportedExtensions.length) fail('UNSUPPORTED_MATERIAL_PARAMETER', 'Unsupported material extension namespace', { keys: unsupportedExtensions });
  assertExactKeys(spec.material.extensions.engine, ENGINE_EXTENSION_KEYS, ENGINE_EXTENSION_KEYS, 'material.extensions.engine', 'UNSUPPORTED_MATERIAL_PARAMETER');
  if (!isPlainObject(spec.notes.units) || spec.notes.units.attenuationDistance !== 'm' || spec.notes.units.thickness !== 'm') {
    fail('INVALID_MATERIAL_SPEC', 'notes.units must explicitly declare attenuationDistance and thickness as m');
  }
}

function assertEngineDomain(value, label, minimum, maximum, exclusiveMinimum = false) {
  if (!Number.isFinite(value) || (exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
    fail('UNSUPPORTED_MATERIAL_PARAMETER', `${label} is outside the current Engine domain`, { minimum, maximum, exclusiveMinimum, value });
  }
  return value;
}

function safeLabel(value) {
  const label = (value || 'candidate').toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!label || label.length > 48) fail('INVALID_MATERIAL_SPEC', 'candidate label cannot be normalized safely');
  return label;
}

export function translateMaterialSpec(input, options = {}) {
  const spec = validateMaterialSpec(input);
  requireBuildFields(spec);
  const scale = { m: 1, cm: 0.01, mm: 0.001 }[spec.geometry.unit];
  const specSha256 = sha256(canonicalStringify(spec));
  const candidateLabel = safeLabel(options.candidateLabel);
  const variantId = `v2-${candidateLabel}-${specSha256.slice(0, 12).toLowerCase()}`;
  const engine = spec.material.extensions.engine;
  const dimensions = spec.geometry.dimensions;
  const geometryMetres = {
    diameterMeters: dimensions.diameter * scale,
    holeDiameterMeters: dimensions.holeDiameter * scale,
    topBevelOuterDiameterMeters: dimensions.topBevelOuterDiameter * scale,
    bottomBevelOuterDiameterMeters: dimensions.bottomBevelOuterDiameter * scale,
  };
  assertEngineDomain(geometryMetres.diameterMeters, 'geometry.diameter', 0.001, 1);
  assertEngineDomain(geometryMetres.holeDiameterMeters, 'geometry.holeDiameter', 0.0001, 0.5);
  assertEngineDomain(geometryMetres.topBevelOuterDiameterMeters, 'geometry.topBevelOuterDiameter', 0.0002, 0.8);
  assertEngineDomain(geometryMetres.bottomBevelOuterDiameterMeters, 'geometry.bottomBevelOuterDiameter', 0.0002, 0.8);
  if (geometryMetres.holeDiameterMeters >= geometryMetres.diameterMeters) fail('INVALID_MATERIAL_SPEC', 'hole must be smaller than bead');
  if (geometryMetres.topBevelOuterDiameterMeters <= geometryMetres.holeDiameterMeters || geometryMetres.topBevelOuterDiameterMeters >= geometryMetres.diameterMeters) fail('INVALID_MATERIAL_SPEC', 'top bevel diameter must be between hole and bead diameters');
  if (geometryMetres.bottomBevelOuterDiameterMeters <= geometryMetres.holeDiameterMeters || geometryMetres.bottomBevelOuterDiameterMeters >= geometryMetres.diameterMeters) fail('INVALID_MATERIAL_SPEC', 'bottom bevel diameter must be between hole and bead diameters');
  if (Math.abs(spec.geometry.throughHole.diameter - dimensions.holeDiameter) > Number.EPSILON * Math.max(1, dimensions.holeDiameter)) fail('INVALID_MATERIAL_SPEC', 'throughHole.diameter must equal geometry.dimensions.holeDiameter');
  assertEngineDomain(spec.material.ior, 'material.ior', 1, 3);
  assertEngineDomain(spec.material.thickness, 'material.thickness', 0, 10);
  assertEngineDomain(spec.material.attenuationDistance, 'material.attenuationDistance', 0.000001, 1000);
  assertEngineDomain(spec.material.dispersion, 'material.dispersion', 0, 10);
  const config = {
    schemaVersion: '1.0.0',
    interfaceVersion: 'generic-mutator-v1',
    variantId,
    targetIdentity: {
      caseRef: `portable-v2:${spec.family.toLowerCase()}`,
      candidateId: `candidate:${variantId}`,
    },
    sourceIdentity: {
      id: `material-spec:${specSha256}`,
      sha256: specSha256,
      kind: 'SYNTHETIC',
    },
    geometry: {
      ...geometryMetres,
      radialSegments: assertInteger(spec.geometry.modifiers.radialSegments, 'geometry.modifiers.radialSegments', 16, 512),
      profileSteps: assertInteger(spec.geometry.modifiers.profileSteps, 'geometry.modifiers.profileSteps', 8, 256),
    },
    material: {
      materialName: assertString(engine.materialName, 'material.extensions.engine.materialName'),
      baseColor: colorToEngineLinear(spec.material.baseColor),
      metalness: spec.material.metalness,
      roughness: spec.material.roughness,
      transmission: spec.material.transmission,
      ior: spec.material.ior,
      thickness: spec.material.thickness,
      attenuationColor: colorToEngineLinear(spec.material.attenuationColor),
      attenuationDistance: spec.material.attenuationDistance,
      dispersion: spec.material.dispersion,
      specularIntensity: assertNumber(engine.specularIntensity, 'material.extensions.engine.specularIntensity', 0, 1),
      clearcoat: assertNumber(engine.clearcoat, 'material.extensions.engine.clearcoat', 0, 1),
      clearcoatRoughness: assertNumber(engine.clearcoatRoughness, 'material.extensions.engine.clearcoatRoughness', 0, 1),
      envMapIntensity: assertNumber(engine.envMapIntensity, 'material.extensions.engine.envMapIntensity', 0, 20),
    },
    artisticInclusions: { mode: 'OFF' },
    metadata: {
      mineralLabel: assertString(engine.mineralLabel, 'material.extensions.engine.mineralLabel'),
      purpose: assertString(engine.purpose, 'material.extensions.engine.purpose'),
    },
  };
  const configText = canonicalStringify(config);
  return {
    status: 'MATERIAL_SPEC_TRANSLATED',
    candidateLabel,
    specSha256,
    config,
    configSha256: sha256(configText),
    mappingSummary: {
      family: 'M01 → generic transparent physical bead builder',
      feature: 'THROUGH_HOLE → lathed bead cavity geometry',
      geometryUnit: `${spec.geometry.unit} → m using factor ${scale}`,
      color: 'sRGB hex → Linear-sRGB exactly once; numeric triplet → identity linear',
      attenuationDistance: 'm → m identity',
      thickness: 'm → m identity',
      internalStructure: spec.internalStructure
        ? 'preserved as first-class Candidate data; not injected into the frozen generic GLB builder'
        : 'absent → structurally empty legacy behavior',
      buildOnlySectionsPreservedNotApplied: ['internalStructure', 'environment', 'camera', 'optimization'],
    },
    unsupportedFeatures: [],
    warnings: ['GLB technical validity and mapped material parameters do not prove visual realism'],
    materialSpecUsed: spec,
  };
}

export async function renderStructuralCandidateProof(request) {
  assertExactKeys(request, ['materialSpec', 'views', 'outputDirectory', 'width', 'height', 'samples'], ['materialSpec', 'views', 'outputDirectory'], 'structural_render_request', 'INVALID_STRUCTURAL_RENDER_REQUEST');
  const materialSpec = validateMaterialSpec(request.materialSpec);
  if (!materialSpec.internalStructure) fail('MISSING_INTERNAL_STRUCTURE', 'render_structural_proof requires first-class internalStructure');
  const outputDirectory = path.resolve(assertString(request.outputDirectory, 'structural_render_request.outputDirectory'));
  const existing = await fs.lstat(outputDirectory).catch(() => null);
  if (existing) fail('OUTPUT_ALREADY_EXISTS', 'render_structural_proof is new-output-only', { outputDirectory });
  const parent = await fs.lstat(path.dirname(outputDirectory)).catch(() => null);
  if (!parent?.isDirectory() || parent.isSymbolicLink()) fail('INVALID_OUTPUT_DIRECTORY', 'Structural proof parent must be an existing regular directory');
  await fs.mkdir(outputDirectory);
  try {
    const proof = await renderStructuralProof({
      materialSpec,
      views: request.views,
      outputDirectory,
      width: request.width ?? 160,
      height: request.height ?? 160,
      samples: request.samples ?? 20,
    });
    const manifest = {
      schemaVersion: '1.0.0',
      operation: 'render_structural_proof',
      status: proof.status,
      capabilityState: 'READY_VIA_SKILL_FAST_ADAPTER',
      opticalBoundary: 'STRUCTURAL_PROOF_ONLY_FROZEN_DCSA_NOT_INVOKED',
      materialSpecSha256: sha256(canonicalStringify(materialSpec)),
      ...proof,
    };
    const manifestPath = path.join(outputDirectory, 'structural-proof.manifest.json');
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    return { ...manifest, manifestPath };
  } catch (error) {
    await fs.rm(outputDirectory, { recursive: true, force: true });
    if (error instanceof StructuralIdentityError) fail(error.code, error.message, error.details);
    throw error;
  }
}

async function fileHash(filename) {
  return sha256(await fs.readFile(filename));
}

async function verifyEngineRoot(engineRoot, operation) {
  const root = path.resolve(assertString(engineRoot, 'engineRoot'));
  const required = operation === 'audit_candidate'
    ? ['package.json', 'audit-glb.mjs']
    : operation === 'render_candidate'
      ? ['package.json', 'render-generic-candidate-v1.mjs', 'generic-render.html', 'generic-render.mjs']
      : ['package.json', 'build-gemstone-mutator-v1.mjs', 'mutator-interface-v1.mjs'];
  for (const filename of required) {
    const actual = await fileHash(path.join(root, filename)).catch(() => null);
    if (actual !== ENGINE_IDENTITIES[filename]) {
      fail('ENGINE_IDENTITY_MISMATCH', 'Engine source identity does not match the qualified capability map', { filename, expected: ENGINE_IDENTITIES[filename], actual });
    }
  }
  return root;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill(), options.timeoutMs ?? 120000);
    child.stdout.on('data', (chunk) => { stdout += chunk; if (stdout.length > 10_000_000) child.kill(); });
    child.stderr.on('data', (chunk) => { stderr += chunk; if (stderr.length > 10_000_000) child.kill(); });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve({ stdout, stderr });
      else reject(new AdapterError('ENGINE_EXECUTION_FAILED', 'Engine command failed', { exitCode: code, stderr: stderr.slice(0, 4000) }));
    });
  });
}

async function requireOutputDirectory(outputDirectory, engineRoot) {
  const resolved = path.resolve(assertString(outputDirectory, 'outputDirectory'));
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isDirectory() || stat.isSymbolicLink()) fail('INVALID_OUTPUT_DIRECTORY', 'outputDirectory must be an existing non-link directory');
  const relativeToEngine = path.relative(path.resolve(engineRoot), resolved);
  if (relativeToEngine === '' || (!relativeToEngine.startsWith('..') && !path.isAbsolute(relativeToEngine))) {
    fail('INVALID_OUTPUT_DIRECTORY', 'Candidate output inside the Engine source tree is denied');
  }
  return resolved;
}

export async function buildCandidate({ materialSpec, outputDirectory, candidateLabel, engineRoot }) {
  const translated = translateMaterialSpec(materialSpec, { candidateLabel });
  const root = await verifyEngineRoot(engineRoot, 'build_candidate');
  const outputRoot = await requireOutputDirectory(outputDirectory, root);
  const stem = `${translated.candidateLabel}-${translated.specSha256.slice(0, 12).toLowerCase()}`;
  const glbPath = path.join(outputRoot, `${stem}.glb`);
  const manifestPath = path.join(outputRoot, `${stem}.manifest.json`);
  for (const target of [glbPath, manifestPath]) {
    if (await fs.lstat(target).then(() => true, () => false)) fail('OUTPUT_ALREADY_EXISTS', 'build_candidate is new-output-only', { target });
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gemstone-v2-adapter-'));
  const configPath = path.join(tempRoot, 'engine-config.json');
  const configText = canonicalStringify(translated.config);
  await fs.writeFile(configPath, configText, { flag: 'wx' });
  let engineResult;
  try {
    const result = await runProcess(process.execPath, [
      path.join(root, 'build-gemstone-mutator-v1.mjs'),
      '--config', configPath,
      '--config-sha256', translated.configSha256,
      '--staging-root', outputRoot,
      '--output', glbPath,
    ], { cwd: root });
    engineResult = JSON.parse(result.stdout.trim());
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  const glbSha256 = await fileHash(glbPath);
  const manifest = {
    schemaVersion: '1.0.0',
    operation: 'build_candidate',
    status: 'CANDIDATE_BUILT',
    candidateRef: translated.config.targetIdentity.candidateId,
    candidateLabel: translated.candidateLabel,
    glb: { path: glbPath, sha256: glbSha256 },
    materialSpec: { sha256: translated.specSha256, value: translated.materialSpecUsed },
    engineConfig: { sha256: translated.configSha256, value: translated.config },
    engineIdentity: ENGINE_IDENTITIES,
    engineMappingSummary: translated.mappingSummary,
    preservedRenderMetadata: {
      environment: translated.materialSpecUsed.environment,
      camera: translated.materialSpecUsed.camera,
      optimization: translated.materialSpecUsed.optimization,
    },
    warnings: translated.warnings,
    unsupportedFeatures: [],
    engineResult,
  };
  try {
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    await fs.unlink(glbPath).catch(() => {});
    throw error;
  }
  return { ...manifest, manifestPath };
}

export async function auditCandidate({ glbPath, engineRoot }) {
  const root = await verifyEngineRoot(engineRoot, 'audit_candidate');
  const resolved = path.resolve(assertString(glbPath, 'glbPath'));
  if (path.extname(resolved).toLowerCase() !== '.glb') fail('INVALID_GLB_INPUT', 'audit_candidate requires a .glb file');
  const stat = await fs.lstat(resolved).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('INVALID_GLB_INPUT', 'GLB must be an existing regular non-link file');
  const result = await runProcess(process.execPath, [path.join(root, 'audit-glb.mjs'), resolved], { cwd: root });
  let raw;
  try { raw = JSON.parse(result.stdout); } catch { fail('ENGINE_EXECUTION_FAILED', 'GLB audit returned malformed JSON'); }
  const main = raw.mainPrimitive ?? null;
  return {
    schemaVersion: '1.0.0',
    operation: 'audit_candidate',
    status: 'AUDIT_COMPLETE',
    technicalValidityOnly: true,
    fileExists: true,
    glbParseable: true,
    glb: { path: resolved, sha256: await fileHash(resolved), bytes: raw.bytes },
    vertexCount: raw.totalVertices,
    triangleCount: raw.totalTriangles,
    boundingDimensions: raw.dimensions,
    manifoldStatus: main ? (main.nonManifoldEdges === 0 && main.boundaryEdges === 0 ? 'MANIFOLD_BY_EDGE_COUNTS' : 'NOT_MANIFOLD_BY_EDGE_COUNTS') : 'UNKNOWN',
    rootScale: null,
    geometryWarnings: [
      ...(main?.zeroAreaTriangles ? [`${main.zeroAreaTriangles} zero-area triangles`] : []),
      ...(main?.duplicateTriangles ? [`${main.duplicateTriangles} duplicate triangles`] : []),
      'Root scale is not separately exposed by the current audit CLI',
      'Cavity profile heuristics are bead-specific',
    ],
    materialPresent: raw.materialCount > 0,
    materialCount: raw.materialCount,
    extensionsUsed: raw.extensionsUsed,
    extensionsRequired: raw.extensionsRequired,
    fatalTechnicalErrors: [],
    rawEngineAudit: raw,
  };
}

export function validateReferenceMatchRig(input) {
  const code = 'INVALID_RENDER_CONFIGURATION';
  const exact = (value, keys, label, required = keys, errorCode = code) => {
    if (!isPlainObject(value)) fail(errorCode, `${label} must be an object`);
    const actual = Object.keys(value);
    const unexpected = actual.filter((key) => !keys.includes(key));
    const missing = required.filter((key) => !Object.hasOwn(value, key));
    if (unexpected.length || missing.length) fail(errorCode, `${label} must contain exactly the supported keys`, { unexpected, missing });
  };
  const number = (value, label, minimum, maximum, exclusiveMinimum = false) => {
    if (!Number.isFinite(value) || (exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
      fail(code, `${label} is outside the supported domain`, { value, minimum, maximum, exclusiveMinimum });
    }
    return value;
  };
  const integer = (value, label, minimum, maximum) => {
    if (!Number.isInteger(value) || value < minimum || value > maximum) fail(code, `${label} must be a supported integer`, { value, minimum, maximum });
    return value;
  };
  const string = (value, label) => {
    if (typeof value !== 'string' || value.trim() === '') fail(code, `${label} must be a non-empty string`);
    return value.trim();
  };
  const color = (value, label) => {
    if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) fail(code, `${label} must be #RRGGBB`);
    return value.toUpperCase();
  };
  exact(input, ['schemaVersion', 'camera', 'object', 'background', 'lighting', 'environment', 'render', 'seed'], 'rig');
  if (input.schemaVersion !== '1.0.0') fail(code, 'rig.schemaVersion must be 1.0.0');
  exact(input.camera, ['type', 'position', 'target', 'fov', 'near', 'far'], 'rig.camera');
  if (input.camera.type !== 'perspective') fail(code, 'Only a perspective camera is supported');
  exact(input.object, ['rotation', 'position', 'scale'], 'rig.object');
  exact(input.background, ['color', 'transmissionBackdrop'], 'rig.background', ['color']);
  exact(input.lighting, ['identity', 'ambient', 'key'], 'rig.lighting');
  exact(input.lighting.ambient, ['color', 'intensity'], 'rig.lighting.ambient');
  exact(input.lighting.key, ['color', 'intensity', 'position'], 'rig.lighting.key');
  exact(input.environment, ['identity', 'mode', 'intensity'], 'rig.environment');
  if (!['NONE', 'ROOM'].includes(input.environment.mode)) fail(code, 'rig.environment.mode must be NONE or ROOM');
  exact(input.render, ['width', 'height', 'exposure', 'toneMapping', 'pixelRatio'], 'rig.render');
  if (!['ACES_FILMIC', 'NONE'].includes(input.render.toneMapping)) fail(code, 'rig.render.toneMapping is unsupported');
  if (input.render.pixelRatio !== 1) fail(code, 'rig.render.pixelRatio must be exactly 1');
  if (input.camera.far <= input.camera.near) fail(code, 'rig.camera.far must be greater than rig.camera.near');
  if (!Array.isArray(input.object.scale) || input.object.scale.some((value) => !Number.isFinite(value) || value <= 0)) fail(code, 'rig.object.scale must contain three positive finite numbers');
  const background = { color: color(input.background.color, 'rig.background.color') };
  if (Object.hasOwn(input.background, 'transmissionBackdrop')) {
    const backdropCode = 'INVALID_RENDER_RIG_TRANSMISSION_BACKDROP';
    const backdrop = input.background.transmissionBackdrop;
    if (!isPlainObject(backdrop)) fail(backdropCode, 'rig.background.transmissionBackdrop must be an object');
    const isPortableControlForm = Object.hasOwn(backdrop, 'enabled');
    if (isPortableControlForm && typeof backdrop.enabled !== 'boolean') fail(backdropCode, 'rig.background.transmissionBackdrop.enabled must be boolean');
    if (isPortableControlForm && !backdrop.enabled) {
      exact(backdrop, ['enabled'], 'rig.background.transmissionBackdrop', ['enabled'], backdropCode);
    } else {
      exact(
        backdrop,
        isPortableControlForm ? ['enabled', 'mode', 'topColor', 'bottomColor'] : ['mode', 'topColor', 'bottomColor'],
        'rig.background.transmissionBackdrop',
        isPortableControlForm ? ['enabled', 'mode', 'topColor', 'bottomColor'] : ['mode', 'topColor', 'bottomColor'],
        backdropCode,
      );
      if (backdrop.mode !== 'VERTICAL_GRADIENT') fail(backdropCode, 'rig.background.transmissionBackdrop.mode is unsupported', { mode: backdrop.mode });
      background.transmissionBackdrop = {
        mode: 'VERTICAL_GRADIENT',
        topColor: (() => {
          try { return color(backdrop.topColor, 'rig.background.transmissionBackdrop.topColor'); }
          catch { fail(backdropCode, 'rig.background.transmissionBackdrop.topColor must be #RRGGBB'); }
        })(),
        bottomColor: (() => {
          try { return color(backdrop.bottomColor, 'rig.background.transmissionBackdrop.bottomColor'); }
          catch { fail(backdropCode, 'rig.background.transmissionBackdrop.bottomColor must be #RRGGBB'); }
        })(),
      };
    }
  }
  return {
    schemaVersion: '1.0.0',
    camera: {
      type: 'perspective',
      position: validateVector3(input.camera.position, 'rig.camera.position'),
      target: validateVector3(input.camera.target, 'rig.camera.target'),
      fov: number(input.camera.fov, 'rig.camera.fov', 1, 179),
      near: number(input.camera.near, 'rig.camera.near', 0, 1000, true),
      far: number(input.camera.far, 'rig.camera.far', 0, 1000000, true),
    },
    object: {
      rotation: validateVector3(input.object.rotation, 'rig.object.rotation'),
      position: validateVector3(input.object.position, 'rig.object.position'),
      scale: validateVector3(input.object.scale, 'rig.object.scale'),
    },
    background,
    lighting: {
      identity: string(input.lighting.identity, 'rig.lighting.identity'),
      ambient: { color: color(input.lighting.ambient.color, 'rig.lighting.ambient.color'), intensity: number(input.lighting.ambient.intensity, 'rig.lighting.ambient.intensity', 0, 100) },
      key: {
        color: color(input.lighting.key.color, 'rig.lighting.key.color'),
        intensity: number(input.lighting.key.intensity, 'rig.lighting.key.intensity', 0, 100),
        position: validateVector3(input.lighting.key.position, 'rig.lighting.key.position'),
      },
    },
    environment: { identity: string(input.environment.identity, 'rig.environment.identity'), mode: input.environment.mode, intensity: number(input.environment.intensity, 'rig.environment.intensity', 0, 10) },
    render: {
      width: integer(input.render.width, 'rig.render.width', 64, 4096),
      height: integer(input.render.height, 'rig.render.height', 64, 4096),
      exposure: number(input.render.exposure, 'rig.render.exposure', 0, 100),
      toneMapping: input.render.toneMapping,
      pixelRatio: 1,
    },
    seed: integer(input.seed, 'rig.seed', 0, 2147483647),
  };
}

export async function renderCandidate(request) {
  assertExactKeys(request, ['candidateGlb', 'rig', 'outputImage', 'engineRoot', 'browserExecutable'], ['candidateGlb', 'rig', 'outputImage', 'engineRoot', 'browserExecutable'], 'render_request', 'INVALID_RENDER_CONFIGURATION');
  const rig = validateReferenceMatchRig(request.rig);
  const root = await verifyEngineRoot(request.engineRoot, 'render_candidate');
  const candidateGlb = path.resolve(assertString(request.candidateGlb, 'render_request.candidateGlb'));
  const outputImage = path.resolve(assertString(request.outputImage, 'render_request.outputImage'));
  const browserExecutable = path.resolve(assertString(request.browserExecutable, 'render_request.browserExecutable'));
  if (path.extname(candidateGlb).toLowerCase() !== '.glb') fail('INVALID_GLB_INPUT', 'render_candidate requires a .glb file');
  const candidateStat = await fs.lstat(candidateGlb).catch(() => null);
  if (!candidateStat?.isFile() || candidateStat.isSymbolicLink()) fail('INVALID_GLB_INPUT', 'Candidate GLB must be an existing regular non-link file');
  const browserStat = await fs.lstat(browserExecutable).catch(() => null);
  if (!browserStat?.isFile() || browserStat.isSymbolicLink()) fail('INVALID_RENDER_CONFIGURATION', 'browserExecutable must be an existing regular non-link file');
  if (path.extname(outputImage).toLowerCase() !== '.png') fail('INVALID_RENDER_CONFIGURATION', 'outputImage must use .png extension');
  const outputRoot = path.dirname(outputImage);
  const outputStat = await fs.lstat(outputRoot).catch(() => null);
  if (!outputStat?.isDirectory() || outputStat.isSymbolicLink()) fail('INVALID_OUTPUT_DIRECTORY', 'Render output parent must be an existing non-link directory');
  const relativeToEngine = path.relative(root, outputImage);
  if (relativeToEngine === '' || (!relativeToEngine.startsWith('..') && !path.isAbsolute(relativeToEngine))) fail('INVALID_OUTPUT_DIRECTORY', 'Render output inside the Engine source tree is denied');
  const manifestPath = outputImage.replace(/\.png$/i, '.render.json');
  for (const target of [outputImage, manifestPath]) {
    if (await fs.lstat(target).then(() => true, () => false)) fail('OUTPUT_ALREADY_EXISTS', 'render_candidate is new-output-only', { target });
  }
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gemstone-v2-render-'));
  const rigPath = path.join(tempRoot, 'render-rig.json');
  const rigText = canonicalStringify(rig);
  await fs.writeFile(rigPath, rigText, { flag: 'wx' });
  let engineResult;
  try {
    const result = await runProcess(process.execPath, [
      path.join(root, 'render-generic-candidate-v1.mjs'),
      '--glb', candidateGlb,
      '--rig', rigPath,
      '--out', outputImage,
      '--browser', browserExecutable,
    ], { cwd: root, timeoutMs: 120000 });
    try { engineResult = JSON.parse(result.stdout.trim()); } catch { fail('ENGINE_EXECUTION_FAILED', 'Generic renderer returned malformed JSON'); }
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
  const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8').catch(() => fail('ENGINE_EXECUTION_FAILED', 'Generic renderer did not create its manifest')));
  const imageSha256 = await fileHash(outputImage).catch(() => fail('ENGINE_EXECUTION_FAILED', 'Generic renderer did not create its PNG'));
  const candidateSha256 = await fileHash(candidateGlb);
  const rigSha256 = sha256(rigText);
  if (manifest.output?.imageSha256 !== imageSha256 || manifest.candidate?.sha256 !== candidateSha256 || manifest.renderRig?.canonicalSha256 !== rigSha256) {
    fail('ENGINE_EXECUTION_FAILED', 'Generic renderer output identities do not match Adapter inputs', { imageSha256, candidateSha256, rigSha256 });
  }
  if (canonicalStringify(manifest.background) !== canonicalStringify(rig.background)) {
    fail('TRANSMISSION_BACKDROP_MANIFEST_TRACEABILITY_FAILED', 'Generic renderer manifest background does not match the normalized Adapter Rig', {
      expected: rig.background,
      actual: manifest.background,
    });
  }
  if (manifest.material?.preserved !== true || manifest.material?.runtimeOverrideCount !== 0 || manifest.renderer?.shaderFallback !== 'FAIL_CLOSED') {
    fail('GENERIC_RENDERER_HIDDEN_MATERIAL_OVERRIDE_UNRESOLVED', 'Generic renderer did not prove the required material boundary');
  }
  return {
    schemaVersion: '1.0.0',
    operation: 'render_candidate',
    status: 'RENDER_COMPLETE',
    capabilityState: 'READY_VIA_ADAPTER',
    candidate: { path: candidateGlb, sha256: candidateSha256 },
    renderRig: { canonicalSha256: rigSha256, value: rig },
    transmissionBackdrop: {
      enabled: Boolean(rig.background.transmissionBackdrop),
      normalized: rig.background.transmissionBackdrop ?? null,
      canonicalSha256: rig.background.transmissionBackdrop
        ? sha256(canonicalStringify(rig.background.transmissionBackdrop))
        : null,
    },
    output: { imagePath: outputImage, imageSha256, manifestPath, width: manifest.output.width, height: manifest.output.height, bytes: manifest.output.bytes },
    material: manifest.material,
    renderer: manifest.renderer,
    warnings: manifest.warnings ?? [],
    engineResult,
  };
}

function setMaterialField(spec, field, value) {
  const engineFields = ['specularIntensity', 'clearcoat', 'clearcoatRoughness', 'envMapIntensity'];
  if (!REQUIRED_MATERIAL_KEYS.includes(field) && !engineFields.includes(field)) fail('UNSUPPORTED_MATERIAL_PARAMETER', 'Matrix field is not a supported material parameter', { field });
  const clone = structuredClone(spec);
  if (engineFields.includes(field)) clone.material.extensions.engine[field] = value;
  else clone.material[field] = value;
  validateMaterialSpec(clone);
  return clone;
}

export function planParameterMatrix({ baseSpec, variations, rig }) {
  validateMaterialSpec(baseSpec);
  const stableRig = validateReferenceMatchRig(rig);
  assertObject(variations, 'variations');
  const fields = Object.keys(variations);
  if (fields.length < 1 || fields.length > 2) fail('PARAMETER_MATRIX_LIMIT', 'Parameter matrix supports one parameter or one logical pair only');
  for (const field of fields) {
    if (!Array.isArray(variations[field]) || variations[field].length < 1 || variations[field].length > 8) fail('PARAMETER_MATRIX_LIMIT', 'Each parameter must have 1 through 8 values', { field });
  }
  const combinations = fields.length === 1
    ? variations[fields[0]].map((value) => ({ [fields[0]]: value }))
    : variations[fields[0]].flatMap((first) => variations[fields[1]].map((second) => ({ [fields[0]]: first, [fields[1]]: second })));
  if (combinations.length > 16) fail('PARAMETER_MATRIX_LIMIT', 'Matrix may contain at most 16 variations');
  const plans = combinations.map((values, index) => {
    let spec = structuredClone(baseSpec);
    for (const [field, value] of Object.entries(values)) spec = setMaterialField(spec, field, value);
    return { index, values, materialSpec: spec, materialSpecSha256: sha256(canonicalStringify(spec)), rig: stableRig };
  });
  return { status: 'PARAMETER_MATRIX_PLANNED_NOT_RENDERED', fields, sharedRig: stableRig, plans };
}

export async function renderParameterMatrix({ baseSpec, variations, rig, outputDirectory, engineRoot, browserExecutable, candidateLabel = 'matrix' }) {
  const plan = planParameterMatrix({ baseSpec, variations, rig });
  if (plan.plans.length < 2 || plan.plans.length > 4) fail('PARAMETER_MATRIX_LIMIT', 'Executable matrix requires 2 through 4 bounded trials', { trialCount: plan.plans.length });
  const root = await verifyEngineRoot(engineRoot, 'build_candidate');
  await verifyEngineRoot(engineRoot, 'audit_candidate');
  await verifyEngineRoot(engineRoot, 'render_candidate');
  const outputRoot = await requireOutputDirectory(outputDirectory, root);
  const entries = await fs.readdir(outputRoot);
  if (entries.length) fail('INVALID_OUTPUT_DIRECTORY', 'Executable matrix outputDirectory must be empty', { outputDirectory: outputRoot });
  const stableRig = validateReferenceMatchRig(rig);
  const rigSha256 = sha256(canonicalStringify(stableRig));
  const baseSpecSha256 = sha256(canonicalStringify(validateMaterialSpec(baseSpec)));
  const trials = [];
  for (const item of plan.plans) {
    const trialId = `trial-${String(item.index + 1).padStart(3, '0')}`;
    const trialRoot = path.join(outputRoot, trialId);
    await fs.mkdir(trialRoot);
    const specPath = path.join(trialRoot, 'material-spec.json');
    await fs.writeFile(specPath, `${JSON.stringify(item.materialSpec, null, 2)}\n`, { flag: 'wx' });
    const record = {
      trialId,
      status: 'EXECUTING',
      values: item.values,
      materialSpec: { path: specPath, sha256: item.materialSpecSha256 },
      rigSha256,
      build: null,
      audit: null,
      render: null,
      error: null,
    };
    try {
      const build = await buildCandidate({ materialSpec: item.materialSpec, outputDirectory: trialRoot, candidateLabel: `${candidateLabel}-${item.index + 1}`, engineRoot: root });
      record.build = { status: build.status, glb: build.glb, manifestPath: build.manifestPath };
      const audit = await auditCandidate({ glbPath: build.glb.path, engineRoot: root });
      record.audit = {
        status: audit.status,
        glbParseable: audit.glbParseable,
        fatalTechnicalErrors: audit.fatalTechnicalErrors,
        vertexCount: audit.vertexCount,
        triangleCount: audit.triangleCount,
        manifoldStatus: audit.manifoldStatus,
      };
      if (audit.status !== 'AUDIT_COMPLETE' || !audit.glbParseable || audit.fatalTechnicalErrors.length) fail('TECHNICAL_AUDIT_FAILED', 'Trial Candidate failed the technical audit gate', { trialId, audit: record.audit });
      const render = await renderCandidate({ candidateGlb: build.glb.path, rig: stableRig, outputImage: path.join(trialRoot, 'candidate.png'), engineRoot: root, browserExecutable });
      if (render.renderRig.canonicalSha256 !== rigSha256) fail('FIXED_RIG_INVARIANCE_VIOLATION', 'Trial Render used a different Rig identity', { trialId, expected: rigSha256, actual: render.renderRig.canonicalSha256 });
      record.render = {
        status: render.status,
        candidate: render.candidate,
        output: render.output,
        renderRig: { canonicalSha256: render.renderRig.canonicalSha256 },
        material: render.material,
      };
      record.status = 'AWAITING_HOST_AGENT_EVALUATION';
    } catch (error) {
      record.status = 'TECHNICAL_FAILURE';
      record.error = { code: error.code ?? 'UNEXPECTED_TECHNICAL_FAILURE', message: error.message ?? String(error), details: error.details ?? {} };
    }
    trials.push(record);
  }
  const successful = trials.filter((trial) => trial.status === 'AWAITING_HOST_AGENT_EVALUATION');
  const matrix = {
    schemaVersion: '1.0.0',
    operation: 'render_parameter_matrix',
    status: successful.length ? 'AWAITING_HOST_AGENT_EVALUATION' : 'EXPERIMENT_EXECUTION_FAILED',
    capabilityState: 'READY_VIA_ADAPTER',
    baseSpecSha256,
    fields: plan.fields,
    trialCount: trials.length,
    successfulTrialCount: successful.length,
    fixedRig: { canonicalSha256: rigSha256, value: stableRig },
    heldConstant: ['geometry', 'camera', 'object', 'lighting', 'environment', 'background', 'exposure', 'toneMapping', 'resolution'],
    visualWinner: null,
    visualScoringPerformed: false,
    trials,
  };
  const resultPath = path.join(outputRoot, 'matrix-result.json');
  await fs.writeFile(resultPath, `${JSON.stringify(matrix, null, 2)}\n`, { flag: 'wx' });
  if (!successful.length) fail('EXPERIMENT_EXECUTION_FAILED', 'All matrix trials failed technically', { resultPath, trials });
  return { ...matrix, resultPath };
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(path.resolve(filename), 'utf8'));
}

function parseFlags(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith('--') || value === undefined || value.startsWith('--')) fail('INVALID_ADAPTER_REQUEST', 'CLI flags require --name value pairs');
    if (Object.hasOwn(result, flag)) fail('INVALID_ADAPTER_REQUEST', 'Duplicate CLI flag', { flag });
    result[flag] = value;
  }
  return result;
}

async function main() {
  const [operation, ...argv] = process.argv.slice(2);
  if (operation === 'capabilities') return JSON.parse(await fs.readFile(CAPABILITIES_PATH, 'utf8'));
  const flags = parseFlags(argv);
  if (operation === 'translate') return translateMaterialSpec(await readJson(flags['--spec']), { candidateLabel: flags['--candidate-label'] });
  if (operation === 'build_candidate') {
    return buildCandidate({ materialSpec: await readJson(flags['--spec']), outputDirectory: flags['--output-directory'], candidateLabel: flags['--candidate-label'], engineRoot: flags['--engine-root'] });
  }
  if (operation === 'audit_candidate') return auditCandidate({ glbPath: flags['--glb'], engineRoot: flags['--engine-root'] });
  if (operation === 'render_candidate') {
    const request = await readJson(flags['--request']);
    return renderCandidate({ ...request, engineRoot: flags['--engine-root'], browserExecutable: flags['--browser-executable'] });
  }
  if (operation === 'render_parameter_matrix') {
    const request = await readJson(flags['--request']);
    return renderParameterMatrix({ ...request, outputDirectory: flags['--output-directory'], engineRoot: flags['--engine-root'], browserExecutable: flags['--browser-executable'] });
  }
  if (operation === 'render_structural_proof') {
    const request = await readJson(flags['--request']);
    return renderStructuralCandidateProof({ ...request, outputDirectory: flags['--output-directory'] ?? request.outputDirectory });
  }
  fail('INVALID_ADAPTER_REQUEST', 'Unknown operation', { operation });
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedAsCli) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    const normalized = error instanceof AdapterError
      ? error
      : new AdapterError('ADAPTER_INTERNAL_ERROR', error.message || String(error));
    process.stderr.write(`${JSON.stringify({ status: 'FAIL_CLOSED', code: normalized.code, message: normalized.message, details: normalized.details }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
