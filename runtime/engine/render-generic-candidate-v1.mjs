import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ENGINE_ROOT = path.dirname(fileURLToPath(import.meta.url));
const ENTRYPOINT = fileURLToPath(import.meta.url);
const ALLOWED_FLAGS = new Set(['--glb', '--rig', '--out', '--browser']);
const ALLOWED_REQUIRED_EXTENSIONS = new Set([
  'KHR_materials_clearcoat',
  'KHR_materials_dispersion',
  'KHR_materials_emissive_strength',
  'KHR_materials_ior',
  'KHR_materials_iridescence',
  'KHR_materials_sheen',
  'KHR_materials_specular',
  'KHR_materials_transmission',
  'KHR_materials_unlit',
  'KHR_materials_volume',
  'KHR_texture_transform',
]);

export class GenericRenderError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'GenericRenderError';
    this.code = code;
    this.details = details;
  }
}

function fail(code, message, details) {
  throw new GenericRenderError(code, message, details);
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactObject(value, allowed, required, label, code = 'INVALID_RENDER_RIG') {
  if (!isObject(value)) fail(code, `${label} must be an object`);
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  const missing = required.filter((key) => !Object.hasOwn(value, key));
  if (unknown.length || missing.length) fail(code, `${label} keys are invalid`, { unknown, missing });
}

function stringValue(value, label, code = 'INVALID_RENDER_RIG') {
  if (typeof value !== 'string' || value.trim() === '') fail(code, `${label} must be a non-empty string`);
  return value.trim();
}

function numberValue(value, label, minimum, maximum, exclusiveMinimum = false) {
  if (!Number.isFinite(value) || (exclusiveMinimum ? value <= minimum : value < minimum) || value > maximum) {
    fail('INVALID_RENDER_RIG', `${label} is outside the supported range`, { value, minimum, maximum, exclusiveMinimum });
  }
  return value;
}

function integerValue(value, label, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    fail('INVALID_RENDER_RIG', `${label} must be an integer in the supported range`, { value, minimum, maximum });
  }
  return value;
}

function vector3(value, label, positive = false) {
  if (!Array.isArray(value) || value.length !== 3 || value.some((item) => !Number.isFinite(item) || (positive && item <= 0))) {
    fail('INVALID_RENDER_RIG', `${label} must be a finite three-number array${positive ? ' with positive values' : ''}`);
  }
  return [...value];
}

