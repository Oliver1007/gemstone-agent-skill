import * as THREE from 'three';

export const DEPTH_AWARE_REFRACTION_V1 = Object.freeze({
  mode: 'DEPTH_AWARE_V1',
  algorithm: 'GENERIC_FRONT_BACK_DEPTH_MODULATED_TRANSMISSION_V1',
  auxiliaryDepthMode: 'CANDIDATE_BACKFACE_DEPTH_TEXTURE',
  pathLengthAwareness: 'LOCAL_GEOMETRIC_DEPTH_AWARE_APPROXIMATION',
});

export const DEPTH_AWARE_REFRACTION_V1_REFINED = Object.freeze({
  mode: 'DEPTH_AWARE_V1_REFINED',
  algorithm: 'GENERIC_CONFIDENCE_WEIGHTED_DEPTH_MODULATED_TRANSMISSION_V1',
  auxiliaryDepthMode: 'CANDIDATE_BACKFACE_DEPTH_TEXTURE',
  pathLengthAwareness: 'CONFIDENCE_WEIGHTED_LOCAL_GEOMETRIC_DEPTH_AWARE_APPROXIMATION',
  legacyThicknessRole: 'SAFETY_PRIOR_WHEN_LOCAL_DEPTH_OR_VIEW_CONFIDENCE_IS_WEAK',
});

export function depthAwareThicknessFactor(localDepth, objectDiameter, minimumFactor = 0.12) {
  if (![localDepth, objectDiameter, minimumFactor].every(Number.isFinite)) throw new TypeError('Depth inputs must be finite');
  if (localDepth < 0 || objectDiameter <= 0 || minimumFactor < 0 || minimumFactor > 1) throw new RangeError('Depth inputs are outside the supported range');
  const normalized = Math.min(1, localDepth / objectDiameter);
  return minimumFactor + ((1 - minimumFactor) * normalized);
}

export function refinedDepthAwareThicknessFactor(localDepth, objectDiameter, viewFacing) {
  if (![localDepth, objectDiameter, viewFacing].every(Number.isFinite)) throw new TypeError('Refined depth inputs must be finite');
  if (localDepth < 0 || objectDiameter <= 0 || viewFacing < 0 || viewFacing > 1) throw new RangeError('Refined depth inputs are outside the supported range');
  const ratio = Math.min(1, localDepth / objectDiameter);
  const shapedRatio = Math.sqrt(ratio);
  const localFactor = 0.65 + (0.35 * shapedRatio);
  const smoothstep = (low, high, value) => {
    const x = Math.max(0, Math.min(1, (value - low) / (high - low)));
    return x * x * (3 - (2 * x));
  };
  const confidence = smoothstep(0.02, 0.25, ratio) * smoothstep(0.10, 0.55, viewFacing);
  return 1 + ((localFactor - 1) * confidence);
}

function transmissionMaterials(root) {
  const materials = new Set();
  root.traverse((object) => {
    if (!object.isMesh) return;
    const list = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of list) if (material?.isMeshPhysicalMaterial && material.transmission > 0) materials.add(material);
  });
  return [...materials];
}

export function candidateSignedVolume(root) {
  let volume = 0;
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (!object.isMesh) return;
    const position = object.geometry?.getAttribute('position');
    if (!position) return;
    const index = object.geometry.getIndex();
    const triangleCount = index ? index.count / 3 : position.count / 3;
    for (let triangle = 0; triangle < triangleCount; triangle += 1) {
      const ia = index ? index.getX(triangle * 3) : triangle * 3;
      const ib = index ? index.getX((triangle * 3) + 1) : (triangle * 3) + 1;
      const ic = index ? index.getX((triangle * 3) + 2) : (triangle * 3) + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(object.matrixWorld);
      volume += a.dot(b.clone().cross(c)) / 6;
    }
  });
  return volume;
}

