// hover a moving ball near (not on) it, then click: does it open?
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import puppeteer from 'puppeteer-core';
const ROOT = new URL('..', import.meta.url).pathname;
const server = http.createServer((q, s) => { let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!p.startsWith(ROOT) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': p.endsWith('.js') || p.endsWith('.mjs') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : 'text/html' }); fs.createReadStream(p).pipe(s); }).listen(0, '127.0.0.1');
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu'] });
const pg = await b.newPage(); await pg.setViewport({ width: 1440, height: 900 });
const errs = []; pg.on('pageerror', e => errs.push(e.message));
await pg.goto(`http://127.0.0.1:${server.address().port}/kinematics/`, { waitUntil: 'networkidle0' });
await pg.waitForFunction('window.__atlas'); await new Promise(r => setTimeout(r, 1000));
// where is the ball on screen right now? aim 15 px to its side
const pos = await pg.evaluate(() => { const E = window.__atlas.E, c = E.renderer.domElement.getBoundingClientRect(); const ball = E.ASM.ball; const v = ball.getWorldPosition(new E.THREE.Vector3()).project(E.camera); return { x: c.left + (v.x * .5 + .5) * c.width + 15, y: c.top + (-v.y * .5 + .5) * c.height }; });
await pg.mouse.move(pos.x, pos.y); await new Promise(r => setTimeout(r, 60));
await new Promise(r => setTimeout(r, 1000));
const hint = await pg.$eval('#hint', e => e.textContent);
const pausedOn = await pg.$eval('.paused', e => e.classList.contains('on')); console.log('paused badge on:', pausedOn);
await pg.screenshot({ path: 'shots/pausedShot.png' });
const still = await pg.evaluate((p) => { const E = window.__atlas.E, c = E.renderer.domElement.getBoundingClientRect(); const v = E.ASM.ball.getWorldPosition(new E.THREE.Vector3()).project(E.camera); return Math.hypot(c.left + (v.x * .5 + .5) * c.width - p.x, c.top + (-v.y * .5 + .5) * c.height - p.y); }, pos);
console.log('ball distance from cursor after 1 s (px):', still.toFixed(1));
await pg.mouse.down(); await pg.mouse.up(); await new Promise(r => setTimeout(r, 400));
const opened = await pg.evaluate(() => !document.getElementById('plate').hidden && document.querySelector('#plate h1')?.textContent);
console.log({ hint, opened, errs });
await b.close(); server.close();
