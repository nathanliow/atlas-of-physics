// open a page whose left text overflows, scroll the left page to the bottom, screenshot it
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import puppeteer from 'puppeteer-core';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [ch, pg, out] = process.argv.slice(2);
const server = http.createServer((q, s) => { let p = path.join(ROOT, decodeURIComponent(new URL(q.url, 'http://x').pathname)); if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p += '/index.html'; if (!p.startsWith(ROOT + path.sep) || !fs.existsSync(p)) { s.writeHead(404); return s.end(); } s.writeHead(200, { 'content-type': p.endsWith('.js') || p.endsWith('.mjs') ? 'text/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : 'text/html' }); fs.createReadStream(p).pipe(s); }).listen(0, '127.0.0.1');
const b = await puppeteer.launch({ executablePath: process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--use-angle=metal', '--enable-gpu'] });
const p = await b.newPage(); await p.setViewport({ width: 1440, height: 900 });
await p.goto(`http://127.0.0.1:${server.address().port}/${ch}/`, { waitUntil: 'networkidle0' });
await p.waitForFunction('window.__atlas'); await p.evaluate(n => scrollTo(0, n * innerHeight), +pg); await new Promise(r => setTimeout(r, 1500));
const info = await p.evaluate(() => { const l = document.getElementById('left'); const r = { overflow: l.scrollHeight - l.clientHeight }; l.scrollTop = l.scrollHeight; return r; });
await new Promise(r => setTimeout(r, 300)); await p.screenshot({ path: out }); console.log(info);
await b.close(); server.close();
