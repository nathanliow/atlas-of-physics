// Engine: paper shading + ink edges from a normal/depth pass, assemblies that can be
// hovered, lit and pulled apart, and a camera placed by target/azimuth/elevation/distance.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { TONE } from './parts.js';

export function createEngine(canvas, { fov = 18, near = 0.1, far = 400, bg = '#fbfbfa' } = {}) {
  // no WebGL (hardware acceleration off, a blocklisted GPU): the scene, camera and picking still work, nothing draws,
  // and the book says why (book.js)
  let renderer = null;
  try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, preserveDrawingBuffer: true }); renderer.setClearColor(bg); }
  catch (err) { console.warn('Atlas of Physics: WebGL is unavailable, so the figures cannot be drawn.', err); }
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(fov, 1, near, far);
  const ASM = {};

  function asm(key, parent, meta) {
    const g = new THREE.Group();
    g.userData = { asm: key, ...meta, explode: 0, target: 0, vel: 0 };
    ASM[key] = g; parent.add(g);
    return g;
  }

  // ---------- normal pass: view normal in rgb, line tone in alpha ----------
  const nmats = new Map();
  const normalMat = tone => {
    if (!nmats.has(tone)) nmats.set(tone, new THREE.ShaderMaterial({
      uniforms: { uTone: { value: tone } },
      vertexShader: `varying vec3 vN; void main(){
        vec3 n = normal;
        #ifdef USE_INSTANCING
          n = mat3(instanceMatrix) * n;
        #endif
        vN = normalize(normalMatrix * n);
        #include <begin_vertex>
        #include <project_vertex>
      }`,
      fragmentShader: `uniform float uTone; varying vec3 vN; void main(){ gl_FragColor = vec4(normalize(vN) * 0.5 + 0.5, uTone); }`,
    }));
    return nmats.get(tone);
  };
  const normalRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(1, 1) });
  const colorRT = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
  const composer = renderer && new EffectComposer(renderer, colorRT);
  composer?.addPass(new RenderPass(scene, camera));
  const edges = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null }, tNormal: { value: null }, tDepth: { value: null },
      uRes: { value: new THREE.Vector2() }, uPx: { value: 1 }, cameraNear: { value: near }, cameraFar: { value: far },
      uInk: { value: ['#d4d4d6', '#b4b4b8', '#8a8a8f', '#2c2c30', '#000000'].map(c => new THREE.Color(c)) },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      #include <packing>
      uniform sampler2D tDiffuse, tNormal, tDepth; uniform vec2 uRes; uniform float uPx, cameraNear, cameraFar; uniform vec3 uInk[5];
      varying vec2 vUv;
      float vz(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, cameraNear, cameraFar); }
      vec3 ink(float tone){ int i = int(clamp(floor(tone * 5. - 0.5), 0., 4.)); return uInk[i]; }
      void main(){
        vec4 base = texture2D(tDiffuse, vUv);
        vec4 n0 = texture2D(tNormal, vUv); float z0 = vz(vUv);
        float e = 0.; float tone = 0.;
        for (int k = 0; k < 2; k++) {
          vec2 o = (k == 0 ? vec2(uPx, 0.) : vec2(0., uPx)) / uRes;
          vec4 n1 = texture2D(tNormal, vUv + o); float z1 = vz(vUv + o);
          bool a0 = n0.a > 0.001, a1 = n1.a > 0.001;
          float ek = 0.;
          if (a0 != a1) ek = 1.;
          else if (a0) {
            float crease = smoothstep(0.12, 0.3, 1. - dot(n0.rgb * 2. - 1., n1.rgb * 2. - 1.));
            float gap = smoothstep(0.004, 0.012, abs(z0 - z1) / min(z0, z1));
            ek = max(crease, gap);
          }
          if (ek > e) { e = ek; tone = (a0 && (z0 <= z1 || !a1)) ? n0.a : n1.a; }
        }
        gl_FragColor = vec4(mix(base.rgb, ink(tone), e * 0.95), 1.);
      }`,
  });
  // ShaderPass clones its uniforms (textures too), so bind the live targets after creating it
  edges.uniforms.tNormal.value = normalRT.texture; edges.uniforms.tDepth.value = normalRT.depthTexture;
  composer?.addPass(edges);
  composer?.addPass(new OutputPass());

  let dprCap = 2, size = [1, 1];
  const setDprCap = c => { dprCap = c; resize(...size); };
  function resize(w, h) {
    size = [w, h];
    const dpr = Math.min(devicePixelRatio || 1, dprCap);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    if (!renderer) return;
    renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
    composer.setPixelRatio(dpr); composer.setSize(w, h);
    normalRT.setSize(w * dpr, h * dpr);
    edges.uniforms.uRes.value.set(w * dpr, h * dpr);
    edges.uniforms.uPx.value = Math.max(1, dpr * 0.75);
  }

  const swap = [];
  function render() {
    if (!renderer) return;
    // shared materials: push each mesh's lit amount just before it draws
    scene.traverse(o => {
      if (o.isMesh && o.material.uniforms && o.material.uniforms.uLit && !o.onBeforeRender.__lit) {
        o.onBeforeRender = (r, s, c, g, mat) => { if (mat.uniforms && mat.uniforms.uLit) { mat.uniforms.uLit.value = o.userData.lit || 0; mat.uniformsNeedUpdate = true; } };
        o.onBeforeRender.__lit = true;
      }
    });
    swap.length = 0;
    scene.traverse(o => {
      if (!o.visible) return;
      if (o.isLine || o.isLineSegments || o.isPoints || o.isSprite || o.userData.noEdge) { swap.push([o, null]); o.visible = false; return; }
      if (o.isMesh) { swap.push([o, o.material]); o.material = normalMat(o.userData.tone ?? TONE.mid); }
    });
    renderer.setRenderTarget(normalRT); renderer.setClearColor(0x000000, 0); renderer.clear();
    renderer.render(scene, camera);
    renderer.setRenderTarget(null); renderer.setClearColor(bg, 1);
    for (const [o, m] of swap) { if (m) o.material = m; else o.visible = true; }
    composer.render();
  }

  // ---------- one lit thing (optionally one named part of it) ----------
  const meshesOf = g => { const out = []; g.traverse(o => { if (o.isMesh && o.userData.part !== undefined) out.push(o); }); return out; };
  function setLit(key, partName) {
    for (const [k, g] of Object.entries(ASM)) for (const m of meshesOf(g)) {
      const on = k === key && (!partName || m.userData.part === partName);
      m.userData.tone = on ? TONE.lit : m.userData.baseTone;
      m.userData.lit = on ? 1 : 0;
    }
  }

  // ---------- picking ----------
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  // what is under the pointer: an exact hit first; otherwise the smallest thing whose on-screen
  // outline, padded by PAD px, contains the pointer, so small and moving things are easy to catch
  const PAD = 24, corner = new THREE.Vector3(), bb = new THREE.Box3();
  const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  function pick(x, y, w, h, exclude = []) {
    ndc.set((x / w) * 2 - 1, -(y / h) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const groups = Object.entries(ASM).filter(([k, g]) => !exclude.includes(k) && shown(g) && !g.userData.noPick);
    const targets = groups.flatMap(([, g]) => meshesOf(g).filter(shown));
    for (const hit of ray.intersectObjects(targets, false)) {
      let o = hit.object;
      while (o && !o.userData.asm) o = o.parent;
      if (o) return o.userData.asm;
    }
    let best = null, bestArea = Infinity;
    for (const [k, g] of groups) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const m of meshesOf(g)) {
        if (!shown(m)) continue;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        bb.copy(m.geometry.boundingBox).applyMatrix4(m.matrixWorld);
        for (let i = 0; i < 8; i++) {
          corner.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z).project(camera);
          if (corner.z > 1) continue;
          const sx = (corner.x * 0.5 + 0.5) * w, sy = (-corner.y * 0.5 + 0.5) * h;
          x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
        }
      }
      if (x0 > x1) continue;
      const area = (x1 - x0) * (y1 - y0);
      if (x >= x0 - PAD && x <= x1 + PAD && y >= y0 - PAD && y <= y1 + PAD && area < bestArea && area < w * h * 0.5) { best = k; bestArea = area; }
    }
    return best;
  }

  // ---------- explode springs ----------
  function stepExplode(dt) {
    for (const g of Object.values(ASM)) {
      const u = g.userData;
      u.vel += (-(u.explode - u.target) * 90 - u.vel * 2 * Math.sqrt(90)) * dt;
      u.explode += u.vel * dt;
      if (Math.abs(u.explode - u.target) < 1e-4 && Math.abs(u.vel) < 1e-4) { u.explode = u.target; u.vel = 0; }
      const e = Math.max(u.explode, 0);
      g.traverse(o => { if (o !== g && o.userData.home && o.userData.ex && o.userData.ex.lengthSq() > 0) o.position.copy(o.userData.home).addScaledVector(o.userData.ex, e); });
    }
  }

  function placeCamera({ target, az, el, dist }) {
    const a = THREE.MathUtils.degToRad(az), e = THREE.MathUtils.degToRad(el);
    camera.position.set(target[0] + dist * Math.sin(a) * Math.cos(e), target[1] + dist * Math.sin(e), target[2] + dist * Math.cos(a) * Math.cos(e));
    camera.lookAt(...target);
    camera.updateMatrixWorld();
  }
  // a camera distance that frames a sphere of radius r
  const distFor = r => r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) / Math.min(1, camera.aspect) * 1.15;

  const v = new THREE.Vector3();
  function toScreen(p, w, h) { v.copy(p).project(camera); return [(v.x * 0.5 + 0.5) * w, (-v.y * 0.5 + 0.5) * h, v.z < 1]; }

  return { THREE, renderer, scene, camera, ASM, asm, resize, setDprCap, render, setLit, pick, stepExplode, placeCamera, distFor, toScreen };
}