export function createDepthAwareRefraction({ renderer, scene, camera, candidate, width, height, mode = 'DEPTH_AWARE_V1' }) {
  const identity = mode === 'DEPTH_AWARE_V1_REFINED' ? DEPTH_AWARE_REFRACTION_V1_REFINED : DEPTH_AWARE_REFRACTION_V1;
  if (!renderer.capabilities.isWebGL2) throw new Error('DEPTH_AWARE_V1_REQUIRES_WEBGL2_DEPTH_TEXTURE');
  const bounds = new THREE.Box3().setFromObject(candidate);
  if (bounds.isEmpty()) throw new Error('DEPTH_AWARE_V1_CANDIDATE_BOUNDS_EMPTY');
  const sphere = bounds.getBoundingSphere(new THREE.Sphere());
  const objectDiameter = sphere.radius * 2;
  if (!Number.isFinite(objectDiameter) || objectDiameter <= 0) throw new Error('DEPTH_AWARE_V1_CANDIDATE_SCALE_INVALID');
  const materials = transmissionMaterials(candidate);
  if (materials.length === 0) throw new Error('DEPTH_AWARE_V1_REQUIRES_TRANSMISSIVE_PHYSICAL_MATERIAL');

  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  const signedVolume = candidateSignedVolume(candidate);
  if (!Number.isFinite(signedVolume) || Math.abs(signedVolume) < 1e-15) throw new Error('DEPTH_AWARE_V1_REQUIRES_CLOSED_ORIENTABLE_VOLUME');
  const exitSide = signedVolume > 0 ? THREE.BackSide : THREE.FrontSide;
  const backfaceDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: exitSide });
  backfaceDepthMaterial.blending = THREE.NoBlending;
  const uniforms = {
    map: { value: target.texture },
    resolution: { value: new THREE.Vector2(width, height) },
    near: { value: camera.near },
    far: { value: camera.far },
    objectDiameter: { value: objectDiameter },
    minimumFactor: { value: 0.12 },
  };

  for (const material of materials) {
    const previousCompile = material.onBeforeCompile;
    const previousCacheKey = material.customProgramCacheKey;
    material.onBeforeCompile = (shader, renderObject) => {
      previousCompile?.call(material, shader, renderObject);
      shader.uniforms.r31BackDepthMap = uniforms.map;
      shader.uniforms.r31DepthResolution = uniforms.resolution;
      shader.uniforms.r31CameraNear = uniforms.near;
      shader.uniforms.r31CameraFar = uniforms.far;
      shader.uniforms.r31ObjectDiameter = uniforms.objectDiameter;
      shader.uniforms.r31MinimumThicknessFactor = uniforms.minimumFactor;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_pars_fragment>',
        `#include <transmission_pars_fragment>\n#ifdef USE_TRANSMISSION\nuniform sampler2D r31BackDepthMap;\nuniform vec2 r31DepthResolution;\nuniform float r31CameraNear;\nuniform float r31CameraFar;\nuniform float r31ObjectDiameter;\nuniform float r31MinimumThicknessFactor;\nfloat r31PerspectiveDepthToViewZ( const in float invClipZ, const in float near, const in float far ) {\n  return ( near * far ) / ( ( far - near ) * invClipZ - far );\n}\n#endif`,
      );
      const transmissionBody = THREE.ShaderChunk.transmission_fragment.replace(
        'material.thickness = thickness;',
        'material.thickness = r31EffectiveThickness;',
      );
      const thicknessMapping = mode === 'DEPTH_AWARE_V1_REFINED'
        ? `\tfloat r31ShapedDepthRatio = sqrt( r31LocalDepthRatio );\n\tfloat r31LocalThicknessFactor = mix( 0.65, 1.0, r31ShapedDepthRatio );\n\tfloat r31ViewFacing = abs( dot( normalize( normal ), normalize( vViewPosition ) ) );\n\tfloat r31DepthConfidence = smoothstep( 0.02, 0.25, r31LocalDepthRatio );\n\tfloat r31ViewConfidence = smoothstep( 0.10, 0.55, r31ViewFacing );\n\tfloat r31Confidence = r31DepthConfidence * r31ViewConfidence;\n\tfloat r31EffectiveThickness = thickness * mix( 1.0, r31LocalThicknessFactor, r31Confidence );`
        : `\tfloat r31EffectiveThickness = thickness * mix( r31MinimumThicknessFactor, 1.0, r31LocalDepthRatio );`;
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <transmission_fragment>',
        `#ifdef USE_TRANSMISSION\n\tvec2 r31DepthUv = gl_FragCoord.xy / r31DepthResolution;\n\tvec4 r31PackedBackDepth = texture2D( r31BackDepthMap, r31DepthUv );\n\tfloat r31BackDepth = dot( r31PackedBackDepth, vec4( 255.0 / 256.0, 255.0 / 65536.0, 255.0 / 16777216.0, 1.0 / 16777216.0 ) );\n\tfloat r31FrontViewZ = r31PerspectiveDepthToViewZ( gl_FragCoord.z, r31CameraNear, r31CameraFar );\n\tfloat r31BackViewZ = r31PerspectiveDepthToViewZ( r31BackDepth, r31CameraNear, r31CameraFar );\n\tfloat r31LocalDepth = max( 0.0, abs( r31BackViewZ - r31FrontViewZ ) );\n\tfloat r31LocalDepthRatio = clamp( r31LocalDepth / r31ObjectDiameter, 0.0, 1.0 );\n${thicknessMapping}\n#endif\n${transmissionBody}`,
      );
    };
    material.customProgramCacheKey = () => `${previousCacheKey?.call(material) ?? ''}|${identity.algorithm}`;
    material.needsUpdate = true;
  }

  function captureBackfaceDepth() {
    const previousTarget = renderer.getRenderTarget();
    const previousOverride = scene.overrideMaterial;
    const previousBackground = scene.background;
    const hidden = [];
    for (const child of scene.children) {
      if (child === candidate || !child.visible) continue;
      hidden.push(child);
      child.visible = false;
    }
    scene.overrideMaterial = backfaceDepthMaterial;
    scene.background = null;
    renderer.setRenderTarget(target);
    renderer.clear(true, true, true);
    renderer.render(scene, camera);
    renderer.setRenderTarget(previousTarget);
    scene.overrideMaterial = previousOverride;
    scene.background = previousBackground;
    for (const child of hidden) child.visible = true;
  }

  return {
    identity,
    objectDiameter,
    materialCount: materials.length,
    winding: signedVolume > 0 ? 'OUTWARD' : 'INWARD',
    exitCaptureSide: exitSide === THREE.BackSide ? 'BACK_SIDE' : 'FRONT_SIDE_FOR_INVERTED_WINDING',
    captureBackfaceDepth,
    resize(nextWidth, nextHeight) { target.setSize(nextWidth, nextHeight); uniforms.resolution.value.set(nextWidth, nextHeight); },
    dispose() { backfaceDepthMaterial.dispose(); target.dispose(); },
  };
}
