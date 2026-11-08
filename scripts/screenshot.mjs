// Rendert Screenshots aller Stile × Regionen × Ansichten (headless Chromium, Software-WebGL).
// Aufruf: node scripts/screenshot.mjs [stile,komma,getrennt] [regionen]
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const root = path.resolve('mockups');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.css': 'text/css' };
const srv = http.createServer((q, r) => { const f = path.join(root, decodeURIComponent(q.url.split('?')[0]));
  fs.readFile(f, (e, d) => { if (e) { r.writeHead(404); r.end(); } else { r.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); r.end(d); } }); }).listen(8765);
const pages = (process.argv[2] || 'a-architekturmodell,b-lowpoly,c-semirealistisch').split(',');
const regions = (process.argv[3] || 'pinnow,koenigswinter').split(',');
const views = (process.argv[4] || 'overview,nah,top,walk').split(',');
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
for (const reg of regions) {
  fs.mkdirSync(`mockups/screenshots/${reg}`, { recursive: true });
  for (const p of pages) for (const view of views) {
    const pg = await browser.newPage({ viewport: { width: 1600, height: 900 } });
    pg.on('console', m => m.type() === 'error' && console.log(p, m.text())); pg.on('pageerror', e => console.log(p, e.message));
    await pg.goto(`http://localhost:8765/${p}.html?shot&region=${reg}&view=${view}`);
    await pg.waitForFunction(() => window.__ready, null, { timeout: 240000 });
    await pg.waitForTimeout(1500);
    const out = `mockups/screenshots/${reg}/${p}-${view}.jpg`;
    await pg.screenshot({ path: out, type: 'jpeg', quality: 82 }); console.log(out); await pg.close();
  }
}
await browser.close(); srv.close();
