import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createDepthAwareRefraction, DEPTH_AWARE_REFRACTION_V1, DEPTH_AWARE_REFRACTION_V1_REFINED } from './depth-aware-refraction-v1.mjs';
import { createBoundedSequentialRefraction, BOUNDED_SEQUENTIAL_REFRACTION_V1, CONTINUOUS_OPTICAL_SURFACE_V1 } from './bounded-sequential-refraction-v1.mjs';
import { LOOP_LIMIT_OPTICAL_SURFACE_V1 } from './loop-limit-optical-surface-v1.mjs';

const stages = [];
const state = {
  status: 'INITIALIZING',
  stages,
  rendererIdentity: null,
  materialPath: 'GLB_NATIVE_MATERIAL',
  materials: [],
  warnings: [],
  capabilityLimitations: [],
  shaderFallback: 'FAIL_CLOSED',
};
window.__GENERIC_RENDER_STATE__ = state;

function mark(stage) {
  stages.push(stage);
  state.status = stage;
}

function toneMapping(name) {
  if (name === 'ACES_FILMIC') return THREE.ACESFilmicToneMapping;
  if (name === 'NONE') return THREE.NoToneMapping;
  throw new Error(`Unsupported tone mapping: ${name}`);
}

function color(value) {
  return new THREE.Color(value);
}

function srgbBytes(value) {
  return [
    Number.parseInt(value.slice(1, 3), 16),
    Number.parseInt(value.slice(3, 5), 16),
    Number.parseInt(value.slice(5, 7), 16),
  ];
}

function createVerticalGradientTexture(topColor, bottomColor, size = 64) {
  const top = srgbBytes(topColor);
  const bottom = srgbBytes(bottomColor);
  const bytes = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    const mix = y / (size - 1);
    for (let x = 0; x < size; x += 1) {
      const offset = ((y * size) + x) * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        bytes[offset + channel] = Math.round((top[channel] * (1 - mix)) + (bottom[channel] * mix));
      }
      bytes[offset + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(bytes, size, size, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createTransmissionBackdrop(spec, candidateRoot, camera) {
  if (!spec) return null;
  if (spec.mode !== 'VERTICAL_GRADIENT') throw new Error(`Unsupported transmission backdrop mode: ${spec.mode}`);

  const bounds = new THREE.Box3().setFromObject(candidateRoot);
  if (bounds.isEmpty()) throw new Error('Candidate bounds are empty');
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const viewDirection = new THREE.Vector3();
  camera.getWorldDirection(viewDirection);
  const texture = createVerticalGradientTexture(spec.topColor, spec.bottomColor);
  const geometry = new THREE.PlaneGeometry(sphere.radius * 8, sphere.radius * 8);
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'generic_transmission_backdrop_v1';
  mesh.position.copy(sphere.center).addScaledVector(viewDirection, sphere.radius * 4);
  mesh.quaternion.copy(camera.quaternion);
  mesh.updateMatrixWorld(true);
  return {
    mesh,
    dispose() {
      geometry.dispose();
      material.dispose();
      texture.dispose();
    },
    metadata: {
      mode: spec.mode,
      topColor: spec.topColor,
      bottomColor: spec.bottomColor,
      representation: 'OPAQUE_SCENE_BACKDROP_SAMPLED_BY_GLB_NATIVE_TRANSMISSION',
      candidateMaterialMutationCount: 0,
    },
  };
}

function materialMetadata(root) {
  const seen = new Set();
  const materials = [];
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) {
      if (!material || seen.has(material.uuid)) continue;
      seen.add(material.uuid);
      materials.push({
        name: material.name || null,
        runtimeClass: material.type,
        isMeshPhysicalMaterial: Boolean(material.isMeshPhysicalMaterial),
        isMeshStandardMaterial: Boolean(material.isMeshStandardMaterial),
        transmission: Number.isFinite(material.transmission) ? material.transmission : null,
        ior: Number.isFinite(material.ior) ? material.ior : null,
      });
    }
  });
  return materials;
}

function nextFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

