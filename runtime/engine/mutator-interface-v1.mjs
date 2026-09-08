import path from 'node:path';

export const INTERFACE_VERSION = 'generic-mutator-v1';

const REQUIRED_FLAGS = new Set(['--config', '--config-sha256', '--staging-root', '--output']);
const RESERVED_VARIANTS = new Set([
  'citrine',
  'smoky',
  'yellow-citrine',
  'smoky-quartz',
]);

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
}

function assertExactKeys(value, expected, label) {
  assertObject(value, label);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} keys must be exactly: ${wanted.join(', ')}`);
  }
}

function assertString(value, label) {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function assertNumber(value, label, minimum, maximum) {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be between ${minimum} and ${maximum}`);
  }
  return value;
}

function assertInteger(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be an integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function validateColor(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be an RGB array`);
  }
  return value.map((channel, index) => assertNumber(channel, `${label}[${index}]`, 0, 1));
}

export function parseMutatorArgs(argv) {
  if (!Array.isArray(argv)) throw new Error('argv must be an array');
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!REQUIRED_FLAGS.has(flag)) throw new Error(`unknown argument: ${String(flag)}`);
    if (Object.hasOwn(parsed, flag)) throw new Error(`duplicate argument: ${flag}`);
    if (value === undefined || REQUIRED_FLAGS.has(value) || String(value).startsWith('--')) {
      throw new Error(`missing value for ${flag}`);
    }
    parsed[flag] = assertString(value, flag);
  }
  for (const flag of REQUIRED_FLAGS) {
    if (!Object.hasOwn(parsed, flag)) throw new Error(`required argument missing: ${flag}`);
  }
  if (!/^[A-F0-9]{64}$/.test(parsed['--config-sha256'])) {
    throw new Error('--config-sha256 must be uppercase SHA-256');
  }
  return Object.freeze({
    config: parsed['--config'],
    configSha256: parsed['--config-sha256'],
    stagingRoot: parsed['--staging-root'],
    output: parsed['--output'],
  });
}

export function validateMutatorConfig(input) {
  assertExactKeys(input, [
    'schemaVersion',
    'interfaceVersion',
    'variantId',
    'targetIdentity',
    'sourceIdentity',
    'geometry',
    'material',
    'artisticInclusions',
    'metadata',
  ], 'config');

  if (input.schemaVersion !== '1.0.0') throw new Error('unsupported schemaVersion');
  if (input.interfaceVersion !== INTERFACE_VERSION) throw new Error('unsupported interfaceVersion');

  const variantId = assertString(input.variantId, 'variantId');
  if (!/^[a-z0-9][a-z0-9._-]{2,63}$/.test(variantId)) throw new Error('variantId has invalid syntax');
  if (RESERVED_VARIANTS.has(variantId.toLowerCase())) throw new Error('historical case variant is not allowed');

  assertExactKeys(input.targetIdentity, ['caseRef', 'candidateId'], 'targetIdentity');
  const targetIdentity = {
    caseRef: assertString(input.targetIdentity.caseRef, 'targetIdentity.caseRef'),
    candidateId: assertString(input.targetIdentity.candidateId, 'targetIdentity.candidateId'),
  };

  assertExactKeys(input.sourceIdentity, ['id', 'sha256', 'kind'], 'sourceIdentity');
  if (!/^[A-F0-9]{64}$/.test(input.sourceIdentity.sha256)) {
    throw new Error('sourceIdentity.sha256 must be uppercase SHA-256');
  }
  if (!['REFERENCE', 'SYNTHETIC'].includes(input.sourceIdentity.kind)) {
    throw new Error('sourceIdentity.kind is unsupported');
  }
  const sourceIdentity = {
    id: assertString(input.sourceIdentity.id, 'sourceIdentity.id'),
    sha256: input.sourceIdentity.sha256,
    kind: input.sourceIdentity.kind,
  };

  assertExactKeys(input.geometry, [
    'diameterMeters',
    'holeDiameterMeters',
    'topBevelOuterDiameterMeters',
    'bottomBevelOuterDiameterMeters',
    'radialSegments',
    'profileSteps',
  ], 'geometry');
  const geometry = {
    diameterMeters: assertNumber(input.geometry.diameterMeters, 'geometry.diameterMeters', 0.001, 1),
    holeDiameterMeters: assertNumber(input.geometry.holeDiameterMeters, 'geometry.holeDiameterMeters', 0.0001, 0.5),
    topBevelOuterDiameterMeters: assertNumber(input.geometry.topBevelOuterDiameterMeters, 'geometry.topBevelOuterDiameterMeters', 0.0002, 0.8),
    bottomBevelOuterDiameterMeters: assertNumber(input.geometry.bottomBevelOuterDiameterMeters, 'geometry.bottomBevelOuterDiameterMeters', 0.0002, 0.8),
    radialSegments: assertInteger(input.geometry.radialSegments, 'geometry.radialSegments', 16, 512),
    profileSteps: assertInteger(input.geometry.profileSteps, 'geometry.profileSteps', 8, 256),
  };
  if (geometry.holeDiameterMeters >= geometry.diameterMeters) throw new Error('hole must be smaller than bead');
  if (geometry.topBevelOuterDiameterMeters <= geometry.holeDiameterMeters || geometry.topBevelOuterDiameterMeters >= geometry.diameterMeters) {
    throw new Error('top bevel diameter must be between hole and bead diameters');
  }
  if (geometry.bottomBevelOuterDiameterMeters <= geometry.holeDiameterMeters || geometry.bottomBevelOuterDiameterMeters >= geometry.diameterMeters) {
    throw new Error('bottom bevel diameter must be between hole and bead diameters');
  }

  assertExactKeys(input.material, [
    'materialName',
    'baseColor',
    'metalness',
    'roughness',
    'transmission',
    'ior',
    'thickness',
    'attenuationColor',
    'attenuationDistance',
    'dispersion',
    'specularIntensity',
    'clearcoat',
    'clearcoatRoughness',
    'envMapIntensity',
  ], 'material');
  const material = {
    materialName: assertString(input.material.materialName, 'material.materialName'),
    baseColor: validateColor(input.material.baseColor, 'material.baseColor'),
    metalness: assertNumber(input.material.metalness, 'material.metalness', 0, 1),
    roughness: assertNumber(input.material.roughness, 'material.roughness', 0, 1),
    transmission: assertNumber(input.material.transmission, 'material.transmission', 0, 1),
    ior: assertNumber(input.material.ior, 'material.ior', 1, 3),
    thickness: assertNumber(input.material.thickness, 'material.thickness', 0, 10),
    attenuationColor: validateColor(input.material.attenuationColor, 'material.attenuationColor'),
    attenuationDistance: assertNumber(input.material.attenuationDistance, 'material.attenuationDistance', 0.000001, 1000),
    dispersion: assertNumber(input.material.dispersion, 'material.dispersion', 0, 10),
    specularIntensity: assertNumber(input.material.specularIntensity, 'material.specularIntensity', 0, 1),
    clearcoat: assertNumber(input.material.clearcoat, 'material.clearcoat', 0, 1),
    clearcoatRoughness: assertNumber(input.material.clearcoatRoughness, 'material.clearcoatRoughness', 0, 1),
    envMapIntensity: assertNumber(input.material.envMapIntensity, 'material.envMapIntensity', 0, 20),
  };

  assertExactKeys(input.artisticInclusions, ['mode'], 'artisticInclusions');
  if (input.artisticInclusions.mode !== 'OFF') {
    throw new Error('artistic inclusions are unsupported and must be explicitly OFF');
  }

  assertExactKeys(input.metadata, ['mineralLabel', 'purpose'], 'metadata');
  const metadata = {
    mineralLabel: assertString(input.metadata.mineralLabel, 'metadata.mineralLabel'),
    purpose: assertString(input.metadata.purpose, 'metadata.purpose'),
  };

  return Object.freeze({
    schemaVersion: input.schemaVersion,
    interfaceVersion: input.interfaceVersion,
    variantId,
    targetIdentity: Object.freeze(targetIdentity),
    sourceIdentity: Object.freeze(sourceIdentity),
    geometry: Object.freeze(geometry),
    material: Object.freeze(material),
    artisticInclusions: Object.freeze({ mode: 'OFF' }),
    metadata: Object.freeze(metadata),
  });
}

export function resolveOutputLocators(args) {
  assertExactKeys(args, ['config', 'configSha256', 'stagingRoot', 'output'], 'args');
  const stagingRoot = path.resolve(args.stagingRoot);
  const outputPath = path.resolve(args.output);
  const relative = path.relative(stagingRoot, outputPath);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('output must be contained by staging root');
  }
  if (path.extname(outputPath).toLowerCase() !== '.glb') throw new Error('output must use .glb extension');
  return Object.freeze({ stagingRoot, outputPath });
}

export function planNewOutput({ args, config, facts }) {
  const locators = resolveOutputLocators(args);
  assertExactKeys(facts, [
    'stagingExists',
    'stagingIsDirectory',
    'stagingIsLink',
    'outputParentExists',
    'outputParentIsDirectory',
    'outputExists',
    'outputAncestorContainsLink',
    'sameVolume',
  ], 'facts');
  if (!facts.stagingExists) throw new Error('staging root does not exist');
  if (!facts.stagingIsDirectory) throw new Error('staging root is not a directory');
  if (facts.stagingIsLink) throw new Error('staging root link is denied');
  if (!facts.outputParentExists) throw new Error('output parent must already exist');
  if (!facts.outputParentIsDirectory) throw new Error('output parent is not a directory');
  if (facts.outputExists) throw new Error('new-output-only violation: output already exists');
  if (facts.outputAncestorContainsLink) throw new Error('output ancestor link is denied');
  if (!facts.sameVolume) throw new Error('cross-volume output is denied');

  return Object.freeze({
    interfaceVersion: INTERFACE_VERSION,
    configPath: path.resolve(args.config),
    stagingRoot: locators.stagingRoot,
    outputPath: locators.outputPath,
    variantId: config.variantId,
    targetIdentity: config.targetIdentity,
    sourceIdentity: config.sourceIdentity,
    artisticInclusions: 'OFF',
    newOutputOnly: true,
  });
}
