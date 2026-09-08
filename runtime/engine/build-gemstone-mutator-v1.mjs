import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  parseMutatorArgs,
  planNewOutput,
  resolveOutputLocators,
  validateMutatorConfig,
} from './mutator-interface-v1.mjs';

if (!globalThis.FileReader) {
  globalThis.FileReader = class FileReader {
    result = null;
    onloadend = null;
    onerror = null;
    async readAsArrayBuffer(blob) {
      try {
        this.result = await blob.arrayBuffer();
        this.onloadend?.();
      } catch (error) {
        this.onerror?.(error);
      }
    }
    async readAsDataURL(blob) {
      try {
        const bytes = Buffer.from(await blob.arrayBuffer());
        this.result = `data:${blob.type || 'application/octet-stream'};base64,${bytes.toString('base64')}`;
        this.onloadend?.();
      } catch (error) {
        this.onerror?.(error);
      }
    }
  };
}

function volumeIdentity(filePath) {
  return path.parse(path.resolve(filePath)).root.toLowerCase();
}

async function pathExists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function existingAncestorContainsLink(stagingRoot, outputPath) {
  let current = path.dirname(outputPath);
  const boundary = path.resolve(stagingRoot);
  while (true) {
    if (await pathExists(current)) {
      const stat = await fs.lstat(current);
      if (stat.isSymbolicLink()) return true;
    }
    if (current === boundary) return false;
    const parent = path.dirname(current);
    if (parent === current) return true;
    current = parent;
  }
}

async function collectRuntimeFacts(stagingRoot, outputPath) {
  let stagingStat;
  try {
    stagingStat = await fs.lstat(stagingRoot);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let outputParentStat;
  try {
    outputParentStat = await fs.lstat(path.dirname(outputPath));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    stagingExists: Boolean(stagingStat),
    stagingIsDirectory: Boolean(stagingStat?.isDirectory()),
    stagingIsLink: Boolean(stagingStat?.isSymbolicLink()),
    outputParentExists: Boolean(outputParentStat),
    outputParentIsDirectory: Boolean(outputParentStat?.isDirectory()),
    outputExists: await pathExists(outputPath),
    outputAncestorContainsLink: stagingStat
      ? await existingAncestorContainsLink(stagingRoot, outputPath)
      : false,
    sameVolume: volumeIdentity(stagingRoot) === volumeIdentity(outputPath),
  };
}

function createBeadGeometry(spec) {
  const radius = spec.diameterMeters / 2;
  const holeRadius = spec.holeDiameterMeters / 2;
  const topOuterRadius = spec.topBevelOuterDiameterMeters / 2;
  const bottomOuterRadius = spec.bottomBevelOuterDiameterMeters / 2;
  const topY = Math.sqrt((radius * radius) - (topOuterRadius * topOuterRadius));
  const bottomY = -Math.sqrt((radius * radius) - (bottomOuterRadius * bottomOuterRadius));
  const profile = [];
  for (let index = 0; index <= spec.profileSteps; index += 1) {
    const y = topY + ((bottomY - topY) * index / spec.profileSteps);
    profile.push(new THREE.Vector2(Math.sqrt(Math.max(0, (radius * radius) - (y * y))), y));
  }
  profile.push(new THREE.Vector2(holeRadius, bottomY));
  profile.push(new THREE.Vector2(holeRadius, topY));
  profile.push(new THREE.Vector2(topOuterRadius, topY));
  const rawGeometry = new THREE.LatheGeometry(profile, spec.radialSegments);
  rawGeometry.deleteAttribute('uv');
  rawGeometry.deleteAttribute('normal');
  const geometry = mergeVertices(rawGeometry, 1e-9);
  geometry.computeVertexNormals();
  geometry.name = 'generic_bead_new_output_v1';
  return geometry;
}

function createMaterial(spec) {
  const material = new THREE.MeshPhysicalMaterial({
    name: spec.materialName,
    color: new THREE.Color(...spec.baseColor),
    metalness: spec.metalness,
    roughness: spec.roughness,
    transmission: spec.transmission,
    ior: spec.ior,
    thickness: spec.thickness,
    attenuationColor: new THREE.Color(...spec.attenuationColor),
    attenuationDistance: spec.attenuationDistance,
    dispersion: spec.dispersion,
    specularIntensity: spec.specularIntensity,
    clearcoat: spec.clearcoat,
    clearcoatRoughness: spec.clearcoatRoughness,
    envMapIntensity: spec.envMapIntensity,
  });
  material.side = THREE.DoubleSide;
  return material;
}

function exportBinary(scene) {
  const exporter = new GLTFExporter();
  return new Promise((resolve, reject) => {
    exporter.parse(scene, resolve, reject, { binary: true, onlyVisible: true });
  });
}

async function main() {
  const args = parseMutatorArgs(process.argv.slice(2));
  const configBytes = await fs.readFile(path.resolve(args.config));
  const actualConfigSha256 = crypto.createHash('sha256').update(configBytes).digest('hex').toUpperCase();
  if (actualConfigSha256 !== args.configSha256) throw new Error('config SHA-256 mismatch');
  const config = validateMutatorConfig(JSON.parse(configBytes.toString('utf8')));
  const locators = resolveOutputLocators(args);
  const facts = await collectRuntimeFacts(locators.stagingRoot, locators.outputPath);
  const plan = planNewOutput({ args, config, facts });

  const scene = new THREE.Scene();
  scene.name = `generic_mutator_${config.variantId}`;
  const mesh = new THREE.Mesh(createBeadGeometry(config.geometry), createMaterial(config.material));
  mesh.name = `generic_bead_${config.variantId}`;
  mesh.userData = {
    interfaceVersion: config.interfaceVersion,
    variantId: config.variantId,
    targetIdentity: config.targetIdentity,
    sourceIdentity: config.sourceIdentity,
    artisticInclusions: 'OFF',
    approximation: false,
    metadata: config.metadata,
  };
  scene.add(mesh);

  const binary = await exportBinary(scene);
  let handle;
  let created = false;
  let failure;
  try {
    handle = await fs.open(plan.outputPath, 'wx');
    created = true;
    await handle.writeFile(Buffer.from(binary));
    await handle.sync();
  } catch (error) {
    failure = error;
  }
  try {
    await handle?.close();
  } catch (error) {
    failure ??= error;
  }
  if (failure) {
    if (created) await fs.unlink(plan.outputPath).catch(() => {});
    throw failure;
  }

  process.stdout.write(`${JSON.stringify({
    status: 'NEW_OUTPUT_CREATED',
    interfaceVersion: plan.interfaceVersion,
    outputPath: plan.outputPath,
    targetIdentity: plan.targetIdentity,
    sourceIdentity: plan.sourceIdentity,
  })}\n`);
}

main().catch((error) => {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL_CLOSED', error: error.message })}\n`);
  process.exitCode = 1;
});