try {
  const rigResponse = await fetch('/rig.json', { cache: 'no-store' });
  if (!rigResponse.ok) throw new Error(`Rig request failed: ${rigResponse.status}`);
  const rig = await rigResponse.json();
  mark('RIG_LOADED');

  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    preserveDrawingBuffer: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(rig.render.pixelRatio);
  renderer.setSize(rig.render.width, rig.render.height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = toneMapping(rig.render.toneMapping);
  renderer.toneMappingExposure = rig.render.exposure;
  renderer.shadowMap.enabled = false;
  document.body.append(renderer.domElement);
  state.rendererIdentity = {
    engine: 'three-webgl-generic-renderer-v1',
    threeRevision: THREE.REVISION,
    userAgent: navigator.userAgent,
    webglVersion: renderer.capabilities.isWebGL2 ? 'WebGL2' : 'WebGL1',
    precision: renderer.capabilities.precision,
  };

  const scene = new THREE.Scene();
  scene.background = color(rig.background.color);

  let environmentTarget = null;
  if (rig.environment.mode === 'ROOM') {
    const generator = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    environmentTarget = generator.fromScene(room, 0.04);
    scene.environment = environmentTarget.texture;
    scene.environmentIntensity = rig.environment.intensity;
    room.dispose();
    generator.dispose();
  } else if (rig.environment.mode !== 'NONE') {
    throw new Error(`Unsupported environment mode: ${rig.environment.mode}`);
  }
  mark('ENVIRONMENT_READY');

  const ambient = new THREE.AmbientLight(
    color(rig.lighting.ambient.color),
    rig.lighting.ambient.intensity,
  );
  const key = new THREE.DirectionalLight(
    color(rig.lighting.key.color),
    rig.lighting.key.intensity,
  );
  key.position.fromArray(rig.lighting.key.position);
  scene.add(ambient, key);

  const camera = new THREE.PerspectiveCamera(
    rig.camera.fov,
    rig.render.width / rig.render.height,
    rig.camera.near,
    rig.camera.far,
  );
  camera.position.fromArray(rig.camera.position);
  camera.lookAt(new THREE.Vector3().fromArray(rig.camera.target));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();

  const candidate = await new GLTFLoader().loadAsync('/candidate.glb');
  mark('MODEL_LOADED');
  candidate.scene.position.fromArray(rig.object.position);
  candidate.scene.rotation.fromArray(rig.object.rotation);
  candidate.scene.scale.fromArray(rig.object.scale);
  candidate.scene.updateMatrixWorld(true);
  state.materials = materialMetadata(candidate.scene);
  if (state.materials.length === 0) throw new Error('Candidate has no renderable material');
  const transmissionBackdrop = createTransmissionBackdrop(
    rig.background.transmissionBackdrop,
    candidate.scene,
    camera,
  );
  if (transmissionBackdrop) {
    scene.add(transmissionBackdrop.mesh);
    state.transmissionBackdrop = transmissionBackdrop.metadata;
    mark('TRANSMISSION_BACKDROP_READY');
  } else {
    state.transmissionBackdrop = null;
  }
  scene.add(candidate.scene);
  mark('MATERIAL_READY');

  let depthAwareRefraction = null;
  let sequentialRefraction = null;
  if (['DEPTH_AWARE_V1', 'DEPTH_AWARE_V1_REFINED'].includes(rig.refraction?.mode)) {
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      const detail = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join(' | ');
      throw new Error(`${rig.refraction.mode}_SHADER_COMPILE_FAILED: ${detail || 'unknown shader compiler error'}`);
    };
    depthAwareRefraction = createDepthAwareRefraction({ renderer, scene, camera, candidate: candidate.scene, width: rig.render.width, height: rig.render.height, mode: rig.refraction.mode });
    depthAwareRefraction.captureBackfaceDepth();
    const identity = rig.refraction.mode === 'DEPTH_AWARE_V1_REFINED' ? DEPTH_AWARE_REFRACTION_V1_REFINED : DEPTH_AWARE_REFRACTION_V1;
    state.refraction = { ...identity, fallbackStatus: 'NOT_USED', objectDiameter: depthAwareRefraction.objectDiameter, augmentedMaterialCount: depthAwareRefraction.materialCount, winding: depthAwareRefraction.winding, exitCaptureSide: depthAwareRefraction.exitCaptureSide };
    mark('DEPTH_AWARE_REFRACTION_READY');
  } else if (['SEQUENTIAL_V1', 'SEQUENTIAL_OPTICAL_SURFACE_V1', 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1'].includes(rig.refraction?.mode)) {
    const s42OpticalSurface = rig.refraction.mode === 'SEQUENTIAL_OPTICAL_SURFACE_V1';
    const s43OpticalSurface = rig.refraction.mode === 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1';
    const separateOpticalSurface = s42OpticalSurface || s43OpticalSurface;
    renderer.debug.onShaderError = (gl, program, vertexShader, fragmentShader) => {
      const detail = [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader)].filter(Boolean).join(' | ');
      throw new Error(`${rig.refraction.mode}_SHADER_COMPILE_FAILED: ${detail || 'unknown shader compiler error'}`);
    };
    const opticalSurfaceMode = s42OpticalSurface ? CONTINUOUS_OPTICAL_SURFACE_V1.opticalSurfaceMode : s43OpticalSurface ? LOOP_LIMIT_OPTICAL_SURFACE_V1.opticalSurfaceMode : 'VISUAL_TRIANGLE_MESH';
    sequentialRefraction = createBoundedSequentialRefraction({ renderer, candidate: candidate.scene, maxInterfaces: rig.refraction.maxInterfaces, opticalSurfaceMode, opticalSurfaceLevel: separateOpticalSurface ? rig.refraction.opticalSurfaceLevel : 0 });
    const opticalSurfaceSha256 = await sequentialRefraction.opticalSurfaceSha256Promise;
    const sourceTopologySha256 = await sequentialRefraction.sourceTopologySha256Promise;
    const opticalSurfaceDerivationSha256 = await sequentialRefraction.opticalSurfaceDerivationSha256Promise;
    const identity = s42OpticalSurface ? CONTINUOUS_OPTICAL_SURFACE_V1 : s43OpticalSurface ? LOOP_LIMIT_OPTICAL_SURFACE_V1 : BOUNDED_SEQUENTIAL_REFRACTION_V1;
    state.refraction = {
      ...identity,
      fallbackStatus: 'NOT_USED',
      terminationReason: 'GPU_PER_FRAGMENT_BOUNDED_OR_ENVIRONMENT_ESCAPE',
      interfacesUsed: { minimum: 1, maximum: 4, reporting: 'SUMMARY_ONLY' },
      triangleCount: sequentialRefraction.triangleCount,
      visualTriangleCount: sequentialRefraction.visualTriangleCount,
      bvhNodeCount: sequentialRefraction.nodeCount,
      bvhDepth: sequentialRefraction.bvhDepth,
      bvhLeafSize: sequentialRefraction.leafSize,
      sourceMeshes: sequentialRefraction.sourceMeshes,
      preprocessingMs: sequentialRefraction.preprocessingMs,
      extractionMs: sequentialRefraction.extractionMs,
      opticalSurfacePreprocessingMs: sequentialRefraction.opticalSurfacePreprocessingMs,
      bvhBuildMs: sequentialRefraction.bvhBuildMs,
      gpuResourceBytes: sequentialRefraction.gpuResourceBytes,
      worldScale: sequentialRefraction.worldScale,
      epsilon: sequentialRefraction.epsilon,
      visualGeometrySha256: 'CANDIDATE_GLB_SHA_FROM_MANIFEST',
      sourceTopologySha256,
      opticalSurfaceSha256,
      opticalSurfaceDerivationSha256,
      opticalSurfaceMode: sequentialRefraction.opticalSurfaceMode,
      opticalSurfaceVersion: sequentialRefraction.opticalSurfaceVersion,
      opticalSurfaceLevel: sequentialRefraction.opticalSurfaceLevel,
      opticalSurfaceDivisions: sequentialRefraction.opticalSurfaceDivisions,
      opticalSurfaceProjectionStrength: sequentialRefraction.opticalSurfaceProjectionStrength,
      opticalSurfaceMaximumProjectionRatio: sequentialRefraction.opticalSurfaceMaximumProjectionRatio,
      opticalSurfaceMaximumDisplacementRatioObserved: sequentialRefraction.opticalSurfaceMaximumDisplacementRatioObserved,
      opticalSurfaceOrientationCorrections: sequentialRefraction.opticalSurfaceOrientationCorrections,
      opticalSurfaceCoincidentNormalAuthority: sequentialRefraction.opticalSurfaceCoincidentNormalAuthority,
      opticalSurfaceNormalAuthority: sequentialRefraction.opticalSurfaceNormalAuthority,
      opticalSurfaceTopologyPolicy: sequentialRefraction.opticalSurfaceTopologyPolicy,
      opticalSurfaceContinuityClass: sequentialRefraction.opticalSurfaceContinuityClass,
      opticalIntersectionContinuityClass: sequentialRefraction.opticalIntersectionContinuityClass,
      opticalSurfaceDerivationDeterminism: sequentialRefraction.opticalSurfaceDerivationDeterminism,
      opticalSurfaceAdjacency: sequentialRefraction.opticalSurfaceAdjacency,
      opticalSurfaceRefinedAdjacency: sequentialRefraction.opticalSurfaceRefinedAdjacency,
      opticalSurfaceBoundaryPolicy: sequentialRefraction.opticalSurfaceBoundaryPolicy,
      opticalSurfaceExtraordinaryVertexPolicy: sequentialRefraction.opticalSurfaceExtraordinaryVertexPolicy,
      opticalSurfaceProxySemantics: sequentialRefraction.opticalSurfaceProxySemantics,
      geometricNormalPolicy: 'TRIANGLE_WINDING_GEOMETRIC_NORMAL_FOR_MEDIUM_BOUNDARIES',
      materialThicknessRole: 'IGNORED_FOR_TRUE_GEOMETRIC_SEGMENTS',
      externalSceneRayTracing: 'NOT_IMPLEMENTED',
      finalBackgroundResolve: 'RASTER_TRANSMISSION_BUFFER_AT_PROJECTED_OUTGOING_RAY',
    };
    mark(s43OpticalSurface ? 'LOOP_LIMIT_OPTICAL_SURFACE_REFRACTION_READY' : s42OpticalSurface ? 'CONTINUOUS_OPTICAL_SURFACE_REFRACTION_READY' : 'SEQUENTIAL_REFRACTION_READY');
  } else {
    state.refraction = { mode: 'LEGACY', algorithm: 'THREE_R185_MESH_PHYSICAL_MATERIAL_TRANSMISSION', auxiliaryDepthMode: 'NONE', fallbackStatus: 'NOT_APPLICABLE' };
  }

  try {
    await renderer.compileAsync(scene, camera);
  } catch (error) {
    throw new Error(`UNSUPPORTED_SHADER_REQUIREMENT: ${error.message || String(error)}`);
  }
  mark('SHADER_READY');

  renderer.render(scene, camera);
  await nextFrame();
  renderer.render(scene, camera);
  await nextFrame();
  renderer.render(scene, camera);
  mark('FIRST_STABLE_FRAME_READY');

  state.status = 'RENDER_READY';
  state.width = rig.render.width;
  state.height = rig.render.height;
  state.materialPreserved = true;
  state.runtimeMaterialOverrideCount = 0;
  state.shaderFallbackActive = false;
  state.drawCalls = renderer.info.render.calls;
  state.triangles = renderer.info.render.triangles;
  state.seed = rig.seed;
  state.stages.push('RENDER_READY');

  window.addEventListener('unload', () => {
    depthAwareRefraction?.dispose();
    sequentialRefraction?.dispose();
    transmissionBackdrop?.dispose();
    environmentTarget?.dispose();
    renderer.dispose();
  }, { once: true });
} catch (error) {
  state.status = 'RENDER_ERROR';
  state.error = error.message || String(error);
  state.stages.push('RENDER_ERROR');
}