function hexColor(value, label) {
  if (typeof value !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(value)) fail('INVALID_RENDER_RIG', `${label} must be #RRGGBB`);
  return value.toUpperCase();
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

export function canonicalStringify(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8');
  return crypto.createHash('sha256').update(bytes).digest('hex').toUpperCase();
}

export function validateRenderRig(input) {
  exactObject(input, ['schemaVersion', 'camera', 'object', 'background', 'lighting', 'environment', 'render', 'refraction', 'seed'], ['schemaVersion', 'camera', 'object', 'background', 'lighting', 'environment', 'render', 'seed'], 'rig');
  if (input.schemaVersion !== '1.0.0') fail('INVALID_RENDER_RIG', 'Unsupported rig schemaVersion');

  exactObject(input.camera, ['type', 'position', 'target', 'fov', 'near', 'far'], ['type', 'position', 'target', 'fov', 'near', 'far'], 'rig.camera');
  if (input.camera.type !== 'perspective') fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Only perspective camera is supported');
  const camera = {
    type: 'perspective',
    position: vector3(input.camera.position, 'rig.camera.position'),
    target: vector3(input.camera.target, 'rig.camera.target'),
    fov: numberValue(input.camera.fov, 'rig.camera.fov', 1, 179),
    near: numberValue(input.camera.near, 'rig.camera.near', 0, 1000, true),
    far: numberValue(input.camera.far, 'rig.camera.far', 0, 1_000_000, true),
  };
  if (camera.far <= camera.near) fail('INVALID_RENDER_RIG', 'camera far must be greater than near');

  exactObject(input.object, ['rotation', 'position', 'scale'], ['rotation', 'position', 'scale'], 'rig.object');
  const object = {
    rotation: vector3(input.object.rotation, 'rig.object.rotation'),
    position: vector3(input.object.position, 'rig.object.position'),
    scale: vector3(input.object.scale, 'rig.object.scale', true),
  };

  exactObject(input.background, ['color', 'transmissionBackdrop'], ['color'], 'rig.background');
  const background = { color: hexColor(input.background.color, 'rig.background.color') };
  if (Object.hasOwn(input.background, 'transmissionBackdrop')) {
    exactObject(
      input.background.transmissionBackdrop,
      ['mode', 'topColor', 'bottomColor'],
      ['mode', 'topColor', 'bottomColor'],
      'rig.background.transmissionBackdrop',
    );
    if (input.background.transmissionBackdrop.mode !== 'VERTICAL_GRADIENT') {
      fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Transmission backdrop mode is unsupported', {
        mode: input.background.transmissionBackdrop.mode,
      });
    }
    background.transmissionBackdrop = {
      mode: 'VERTICAL_GRADIENT',
      topColor: hexColor(input.background.transmissionBackdrop.topColor, 'rig.background.transmissionBackdrop.topColor'),
      bottomColor: hexColor(input.background.transmissionBackdrop.bottomColor, 'rig.background.transmissionBackdrop.bottomColor'),
    };
  }

  exactObject(input.lighting, ['identity', 'ambient', 'key'], ['identity', 'ambient', 'key'], 'rig.lighting');
  exactObject(input.lighting.ambient, ['color', 'intensity'], ['color', 'intensity'], 'rig.lighting.ambient');
  exactObject(input.lighting.key, ['color', 'intensity', 'position'], ['color', 'intensity', 'position'], 'rig.lighting.key');
  const lighting = {
    identity: stringValue(input.lighting.identity, 'rig.lighting.identity'),
    ambient: {
      color: hexColor(input.lighting.ambient.color, 'rig.lighting.ambient.color'),
      intensity: numberValue(input.lighting.ambient.intensity, 'rig.lighting.ambient.intensity', 0, 100),
    },
    key: {
      color: hexColor(input.lighting.key.color, 'rig.lighting.key.color'),
      intensity: numberValue(input.lighting.key.intensity, 'rig.lighting.key.intensity', 0, 100),
      position: vector3(input.lighting.key.position, 'rig.lighting.key.position'),
    },
  };

  exactObject(input.environment, ['identity', 'mode', 'intensity'], ['identity', 'mode', 'intensity'], 'rig.environment');
  if (!['NONE', 'ROOM'].includes(input.environment.mode)) fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Environment mode is unsupported', { mode: input.environment.mode });
  const environment = {
    identity: stringValue(input.environment.identity, 'rig.environment.identity'),
    mode: input.environment.mode,
    intensity: numberValue(input.environment.intensity, 'rig.environment.intensity', 0, 10),
  };

  exactObject(input.render, ['width', 'height', 'exposure', 'toneMapping', 'pixelRatio'], ['width', 'height', 'exposure', 'toneMapping', 'pixelRatio'], 'rig.render');
  if (!['ACES_FILMIC', 'NONE'].includes(input.render.toneMapping)) fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Tone mapping is unsupported');
  if (input.render.pixelRatio !== 1) fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Only pixelRatio 1 is supported for deterministic capture');
  const render = {
    width: integerValue(input.render.width, 'rig.render.width', 64, 4096),
    height: integerValue(input.render.height, 'rig.render.height', 64, 4096),
    exposure: numberValue(input.render.exposure, 'rig.render.exposure', 0, 100),
    toneMapping: input.render.toneMapping,
    pixelRatio: 1,
  };
  let refraction = null;
  if (Object.hasOwn(input, 'refraction')) {
    exactObject(input.refraction, ['mode', 'fallback', 'maxInterfaces', 'opticalSurfaceLevel'], ['mode', 'fallback'], 'rig.refraction');
    if (!['LEGACY', 'DEPTH_AWARE_V1', 'DEPTH_AWARE_V1_REFINED', 'SEQUENTIAL_V1', 'SEQUENTIAL_OPTICAL_SURFACE_V1', 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1'].includes(input.refraction.mode)) fail('ENGINE_RENDER_CAPABILITY_LIMIT', 'Refraction mode is unsupported', { mode: input.refraction.mode });
    if (input.refraction.mode !== 'LEGACY' && input.refraction.fallback !== 'FAIL_CLOSED') fail('INVALID_RENDER_RIG', `${input.refraction.mode} requires FAIL_CLOSED fallback`);
    if (input.refraction.mode === 'LEGACY' && input.refraction.fallback !== 'NOT_APPLICABLE') fail('INVALID_RENDER_RIG', 'LEGACY fallback must be NOT_APPLICABLE');
    const sequentialMode = ['SEQUENTIAL_V1', 'SEQUENTIAL_OPTICAL_SURFACE_V1', 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1'].includes(input.refraction.mode);
    if (sequentialMode) {
      if (!Object.hasOwn(input.refraction, 'maxInterfaces')) fail('INVALID_RENDER_RIG', `${input.refraction.mode} requires maxInterfaces`);
      if (input.refraction.maxInterfaces !== 4) fail('ENGINE_RENDER_CAPABILITY_LIMIT', `${input.refraction.mode} requires exactly four bounded interfaces`, { maxInterfaces: input.refraction.maxInterfaces });
    } else if (Object.hasOwn(input.refraction, 'maxInterfaces')) fail('INVALID_RENDER_RIG', 'maxInterfaces is only valid for bounded sequential modes');
    const separateOpticalMode = ['SEQUENTIAL_OPTICAL_SURFACE_V1', 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1'].includes(input.refraction.mode);
    if (separateOpticalMode) {
      const minimumLevel = input.refraction.mode === 'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1' ? 1 : 0;
      if (Object.hasOwn(input.refraction, 'opticalSurfaceLevel') && (!Number.isInteger(input.refraction.opticalSurfaceLevel) || input.refraction.opticalSurfaceLevel < minimumLevel || input.refraction.opticalSurfaceLevel > 2)) fail('ENGINE_RENDER_CAPABILITY_LIMIT', `opticalSurfaceLevel must be an integer from ${minimumLevel} through 2 for ${input.refraction.mode}`);
    } else if (Object.hasOwn(input.refraction, 'opticalSurfaceLevel')) fail('INVALID_RENDER_RIG', 'opticalSurfaceLevel is only valid for separate sequential optical-surface modes');
    refraction = { mode: input.refraction.mode, fallback: input.refraction.fallback, ...(sequentialMode ? { maxInterfaces: 4 } : {}), ...(separateOpticalMode ? { opticalSurfaceLevel: input.refraction.opticalSurfaceLevel ?? 1 } : {}) };
  }
  const seed = integerValue(input.seed, 'rig.seed', 0, 0x7fffffff);
  return { schemaVersion: '1.0.0', camera, object, background, lighting, environment, render, ...(refraction ? { refraction } : {}), seed };
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!ALLOWED_FLAGS.has(flag)) fail('INVALID_RENDER_REQUEST', 'Unknown argument', { flag });
    if (Object.hasOwn(parsed, flag)) fail('INVALID_RENDER_REQUEST', 'Duplicate argument', { flag });
    if (value === undefined || String(value).startsWith('--')) fail('INVALID_RENDER_REQUEST', 'Missing argument value', { flag });
    parsed[flag] = value;
  }
  for (const flag of ALLOWED_FLAGS) if (!Object.hasOwn(parsed, flag)) fail('INVALID_RENDER_REQUEST', 'Required argument missing', { flag });
  return {
    glb: path.resolve(parsed['--glb']),
    rig: path.resolve(parsed['--rig']),
    out: path.resolve(parsed['--out']),
    browser: path.resolve(parsed['--browser']),
  };
}

async function regularFile(filename, label, extension) {
  const stat = await fs.lstat(filename).catch(() => null);
  if (!stat?.isFile() || stat.isSymbolicLink()) fail('INVALID_RENDER_REQUEST', `${label} must be an existing regular non-link file`);
  if (extension && path.extname(filename).toLowerCase() !== extension) fail('INVALID_RENDER_REQUEST', `${label} must use ${extension}`);
}

export function inspectGlb(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2) {
    fail('INVALID_CANDIDATE_GLB', 'Expected binary glTF 2.0');
  }
  let offset = 12;
  let json;
  while (offset + 8 <= bytes.length) {
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    if (offset + 8 + length > bytes.length) fail('INVALID_CANDIDATE_GLB', 'GLB chunk exceeds file length');
    if (type === 0x4e4f534a) json = JSON.parse(bytes.subarray(offset + 8, offset + 8 + length).toString('utf8').trimEnd());
    offset += 8 + length;
  }
  if (!json) fail('INVALID_CANDIDATE_GLB', 'GLB JSON chunk is missing');
  const unsupportedRequired = (json.extensionsRequired ?? []).filter((name) => !ALLOWED_REQUIRED_EXTENSIONS.has(name));
  if (unsupportedRequired.length) fail('UNSUPPORTED_CANDIDATE_MATERIAL', 'Candidate requires unsupported glTF extensions', { unsupportedRequired });
  if (!Array.isArray(json.meshes) || json.meshes.length === 0) fail('INVALID_CANDIDATE_GLB', 'Candidate contains no mesh');
  if (!Array.isArray(json.materials) || json.materials.length === 0) fail('UNSUPPORTED_CANDIDATE_MATERIAL', 'Candidate contains no material');
  return {
    asset: json.asset,
    meshCount: json.meshes.length,
    materialCount: json.materials.length,
    extensionsUsed: json.extensionsUsed ?? [],
    extensionsRequired: json.extensionsRequired ?? [],
    materials: json.materials.map((material) => ({
      name: material.name ?? null,
      alphaMode: material.alphaMode ?? 'OPAQUE',
      doubleSided: Boolean(material.doubleSided),
      extensions: Object.keys(material.extensions ?? {}).sort(),
    })),
    materialFingerprint: sha256(canonicalStringify(json.materials)),
    materialPath: 'GLB_NATIVE_MATERIAL',
  };
}

