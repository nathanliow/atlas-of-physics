// node tools/shoot.mjs <out-dir> [w] [h] — screenshots of every page, a hover and an open part.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const out = path.resolve(process.argv[2] || 'shots'); fs.mkdirSync(out, { recursive: true });
const W = +(process.argv[3] || 1440), H = +(process.argv[4] || 900);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  let p = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!p.startsWith(ROOT + path.sep) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': types[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
}).listen(0, '127.0.0.1');
const browser = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !m.location().url?.includes('/_vercel/insights/')) errors.push(m.text()); });
await page.setViewport({ width: W, height: H, deviceScaleFactor: 2 });
await page.goto(`http://127.0.0.1:${server.address().port}/${process.env.CHAPTER || "kinematics"}/`, { waitUntil: 'networkidle0' });
await page.waitForFunction('window.__atlas', { timeout: 30000 }).catch(() => { console.log('page never started:\n' + errors.join('\n')); process.exit(1); });
const wait = ms => new Promise(r => setTimeout(r, ms));
await wait(800);
if (process.env.DEBUG) await page.evaluate(d => { window.__atlas.S.edges.uniforms.uDebug.value = d; }, +process.env.DEBUG);
if (process.env.DRAG) {
  // orbit by dragging, pan with shift-drag, then a still click must still open a breakdown
  const box = await (await page.$('#gl')).boundingBox(), cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.screenshot({ path: path.join(out, 'drag-0.png') });
  await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 20; i++) await page.mouse.move(cx - i * 14, cy + i * 4);
  await page.mouse.up(); await wait(500);
  await page.screenshot({ path: path.join(out, 'drag-1.png') });
  await page.keyboard.down('Shift'); await page.mouse.move(cx, cy); await page.mouse.down();
  for (let i = 1; i <= 10; i++) await page.mouse.move(cx + i * 12, cy);
  await page.mouse.up(); await page.keyboard.up('Shift'); await wait(500);
  await page.screenshot({ path: path.join(out, 'drag-2.png') });
  const opened = await page.evaluate(() => !document.getElementById('plate').hidden);
  console.log('plate opened by drag:', opened);
}
const N = await page.evaluate(() => document.querySelectorAll('#dots button').length);
const shots = (process.env.STEPS || [...Array(N).keys()].join(',')).split(',').map(Number);
for (const s of shots) {
  await page.evaluate(y => scrollTo(0, y * innerHeight), s);
  await wait(1200);
  await page.screenshot({ path: path.join(out, `p${String(s).replace('.', '_')}.png`) });
}
if (!process.env.STEPS) {
  // a mid-flip frame
  await page.evaluate(() => scrollTo(0, 2.75 * innerHeight)); await wait(900);
  await page.screenshot({ path: path.join(out, 'flip.png') });
}
// open parts: PARTS=key or key:page (each opened on its own page; PARTPAGE is the default page)
const partList = process.env.PARTS || (process.env.STEPS ? '' : (process.env.CHAPTER === 'newton' ? 'rest,tension,car,incline' : 'vArrow,boardV,projV,staff'));
for (const entry of partList.split(',').filter(Boolean)) {
  const [k, pg] = entry.split(':');
  await page.evaluate(p => scrollTo(0, p * innerHeight), pg !== undefined ? +pg : (+process.env.PARTPAGE || 0)); await wait(1200);
  await page.evaluate(k => window.__atlas.select(k), k); await wait(1600);
  await page.screenshot({ path: path.join(out, `part-${k}.png`) });
  await page.evaluate(() => window.__atlas.select(null)); await wait(900);
}
console.log(errors.length ? 'ERRORS:\n' + [...new Set(errors)].join('\n') : 'no console errors');
await browser.close(); server.close();
