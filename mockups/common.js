// Gemeinsamer Szenen-Loader für alle drei Mockups.
// Liest data/scene.json + data/landuse.png und baut Gelände, Gebäude, Straßen, Wasser, Bäume
// in einem vom Stil vorgegebenen Look. Achsen: x = Ost, y = oben, z = −Nord (Meter).
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';

export const CAT = {
  unbekannt: 0, wasser: 1, wald: 2, gebuesch: 3, wiese: 4, acker: 5, obst_garten: 6, park_sport: 7,
  wohnen: 8, gewerbe: 9, industrie: 10, fels: 11, bahn: 12, oeffentlich: 13,
};

export async function loadScene(base = './data/') {
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
  scene.h0 = scene.height.min - 2; // Bezugshöhe (knapp unter Rheinniveau)
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

export function quantH(S, x, y, q) {
  return catAt(S, x, y) === CAT.wasser ? 0 : Math.max(Math.floor(heightAt(S, x, y) / q) * q, 4);
}

export function catAt(S, x, y) {
  const n = S.landuse.n, half = S.size_m / 2, res = S.landuse.res;
  const c = Math.floor((x + half) / res), r = Math.floor((half - y) / res);
  if (c < 0 || r < 0 || c >= n || r >= n) return 0;
  return S.lu[r * n + c];
}

// Gelände als Gitter. opts: step (m), quant (Höhenstufen in m, 0 = glatt), color(cat, h, x, y) -> [r,g,b]
export function buildTerrain(S, opts) {
  const step = opts.step || 10, size = S.size_m, half = size / 2;
  const n = Math.round(size / step);
  const geo = new THREE.PlaneGeometry(size, size, n, n);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = -pos.getZ(i);
    let h = heightAt(S, x, y);
    // Wasserflächen leicht absenken, damit das Wasser sauber darüber liegt
    const k = catAt(S, x, y);
    if (k === CAT.wasser) h = Math.min(h, 0.5);
    if (opts.quant) h = k === CAT.wasser ? 0 : Math.max(Math.floor(h / opts.quant) * opts.quant, 4);
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
    const ha = heightAt(S, ax, ay), hb = heightAt(S, bx, by);
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
      const hz = (x, y) => (opts.quant ? quantH(S, x, y, opts.quant) : heightAt(S, x, y)) + (opts.lift || 0.6);
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
    const expect = f * density * res * res / 100;
    let k = Math.floor(expect) + (rnd() < expect % 1 ? 1 : 0);
    while (k--) out.push([-half + (c + rnd()) * res, half - (r + rnd()) * res, 0.6 + rnd() * 0.8]);
  }
  return out;
}

export function setupView(renderer, camera, S, preset = 'drachenfels') {
  const controls = new OrbitControls(camera, renderer.domElement);
  const [dx, dy] = S.poi.drachenfels;
  // Blick vom Siebengebirge über den Rhein nach Nordwesten
  controls.target.set(dx - 900, 60, -(dy + 700));
  camera.position.set(dx + 900, 650, -(dy - 900));
  if (preset === 'nah') { const [ax, ay] = S.poi.koenigswinter_altstadt;
    controls.target.set(ax + 50, 20, -(ay - 50)); camera.position.set(ax + 420, 190, -(ay - 380)); }
  if (preset === 'top') { controls.target.set(0, 0, 0); camera.position.set(0, 6400, 1); }
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.48;
  controls.update();
  return controls;
}

export const hex = (h) => { const c = new THREE.Color(h); return [c.r, c.g, c.b]; };
export const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function overlay(S, title, text, current) {
  const d = document.createElement('div');
  d.className = 'hud';
  const links = [['a-architekturmodell.html', 'A · Architekturmodell'], ['b-lowpoly.html', 'B · Low-Poly'], ['c-semirealistisch.html', 'C · Semi-realistisch']]
    .map(([h, t]) => h === current ? `<b>${t}</b>` : `<a href="${h}">${t}</a>`).join(' · ');
  d.innerHTML = `<h1>${title}</h1><p>${text}</p><nav>${links}</nav><small>${S.region} · Ausschnitt ${S.size_m / 1000} × ${S.size_m / 1000} km<br>${S.attribution}</small>`;
  document.body.appendChild(d);
}

// Render-Schleife; mit ?shot wird nur ein Bild gerendert (für Screenshots / Software-Rendering)
export function run(renderer, scene, camera, controls) {
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  if (new URLSearchParams(location.search).has('shot')) {
    document.body.classList.add('shot');
    renderer.render(scene, camera);
  } else renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
  window.__ready = true;
}