function createStaticServer({ candidateBytes, rigBytes }) {
  const staticFiles = new Map([
    ['/generic-render.html', path.join(ENGINE_ROOT, 'generic-render.html')],
    ['/generic-render.mjs', path.join(ENGINE_ROOT, 'generic-render.mjs')],
    ['/depth-aware-refraction-v1.mjs', path.join(ENGINE_ROOT, 'depth-aware-refraction-v1.mjs')],
    ['/bounded-sequential-refraction-v1.mjs', path.join(ENGINE_ROOT, 'bounded-sequential-refraction-v1.mjs')],
    ['/loop-limit-optical-surface-v1.mjs', path.join(ENGINE_ROOT, 'loop-limit-optical-surface-v1.mjs')],
  ]);
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
      let bytes;
      let type;
      if (pathname === '/candidate.glb') { bytes = candidateBytes; type = 'model/gltf-binary'; }
      else if (pathname === '/rig.json') { bytes = rigBytes; type = 'application/json'; }
      else if (staticFiles.has(pathname)) {
        bytes = await fs.readFile(staticFiles.get(pathname));
        type = pathname.endsWith('.html') ? 'text/html; charset=utf-8' : 'text/javascript; charset=utf-8';
      } else if (pathname.startsWith('/node_modules/three/')) {
        const root = path.join(ENGINE_ROOT, 'node_modules', 'three');
        const filename = path.resolve(ENGINE_ROOT, `.${pathname}`);
        const relative = path.relative(root, filename);
        if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('Denied static path');
        bytes = await fs.readFile(filename);
        type = 'text/javascript; charset=utf-8';
      } else {
        response.writeHead(404).end('Not found');
        return;
      }
      response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      response.end(bytes);
    } catch (error) {
      response.writeHead(500).end(error.message);
    }
  });
  return server;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function closeServer(server) {
  return new Promise((resolve) => server.close(() => resolve()));
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForFile(filename, processHandle, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await fs.lstat(filename).then(() => true, () => false)) return;
    // Chromium-family launchers on Windows may hand the browser process off and
    // exit successfully before the profile's DevToolsActivePort file appears.
    // A non-zero launcher exit is fatal; exit 0 remains subject to the explicit
    // DevTools readiness timeout below.
    if (processHandle.exitCode !== null && processHandle.exitCode !== 0) fail('BROWSER_START_FAILED', 'Browser launcher failed before DevTools became ready', { exitCode: processHandle.exitCode });
    await delay(25);
  }
  fail('BROWSER_START_FAILED', 'Timed out waiting for DevTools readiness');
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.socket = null;
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      const socket = new WebSocket(this.url);
      this.socket = socket;
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
      socket.addEventListener('message', (event) => {
        const message = JSON.parse(event.data);
        if (!message.id || !this.pending.has(message.id)) return;
        const { resolve: done, reject: failPending, timer } = this.pending.get(message.id);
        this.pending.delete(message.id);
        clearTimeout(timer);
        if (message.error) failPending(new Error(message.error.message));
        else done(message.result);
      });
      socket.addEventListener('close', () => {
        for (const entry of this.pending.values()) {
          clearTimeout(entry.timer);
          entry.reject(new Error('CDP connection closed'));
        }
        this.pending.clear();
      });
    });
  }

  send(method, params = {}, timeoutMs = 30000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command timed out: ${method}`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
  }
}

async function waitForRenderReady(cdp, timeoutMs = 45000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const evaluation = await cdp.send('Runtime.evaluate', {
      expression: 'window.__GENERIC_RENDER_STATE__ ?? null',
      returnByValue: true,
      awaitPromise: true,
    });
    const state = evaluation.result?.value;
    if (state?.status === 'RENDER_READY') return state;
    if (state?.status === 'RENDER_ERROR') fail('ENGINE_RENDER_FAILED', state.error || 'Browser renderer failed', { state });
    await delay(25);
  }
  fail('DETERMINISTIC_CAPTURE_PATH_UNAVAILABLE', 'Timed out waiting for explicit RENDER_READY state');
}

async function waitForExit(child, timeoutMs = 5000) {
  if (child.exitCode !== null) return;
  await Promise.race([
    new Promise((resolve) => child.once('exit', resolve)),
    delay(timeoutMs),
  ]);
  if (child.exitCode === null) child.kill();
}

async function captureWithBrowser({ browserExecutable, url, width, height }) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'gemstone-generic-render-browser-'));
  const stderr = [];
  const browser = spawn(browserExecutable, [
    '--headless=new',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-breakpad',
    '--disable-component-update',
    '--disable-domain-reliability',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
    '--use-angle=swiftshader',
    '--use-gl=angle',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    `--window-size=${width},${height}`,
    'about:blank',
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  browser.stderr.on('data', (chunk) => {
    if (stderr.join('').length < 20000) stderr.push(chunk.toString());
  });
  const activePortFile = path.join(profile, 'DevToolsActivePort');
  let cdp;
  try {
    await waitForFile(activePortFile, browser, 15000);
    const [port] = (await fs.readFile(activePortFile, 'utf8')).trim().split(/\r?\n/);
    const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
    const target = targets.find((item) => item.type === 'page');
    if (!target?.webSocketDebuggerUrl) fail('BROWSER_START_FAILED', 'No page DevTools target was available');
    cdp = new CdpConnection(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
    await cdp.send('Page.navigate', { url });
    const renderState = await waitForRenderReady(cdp);
    const capture = await cdp.send('Page.captureScreenshot', {
      format: 'png',
      fromSurface: true,
      captureBeyondViewport: false,
    });
    await cdp.send('Browser.close').catch(() => {});
    return { png: Buffer.from(capture.data, 'base64'), renderState, browserDiagnostics: stderr.join('').slice(0, 4000) };
  } finally {
    cdp?.close();
    if (browser.exitCode === null) browser.kill();
    await waitForExit(browser);
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }).catch(() => {});
  }
}

export function inspectPng(bytes) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (!Buffer.isBuffer(bytes) || bytes.length < 24 || !bytes.subarray(0, 8).equals(signature)) fail('ENGINE_RENDER_OUTPUT_EXPORT_UNAVAILABLE', 'Capture is not a valid PNG');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length };
}

async function renderGenericCandidate(args) {
  await regularFile(args.glb, 'candidate GLB', '.glb');
  await regularFile(args.rig, 'Render Rig', '.json');
  await regularFile(args.browser, 'browser executable', '.exe');
  if (path.extname(args.out).toLowerCase() !== '.png') fail('INVALID_RENDER_REQUEST', 'Output must use .png extension');
  const outputParent = path.dirname(args.out);
  const outputParentStat = await fs.lstat(outputParent).catch(() => null);
  if (!outputParentStat?.isDirectory() || outputParentStat.isSymbolicLink()) fail('INVALID_RENDER_REQUEST', 'Output parent must be an existing non-link directory');
  const manifestPath = args.out.replace(/\.png$/i, '.render.json');
  for (const target of [args.out, manifestPath]) {
    if (await fs.lstat(target).then(() => true, () => false)) fail('OUTPUT_ALREADY_EXISTS', 'Render output is new-output-only', { target });
  }

  const candidateBytes = await fs.readFile(args.glb);
  const glbInspection = inspectGlb(candidateBytes);
  const rigSourceBytes = await fs.readFile(args.rig);
  let rigSource;
  try { rigSource = JSON.parse(rigSourceBytes.toString('utf8')); } catch { fail('INVALID_RENDER_RIG', 'Render Rig is not valid JSON'); }
  const rig = validateRenderRig(rigSource);
  const rigBytes = Buffer.from(canonicalStringify(rig), 'utf8');
  const candidateSha256 = sha256(candidateBytes);
  const rigSha256 = sha256(rigBytes);
  const server = createStaticServer({ candidateBytes, rigBytes });
  const startedAt = Date.now();
  let outputCreated = false;
  let manifestCreated = false;
  try {
    const port = await listen(server);
    const capture = await captureWithBrowser({
      browserExecutable: args.browser,
      url: `http://127.0.0.1:${port}/generic-render.html`,
      width: rig.render.width,
      height: rig.render.height,
    });
    const png = inspectPng(capture.png);
    if (png.width !== rig.render.width || png.height !== rig.render.height) {
      fail('ENGINE_RENDER_OUTPUT_EXPORT_UNAVAILABLE', 'PNG dimensions do not match Render Rig', { png, expected: rig.render });
    }
    if (!capture.renderState.materialPreserved || capture.renderState.runtimeMaterialOverrideCount !== 0 || capture.renderState.shaderFallbackActive) {
      fail('GENERIC_RENDERER_HIDDEN_MATERIAL_OVERRIDE_UNRESOLVED', 'Runtime did not preserve the Candidate material', { renderState: capture.renderState });
    }
    if (capture.renderState.refraction?.visualGeometrySha256 === 'CANDIDATE_GLB_SHA_FROM_MANIFEST') capture.renderState.refraction.visualGeometrySha256 = candidateSha256;
    await fs.writeFile(args.out, capture.png, { flag: 'wx' });
    outputCreated = true;
    const pngSha256 = sha256(capture.png);
    const engineFiles = {};
    for (const filename of ['render-generic-candidate-v1.mjs', 'generic-render.html', 'generic-render.mjs', 'depth-aware-refraction-v1.mjs', 'bounded-sequential-refraction-v1.mjs', 'loop-limit-optical-surface-v1.mjs']) {
      engineFiles[filename] = sha256(await fs.readFile(path.join(ENGINE_ROOT, filename)));
    }
    const manifest = {
      schemaVersion: '1.0.0',
      operation: 'render_candidate',
      status: 'RENDER_COMPLETE',
      candidate: {
        path: args.glb,
        sha256: candidateSha256,
        gltf: glbInspection,
      },
      renderRig: {
        path: args.rig,
        sourceSha256: sha256(rigSourceBytes),
        canonicalSha256: rigSha256,
        value: rig,
      },
      output: {
        imagePath: args.out,
        imageSha256: pngSha256,
        manifestPath,
        width: png.width,
        height: png.height,
        bytes: png.bytes,
      },
      renderer: {
        entrypoint: ENTRYPOINT,
        engineFiles,
        runtime: capture.renderState.rendererIdentity,
        browserExecutable: args.browser,
        readinessStages: capture.renderState.stages,
        programmaticCapture: 'CHROME_DEVTOOLS_PROTOCOL_PAGE_CAPTURE_SCREENSHOT',
        shaderFallback: 'FAIL_CLOSED',
        refraction: capture.renderState.refraction,
      },
      material: {
        path: 'GLB_NATIVE_MATERIAL',
        sourceFingerprint: glbInspection.materialFingerprint,
        runtimeMaterials: capture.renderState.materials,
        preserved: true,
        runtimeOverrideCount: 0,
      },
      camera: rig.camera,
      object: rig.object,
      background: rig.background,
      lighting: rig.lighting,
      environment: rig.environment,
      toneMapping: rig.render.toneMapping,
      exposure: rig.render.exposure,
      resolution: { width: rig.render.width, height: rig.render.height, pixelRatio: rig.render.pixelRatio },
      seed: rig.seed,
      warnings: capture.renderState.warnings,
      capabilityLimitations: [
        'Perspective camera only',
        'Environment modes limited to NONE and deterministic Three.js RoomEnvironment',
        'GLB-native standards-compliant materials only; undeclared Engine-specific runtime augmentation is unsupported',
        'Optional transmission backdrop is a deterministic opaque scene surface, not a path-traced environment or caustic receiver',
        'DEPTH_AWARE_V1 and DEPTH_AWARE_V1_REFINED are opt-in local front/back-depth approximations; they remain screen-space and are not multi-interface ray tracing',
        'SEQUENTIAL_V1 is an experimental opt-in local mesh/BVH solve bounded to four transparent interfaces; final external-scene color remains a raster transmission-buffer lookup',
        'SEQUENTIAL_OPTICAL_SURFACE_V1 is an experimental opt-in projected optical micro-mesh/BVH solve; it does not modify the visual Candidate mesh or imply production readiness',
        'SEQUENTIAL_LOOP_LIMIT_SURFACE_V1 is an experimental opt-in topology-aware Loop limit-surface envelope/BVH prototype; the finite intersection proxy is approximate-continuous and does not imply mathematical C1 intersection or production readiness',
      ],
      deterministicConfiguration: true,
      renderDurationMs: Date.now() - startedAt,
    };
    await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
    manifestCreated = true;
    return manifest;
  } catch (error) {
    if (manifestCreated) await fs.unlink(manifestPath).catch(() => {});
    if (outputCreated) await fs.unlink(args.out).catch(() => {});
    throw error;
  } finally {
    if (server.listening) await closeServer(server);
  }
}

async function main() {
  return renderGenericCandidate(parseArgs(process.argv.slice(2)));
}

const invokedAsCli = process.argv[1] && path.resolve(process.argv[1]) === ENTRYPOINT;
if (invokedAsCli) {
  main().then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)).catch((error) => {
    const normalized = error instanceof GenericRenderError
      ? error
      : new GenericRenderError('ENGINE_RENDER_FAILED', error.message || String(error));
    process.stderr.write(`${JSON.stringify({ status: 'FAIL_CLOSED', code: normalized.code, message: normalized.message, details: normalized.details }, null, 2)}\n`);
    process.exitCode = 1;
  });
}
