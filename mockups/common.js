// Gemeinsamer Szenen-Loader für alle drei Mockups.
// Liest data/scene.json + data/landuse.png und baut Gelände, Gebäude, Straßen, Wasser, Bäume
// in einem vom Stil vorgegebenen Look. Achsen: x = Ost, y = oben, z = −Nord (Meter).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

// ---- Qualitätsstufe: ?q=low|mid|high, sonst automatisch.
// Zeichnet der Browser ohne Grafikkarte (Software-Rendering), wird der Sparmodus gewählt.
function detectSoftware() {
  try {
    const gl = document.createElement('canvas').getContext('webgl2') || document.createElement('canvas').getContext('webgl');
    if (!gl) return { soft: true, name: 'kein WebGL' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { soft: /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/i.test(name), name };
  } catch (e) { return { soft: false, name: '?' }; }
}
const LEVELS = {
  low:  { level: 'low',  label: 'Sparmodus', pixelRatio: 0.6, antialias: false, shadow: 0,    trees: 0.2, terrainStep: 2 },
  mid:  { level: 'mid',  label: 'Mittel',    pixelRatio: 1,   antialias: true,  shadow: 2048, trees: 0.5, terrainStep: 1 },
  high: { level: 'high', label: 'Hoch',      pixelRatio: 2,   antialias: true,  shadow: 4096, trees: 1,   terrainStep: 1 },
};
const _q = new URLSearchParams(location.search).get('q');
const _gpu = detectSoftware();
export const QUALITY = { ...LEVELS[LEVELS[_q] ? _q : (_gpu.soft ? 'low' : 'high')], auto: !LEVELS[_q], gpu: _gpu };

export function makeRenderer() {
  const r = new THREE.WebGLRenderer({ antialias: QUALITY.antialias, preserveDrawingBuffer: new URLSearchParams(location.search).has('shot'), powerPreference: 'high-performance' });
  r.setPixelRatio(Math.min(devicePixelRatio, QUALITY.pixelRatio)); r.setSize(innerWidth, innerHeight);
  r.shadowMap.enabled = QUALITY.shadow > 0;
  return r;
}

export const CAT = {
  unbekannt: 0, wasser: 1, wald: 2, gebuesch: 3, wiese: 4, acker: 5, obst_garten: 6, park_sport: 7,
  wohnen: 8, gewerbe: 9, industrie: 10, fels: 11, bahn: 12, oeffentlich: 13,
};

export async function loadScene(base) {
  base = base || `./data/${new URLSearchParams(location.search).get('region') in { pinnow: 1, koenigswinter: 1 } ? new URLSearchParams(location.search).get('region') : 'pinnow'}/`;
  const scene = await (await fetch(base + 'scene.json')).json();
  const img = new Image();
  img.src = base + scene.landuse.file;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = c.height = scene.landuse.n;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  const lu = new Uint8Array(c.width * c.height);
  for (let i = 0; i < lu.length; i++) lu[i] = px[i * 4];
  scene.lu = lu;
  const wimg = new Image(); wimg.src = base + scene.water.file; await wimg.decode();
  g.clearRect(0, 0, c.width, c.height); g.drawImage(wimg, 0, 0);
  const wp = g.getImageData(0, 0, c.width, c.height).data, wid = new Uint8Array(lu.length);
  for (let i = 0; i < wid.length; i++) wid[i] = wp[i * 4];
  scene.wid = wid;
  scene.h0 = scene.height.min - 2; // Bezugshöhe (knapp unter dem tiefsten Punkt, meist Wasser)
  scene.relief = scene.height.max - scene.height.min;
  return scene;
}

// Höhe (m über h0) an lokalen Koordinaten x (Ost), y (Nord), bilinear
export function heightAt(S, x, y) {
  const { res, n, data } = S.height, half = S.size_m / 2;
  let c = (x + half) / res + 0.5, r = (half - y) / res + 0.5;
  c = Math.min(Math.max(c, 0), n - 1.001); r = Math.min(Math.max(r, 0), n - 1.001);
  const i = r | 0, j = c | 0, fx = c - j, fy = r - i;
  const v = data[i * n + j] * (1 - fx) * (1 - fy) + data[i * n + j + 1] * fx * (1 - fy)
          + data[(i + 1) * n + j] * (1 - fx) * fy + data[(i + 1) * n + j + 1] * fx * fy;
  return v - S.h0;
}

// Wasserspiegel (m über h0) an x, y oder null, wenn dort kein Wasser ist
export function waterAt(S, x, y) {
  const n = S.landuse.n, half = S.size_m / 2, res = S.landuse.res;
  const c = Math.floor((x + half) / res), r = Math.floor((half - y) / res);
  if (c < 0 || r < 0 || c >= n || r >= n) return null;
  const k = S.wid[r * n + c];
  return k ? S.water.levels[k] - S.h0 : null;
}
export const qfloor = (h, q) => Math.floor(h / q) * q;
// Bodenhöhe im Terrassen-Stil (A)
export function quantH(S, x, y, q) {
  const w = waterAt(S, x, y);
  return w !== null ? qfloor(w, q) - 1.5 : qfloor(heightAt(S, x, y), q);
}
// Bodenhöhe im glatten Stil: Wasserflächen leicht unter dem Wasserspiegel
export function groundH(S, x, y) {
  const w = waterAt(S, x, y), h = heightAt(S, x, y);
  return w !== null ? Math.min(h, w - 1.2) : h;
}

// Wasserflächen als Kacheln auf ihrem jeweiligen Spiegel. q = Terrassenstufe (0 = glatt)
export function buildWater(S, q = 0, step = 10) {
  const n = Math.round(S.size_m / step), half = S.size_m / 2, P = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const x = -half + (c + 0.5) * step, y = half - (r + 0.5) * step;
    let w = waterAt(S, x, y); if (w === null) continue;
    w = q ? qfloor(w, q) + 0.4 : w;
    const x0 = x - step / 2, x1 = x + step / 2, z0 = -(y + step / 2), z1 = -(y - step / 2);
    P.push(x0, w, z0, x0, w, z1, x1, w, z1, x0, w, z0, x1, w, z1, x1, w, z0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.computeVertexNormals();
  return g;
}

export function catAt(S, x, y) {
  const n = S.landuse.n, half = S.size_m / 2, res = S.landuse.res;
  const c = Math.floor((x + half) / res), r = Math.floor((half - y) / res);
  if (c < 0 || r < 0 || c >= n || r >= n) return 0;
  return S.lu[r * n + c];
}

// Gelände als Gitter. opts: step (m), quant (Höhenstufen in m, 0 = glatt), color(cat, h, x, y) -> [r,g,b]
export function buildTerrain(S, opts) {
  const step = (opts.step || 10) * QUALITY.terrainStep, size = S.size_m, half = size / 2;
  const n = Math.round(size / step);
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = -pos.getZ(i);
    const k = catAt(S, x, y);
    const h = opts.quant ? quantH(S, x, y, opts.quant) : groundH(S, x, y);
    pos.setY(i, h);
    const cc = opts.color(k, h, x, y);
    col[i * 3] = cc[0]; col[i * 3 + 1] = cc[1]; col[i * 3 + 2] = cc[2];
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  if (opts.flat) { const g2 = geo.toNonIndexed(); g2.computeVertexNormals(); return g2; }
  geo.computeVertexNormals();
  return geo;
}

// Rand-„Sockel“ wie bei einem Geländemodell
export function buildSkirt(S, depth, step = 10) {
  const half = S.size_m / 2, n = Math.round(S.size_m / step), verts = [];
  const edge = (fx) => { for (let i = 0; i < n; i++) {
    const [ax, ay] = fx(i / n), [bx, by] = fx((i + 1) / n);
    const ha = groundH(S, ax, ay), hb = groundH(S, bx, by);
    verts.push(ax, ha, -ay, bx, -depth, -by, bx, hb, -by, ax, ha, -ay, ax, -depth, -ay, bx, -depth, -by);
  } };
  edge(t => [-half + t * S.size_m, -half]);
  edge(t => [half, -half + t * S.size_m]);
  edge(t => [half - t * S.size_m, half]);
  edge(t => [-half, half - t * S.size_m]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  g.computeVertexNormals();
  return g;
}

// Gebäude als eine zusammengeführte Geometrie.
// opts: heightScale, minH, gable (bool), wallColor(b)->[r,g,b], roofColor(b)->[r,g,b], baseOffset
export function buildBuildings(S, opts) {
  const P = [], C = [];
  const push = (x, y, z, c) => { P.push(x, y, -z); C.push(c[0], c[1], c[2]); };
  let ref = [0, 0, 0]; // Punkt im Gebäudeinneren; Dreiecke werden so gedreht, dass die Normale nach außen zeigt
  const tri = (a, b, c, col) => {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; // Normale in (x, h, y_nord)
    const mx = (a[0] + b[0] + c[0]) / 3 - ref[0], my = (a[1] + b[1] + c[1]) / 3 - ref[1], mz = (a[2] + b[2] + c[2]) / 3 - ref[2];
    // Achtung: Spiegelung y_nord -> z = −y dreht die Orientierung um
    if (nx * mx + ny * my + nz * mz > 0) { push(...a, col); push(...c, col); push(...b, col); }
    else { push(...a, col); push(...b, col); push(...c, col); }
  };
  const quad = (a, b, c, d, col) => { tri(a, b, c, col); tri(a, c, d, col); };
  for (const b of S.buildings) {
    const h = Math.max(opts.minH || 0, b.h * (opts.heightScale || 1));
    const base = b.b - S.h0 - 1.5; // etwas in den Boden versenkt
    const top = b.b - S.h0 + h;
    const wc = opts.wallColor(b), rc = opts.roofColor(b);
    { let sx = 0, sy = 0; const n = b.r.length / 2; for (let i = 0; i < n; i++) { sx += b.r[i * 2]; sy += b.r[i * 2 + 1]; }
      ref = b.g ? [b.g[0], (base + top) / 2, b.g[1]] : [sx / n, (base + top) / 2, sy / n]; }
    if (opts.gable && b.g) {
      const [mx, my, L, W, a] = b.g, ca = Math.cos(a), sa = Math.sin(a);
      const pt = (u, v) => [mx + u * ca - v * sa, my + u * sa + v * ca];
      const l = L / 2, w = W / 2, ridge = top + W * 0.45;
      const c4 = [pt(-l, -w), pt(l, -w), pt(l, w), pt(-l, w)];
      for (let i = 0; i < 4; i++) {
        const [x1, y1] = c4[i], [x2, y2] = c4[(i + 1) % 4];
        quad([x1, base, y1], [x2, base, y2], [x2, top, y2], [x1, top, y1], wc);
      }
      const r1 = pt(-l, 0), r2 = pt(l, 0);
      // Giebeldreiecke
      tri([c4[1][0], top, c4[1][1]], [c4[2][0], top, c4[2][1]], [r2[0], ridge, r2[1]], wc);
      tri([c4[3][0], top, c4[3][1]], [c4[0][0], top, c4[0][1]], [r1[0], ridge, r1[1]], wc);
      // Dachflächen (leichter Überstand)
      const o = 0.5, e = (p, q, f) => [p[0] + (p[0] - q[0]) * f, p[1] + (p[1] - q[1]) * f];
      const c0 = e(c4[0], c4[3], o / W), c1 = e(c4[1], c4[2], o / W), c2 = e(c4[2], c4[1], o / W), c3 = e(c4[3], c4[0], o / W);
      const dz = W * 0.45 * (o / w);
      quad([c0[0], top - dz, c0[1]], [c1[0], top - dz, c1[1]], [r2[0], ridge, r2[1]], [r1[0], ridge, r1[1]], rc);
      quad([c2[0], top - dz, c2[1]], [c3[0], top - dz, c3[1]], [r1[0], ridge, r1[1]], [r2[0], ridge, r2[1]], rc);
      continue;
    }
    const r = b.r, n = r.length / 2;
    for (let i = 0; i < n; i++) {
      const x1 = r[i * 2], y1 = r[i * 2 + 1], x2 = r[((i + 1) % n) * 2], y2 = r[((i + 1) % n) * 2 + 1];
      quad([x1, base, y1], [x2, base, y2], [x2, top, y2], [x1, top, y1], wc);
    }
    const pts = []; for (let i = 0; i < n; i++) pts.push(new THREE.Vector2(r[i * 2], r[i * 2 + 1]));
    const faces = THREE.ShapeUtils.triangulateShape(pts, []);
    for (const [a, bb, c] of faces) { ref = [pts[a].x, top - 5, pts[a].y]; tri([pts[a].x, top, pts[a].y], [pts[bb].x, top, pts[bb].y], [pts[c].x, top, pts[c].y], rc); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// Straßen als auf das Gelände gelegte Bänder. opts: width(road)->m|0, color(road)->[r,g,b], lift, quant
export function buildRoads(S, opts) {
  const P = [], C = [];
  for (const rd of S.roads) {
    const w = opts.width(rd); if (!w) continue;
    const col = opts.color(rd), p = rd.p, n = p.length / 2;
    for (let i = 0; i < n - 1; i++) {
      const x1 = p[i * 2], y1 = p[i * 2 + 1], x2 = p[i * 2 + 2], y2 = p[i * 2 + 3];
      const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L * w / 2, ny = dx / L * w / 2;
      const hz = (x, y) => (opts.quant ? quantH(S, x, y, opts.quant) : groundH(S, x, y)) + (opts.lift || 0.6);
      const h1 = hz(x1, y1), h2 = hz(x2, y2);
      const a = [x1 + nx, h1, -(y1 + ny)], b = [x1 - nx, h1, -(y1 - ny)], c = [x2 - nx, h2, -(y2 - ny)], d = [x2 + nx, h2, -(y2 + ny)];
      P.push(...a, ...b, ...c, ...a, ...c, ...d);
      for (let k = 0; k < 6; k++) C.push(...col);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
  g.computeVertexNormals();
  return g;
}

// Baum-Positionen: OSM-Einzelbäume + Streuung in Wald/Gebüsch/Obst-Zellen. density = Bäume pro 100 m²
export function treePositions(S, density, seed = 1) {
  let s = seed; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const out = [];
  for (let i = 0; i < S.trees.length; i += 2) out.push([S.trees[i], S.trees[i + 1], 1]);
  const n = S.landuse.n, res = S.landuse.res, half = S.size_m / 2;
  const per = { [CAT.wald]: 1, [CAT.gebuesch]: 0.35, [CAT.obst_garten]: 0.25, [CAT.park_sport]: 0.05, [CAT.wohnen]: 0.03 };
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const f = per[S.lu[r * n + c]]; if (!f) continue;
    const expect = f * density * QUALITY.trees * res * res / 100;
    let k = Math.floor(expect) + (rnd() < expect % 1 ? 1 : 0);
    while (k--) out.push([-half + (c + rnd()) * res, half - (r + rnd()) * res, 0.6 + rnd() * 0.8]);
  }
  return out;
}

export const params = new URLSearchParams(location.search);
export const REGIONS = { pinnow: 'Pinnow bei Schwerin', koenigswinter: 'Königswinter / Drachenfels' };
export const region = REGIONS[params.get('region')] ? params.get('region') : 'pinnow';

// Kamerapositionen: relativ zum Marker in Metern [Ost, Nord, Höhe]; Region kann sie in scene.views überschreiben
const DEFAULT_VIEWS = {
  overview: { target: [-300, 300, 0], cam: [850, -1150, 430] },
  nah: { target: [0, 0, 0], cam: [190, -260, 95] },
};
export function viewPose(S, name) {
  const [mx, my] = S.marker.xy;
  if (name === 'top') return { target: [0, 0, 0], cam: [0, -1, 6400] };
  const v = (S.views && S.views[name]) || DEFAULT_VIEWS[name] || DEFAULT_VIEWS.overview;
  const gt = heightAt(S, mx + v.target[0], my + v.target[1]);
  return { target: [mx + v.target[0], my + v.target[1], gt + v.target[2]], cam: [mx + v.cam[0], my + v.cam[1], gt + v.cam[2]] };
}
export function applyView(camera, controls, S, name) {
  const p = viewPose(S, name);
  controls.target.set(p.target[0], p.target[2], -p.target[1]);
  camera.position.set(p.cam[0], p.cam[2], -p.cam[1]);
  controls.update();
}
export function setupView(renderer, camera, S, preset) {
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  applyView(camera, controls, S, preset || params.get('view') || 'overview');
  return controls;
}

// Marker (Stecknadel + Beschriftung). groundFn(x, y) liefert die Bodenhöhe im jeweiligen Stil.
export function addMarker(scene, S, groundFn, color = '#d6332b') {
  const [x, y] = S.marker.xy, h = groundFn(x, y);
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, emissive: color, emissiveIntensity: 0.25 });
  const pin = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 0.3, 55, 10).translate(0, 27.5, 0), mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14).translate(0, 60, 0), mat);
  const ring = new THREE.Mesh(new THREE.RingGeometry(9, 13, 40).rotateX(-Math.PI / 2).translate(0, 0.8, 0),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
  pin.castShadow = head.castShadow = true;
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const c = cv.getContext('2d');
  c.fillStyle = 'rgba(255,255,255,.93)'; c.beginPath(); c.roundRect(4, 4, 504, 88, 18); c.fill();
  c.fillStyle = '#1d1d1b'; c.font = '600 40px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(S.marker.label, 256, 50);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: false }));
  label.scale.set(0.15, 0.028, 1); label.position.set(0, 80, 0); label.renderOrder = 10;
  g.add(pin, head, ring, label); g.position.set(x, h, -y);
  scene.add(g);
  return g;
}

// Laufmodus: WASD/Pfeiltasten bewegen, Maus ziehen schaut umher, Shift = rennen, Q/E = hoch/runter (Flug)
export class Walker {
  constructor(camera, dom, S, groundFn) {
    Object.assign(this, { camera, dom, S, groundFn, on: false, yaw: 0, pitch: -0.05, keys: {}, fly: 0 });
    this.last = performance.now();
    addEventListener('keydown', e => { if (this.on && !e.target.closest('input,select')) { this.keys[e.code] = true; if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault(); } });
    addEventListener('keyup', e => { this.keys[e.code] = false; });
    let drag = null;
    dom.addEventListener('pointerdown', e => { if (this.on) { drag = [e.clientX, e.clientY]; dom.setPointerCapture(e.pointerId); } });
    dom.addEventListener('pointermove', e => { if (!this.on || !drag) return;
      this.yaw -= (e.clientX - drag[0]) * 0.004; this.pitch = Math.max(-1.3, Math.min(1.3, this.pitch - (e.clientY - drag[1]) * 0.004)); drag = [e.clientX, e.clientY]; });
    dom.addEventListener('pointerup', () => { drag = null; });
  }
  start(x, y) {
    this.on = true; this.fly = 0;
    const [mx, my] = this.S.marker.xy;
    if (x === undefined) { // Start auf der nächsten Straße beim Marker, Blick zum Marker
      let best = Infinity; x = mx - 20; y = my - 20;
      for (const r of this.S.roads) {
        if (['footway', 'path', 'steps', 'standard_gauge', 'track'].includes(r.c)) continue;
        for (let i = 0; i < r.p.length; i += 2) {
          const d = Math.hypot(r.p[i] - mx, r.p[i + 1] - my);
          if (d > 30 && d < best) { best = d; x = r.p[i]; y = r.p[i + 1]; }
        }
      }
    }
    this.pos = new THREE.Vector3(x, 0, -y);
    this.yaw = Math.atan2(-(mx - x), (my - y)); this.pitch = 0.12;
    this.camera.near = 0.3; this.camera.updateProjectionMatrix();
    this.last = performance.now();
  }
  stop() { this.on = false; this.camera.near = 5; this.camera.updateProjectionMatrix(); }
  update() {
    const now = performance.now(), dt = Math.min(0.1, (now - this.last) / 1000); this.last = now;
    if (!this.on) return;
    const k = this.keys, sp = (k.ShiftLeft || k.ShiftRight ? 18 : 5) * dt;
    const f = (k.KeyW || k.ArrowUp ? 1 : 0) - (k.KeyS || k.ArrowDown ? 1 : 0);
    const r = (k.KeyD || k.ArrowRight ? 1 : 0) - (k.KeyA || k.ArrowLeft ? 1 : 0);
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    this.pos.x += (fx * f - fz * r) * sp; this.pos.z += (fz * f + fx * r) * sp;
    const half = this.S.size_m / 2 - 2;
    this.pos.x = Math.max(-half, Math.min(half, this.pos.x)); this.pos.z = Math.max(-half, Math.min(half, this.pos.z));
    this.fly = Math.max(0, this.fly + ((k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0)) * sp * 2);
    this.pos.y = this.groundFn(this.pos.x, -this.pos.z) + 1.7 + this.fly;
    this.camera.position.copy(this.pos);
    this.camera.rotation.set(this.pitch, this.yaw, 0, 'YXZ');
  }
}

export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const VARIANTS = [
  ['a-architekturmodell', 'A · Architekturmodell'], ['b-lowpoly', 'B · Low-Poly'], ['c-semirealistisch', 'C · Semi-realistisch']];

export function overlay(S, title, text, current) {
  const d = document.createElement('div');
  d.className = 'hud';
  const q = `?region=${region}`;
  const qq = q + (QUALITY.auto ? '' : '&q=' + QUALITY.level);
  const links = VARIANTS.map(([h, t]) => h === current ? `<b>${t}</b>` : `<a href="${h}.html${qq}">${t}</a>`).join(' · ');
  const regs = Object.entries(REGIONS).map(([k, v]) => `<option value="${k}"${k === region ? ' selected' : ''}>${v}</option>`).join('');
  d.innerHTML = `<div class="top"><a href="index.html${q}" class="home">← Start</a>
    <select id="region" aria-label="Region">${regs}</select></div>
    <h1>${title}</h1><p class="desc">${text}</p><nav>${links}</nav>
    <div class="btns"><button data-view="overview">Übersicht</button><button data-view="nah">Marker nah</button>
      <button data-view="top">Draufsicht</button><button data-view="walk" class="walk">Zu Fuß ab Marker</button></div>
    <div class="perf"><label>Grafik <select id="quality">${['auto', 'low', 'mid', 'high'].map(k => `<option value="${k}"${(QUALITY.auto ? 'auto' : QUALITY.level) === k ? ' selected' : ''}>${k === 'auto' ? `Automatisch (${QUALITY.label})` : { low: 'Sparmodus', mid: 'Mittel', high: 'Hoch' }[k]}</option>`).join('')}</select></label>
      <span id="fps">– fps</span></div>
    <p class="help" id="help">Maus links: drehen · rechts: verschieben · Rad: zoomen</p>
    <small>${S.region} · ${S.size_m / 1000} × ${S.size_m / 1000} km · Marker: ${S.marker.label}<br>${S.attribution}</small>`;
  document.body.appendChild(d);
  d.querySelector('#region').addEventListener('change', e => { location.search = `?region=${e.target.value}${QUALITY.auto ? '' : '&q=' + QUALITY.level}`; });
  d.querySelector('#quality').addEventListener('change', e => {
    const u = new URLSearchParams(location.search); e.target.value === 'auto' ? u.delete('q') : u.set('q', e.target.value); location.search = u.toString(); });
  return d;
}

// Render-Schleife mit Ansichts-Buttons und Laufmodus; mit ?shot wird nur ein Bild gerendert (Screenshots)
export function run(renderer, scene, camera, controls, groundFn, hud) {
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  const walker = new Walker(camera, renderer.domElement, S_of(scene), groundFn || ((x, y) => heightAt(S_of(scene), x, y)));
  const help = hud && hud.querySelector('#help');
  const setWalk = (on) => {
    if (on) { controls.enabled = false; walker.start(); document.body.classList.add('walking');
      if (help) help.textContent = 'W A S D / Pfeile: gehen · Shift: rennen · Q / E: runter / hoch · Maus ziehen: umsehen · Esc: zurück'; }
    else { walker.stop(); controls.enabled = true; document.body.classList.remove('walking');
      if (help) help.textContent = 'Maus links: drehen · rechts: verschieben · Rad: zoomen'; }
  };
  hud && hud.querySelectorAll('[data-view]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.view;
    if (v === 'walk') return setWalk(!walker.on);
    setWalk(false); applyView(camera, controls, S_of(scene), v);
  }));
  addEventListener('keydown', e => { if (e.code === 'Escape' && walker.on) setWalk(false); if (e.code === 'KeyF' && !e.target.closest('input,select')) setWalk(!walker.on); });
  if (params.get('view') === 'walk') setWalk(true);
  if (params.has('shot')) {
    document.body.classList.add('shot');
    walker.update(); renderer.render(scene, camera);
  } else {
    // Nur zeichnen, wenn sich etwas bewegt: spart im Stillstand die ganze Rechenleistung
    let dirty = true, frames = 0, t0 = performance.now();
    const fps = hud && hud.querySelector('#fps');
    controls.addEventListener('change', () => { dirty = true; });
    addEventListener('resize', () => { dirty = true; });
    hud && hud.addEventListener('click', () => { dirty = true; });
    renderer.setAnimationLoop(() => {
      if (walker.on) { walker.update(); dirty = true; } else controls.update();
      if (!dirty) { t0 = performance.now(); frames = 0; return; }
      renderer.render(scene, camera); dirty = false; frames++; window.__frames = (window.__frames || 0) + 1;
      const now = performance.now();
      if (fps && now - t0 > 1000) { fps.textContent = `${Math.round(frames * 1000 / (now - t0))} fps`; t0 = now; frames = 0; }
    });
  }
  window.__ready = true; window.__cam = camera; window.__dbg = { renderer, scene, camera };
}
const S_of = (scene) => scene.userData.S;
