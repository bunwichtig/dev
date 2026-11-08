// Prozedurale Texturen (im Browser erzeugt, keine fremden Bilddateien, daher lizenzfrei).
// Alle Texturen sind hell bzw. neutral gehalten und werden über Vertex-Farben eingefärbt.
import * as THREE from 'three';

let seed = 4711;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function noise(g, w, h, amt, alpha = 1) {
  const id = g.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; d[i + 3] *= alpha; }
  g.putImageData(id, 0, 0);
}
function tex(c, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  return t;
}

// Fassade: eine Fensterachse (3,5 m) × ein Geschoss (3 m)
export function facadeTexture() {
  const W = 128, H = 110, [c, g] = canvas(W, H);
  g.fillStyle = '#f1ece2'; g.fillRect(0, 0, W, H); noise(g, W, H, 22);
  // Geschosskante
  g.fillStyle = 'rgba(0,0,0,.10)'; g.fillRect(0, 0, W, 3);
  // Fenster mit Rahmen, Sprosse, Fensterbank
  const fx = 38, fy = 26, fw = 52, fh = 56;
  g.fillStyle = '#d9d3c8'; g.fillRect(fx - 4, fy - 4, fw + 8, fh + 10);
  const grd = g.createLinearGradient(0, fy, 0, fy + fh); grd.addColorStop(0, '#5f7385'); grd.addColorStop(1, '#2c3a47');
  g.fillStyle = grd; g.fillRect(fx, fy, fw, fh);
  g.fillStyle = 'rgba(255,255,255,.18)'; g.beginPath(); g.moveTo(fx, fy); g.lineTo(fx + fw * 0.55, fy); g.lineTo(fx, fy + fh * 0.6); g.fill();
  g.fillStyle = '#f4f2ee'; g.fillRect(fx + fw / 2 - 2, fy, 4, fh); g.fillRect(fx, fy + fh * 0.38, fw, 3);
  g.fillStyle = '#b9b2a6'; g.fillRect(fx - 6, fy + fh + 2, fw + 12, 5);
  return tex(c);
}

// Dachziegel: 1 m × 1 m
export function roofTexture() {
  const S = 128, [c, g] = canvas(S);
  g.fillStyle = '#ddd'; g.fillRect(0, 0, S, S);
  const rows = 3, cols = 4, rh = S / rows, cw = S / cols;
  for (let r = 0; r < rows; r++) for (let k = -1; k < cols + 1; k++) {
    const x = k * cw + (r % 2 ? cw / 2 : 0), y = r * rh, v = 200 + rnd() * 55;
    const gr = g.createLinearGradient(0, y, 0, y + rh); gr.addColorStop(0, `rgb(${v},${v},${v})`); gr.addColorStop(1, `rgb(${v * 0.62},${v * 0.62},${v * 0.62})`);
    g.fillStyle = gr; g.beginPath(); g.roundRect(x + 1, y + 1, cw - 2, rh - 1, [0, 0, 10, 10]); g.fill();
  }
  noise(g, S, S, 18);
  return tex(c);
}

// Asphalt mit leichtem Korn
export function asphaltTexture() {
  const S = 128, [c, g] = canvas(S);
  g.fillStyle = '#cfcfcf'; g.fillRect(0, 0, S, S); noise(g, S, S, 60);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(0,0,0,${rnd() * 0.08})`; g.beginPath(); g.arc(rnd() * S, rnd() * S, 2 + rnd() * 8, 0, 7); g.fill(); }
  // Randstreifen an u = 0 und u = 1
  g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(4, 0, 3, S); g.fillRect(S - 7, 0, 3, S);
  return tex(c);
}

// Bodenrauschen als Relief (Detail auf dem Satellitenbild), Kachel ca. 4 m
export function groundBump() {
  const S = 256, [c, g] = canvas(S);
  g.fillStyle = '#808080'; g.fillRect(0, 0, S, S); noise(g, S, S, 120);
  g.filter = 'blur(1px)'; g.drawImage(c, 0, 0);
  return tex(c, { srgb: false });
}

// Laubkrone als Billboard (Alpha), Farbe neutral grün
export function foliageTexture() {
  const S = 256, [c, g] = canvas(S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#5a4630'; g.fillRect(S / 2 - 6, S * 0.6, 12, S * 0.4); // Stamm
  for (let i = 0; i < 260; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * S * 0.36, x = S / 2 + Math.cos(a) * r, y = S * 0.42 + Math.sin(a) * r * 0.9;
    const l = 0.55 + rnd() * 0.45;
    g.fillStyle = `rgb(${Math.round(70 * l)},${Math.round(110 * l)},${Math.round(45 * l)})`;
    g.beginPath(); g.arc(x, y, 6 + rnd() * 12, 0, 7); g.fill();
  }
  return tex(c, { repeat: false });
}
