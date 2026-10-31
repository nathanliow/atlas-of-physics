// The book: scroll turns the pages and moves the camera; hover lights a thing; click breaks
// it down. A chapter supplies its pages, breakdowns, world and clock; this does the rest.
import { createEngine } from './render.js';
import { XREFS } from './xrefs.js';

const $ = id => document.getElementById(id);
const clamp01 = x => Math.min(Math.max(x, 0), 1);
const smooth = (a, b, x) => { const u = clamp01((x - a) / (b - a)); return u * u * (3 - 2 * u); };
const ease = u => (u = clamp01(u), u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2);
const lerp = (a, b, u) => a + (b - a) * u;
const touch = matchMedia('(pointer: coarse)').matches;
const CLOSE_HINT = touch ? 'Tap empty space to close' : 'Click empty space or press Esc to close';
const DEFAULT_HINT = touch ? 'Drag sideways to turn · tap to break it down' : 'Drag to turn · shift-drag to pan · click to break it down';
// this chapter's directory, as cross-references and deep links name it: kinematics/#3
const DIR = location.pathname.split('/').filter(s => s && s !== 'index.html').pop();
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// chapter: { no, PAGES, PLATES, buildWorld(E), lookKeys, state(clock, reduced), readout(state),
//            forceLook?(selected, look), onFrame?(state, sheetEls), clock0? }
export function startBook(chapter) {
  const { PAGES, PLATES } = chapter;
  const N = PAGES.length;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const narrowQ = matchMedia('(max-width: 900px), (max-height: 520px)'), narrow = () => narrowQ.matches;
  // one page of scroll; held steady while a phone's toolbar slides in and out (only a width change resizes it)
  let pageH = innerHeight, lastW = innerWidth;
  // one block per page, so touch scrolling can snap to whole pages (book.css)
  $('space').innerHTML = '<div></div>'.repeat(N);
  const sizeSpace = () => { for (const d of $('space').children) d.style.height = `${pageH}px`; };
  addEventListener('resize', () => { if (innerWidth !== lastW || !touch) { lastW = innerWidth; pageH = innerHeight; sizeSpace(); } });

  // ---------- pages ----------
  sizeSpace();
  let PRACTICE = {};
  // practice questions live beside the chapter (practice.js: { pageIndex: [question, ...] }); a chapter may have none
  import(new URL('practice.js', location.href).href).then(m => { PRACTICE = m.PRACTICE || {}; shown = leafFor = -1; }, () => {});
  const practiceHtml = i => {
    const qs = PRACTICE[i] || [];
    if (!qs.length) return '';
    return `<section class="practice"><div class="kicker">Practice</div>${qs.map((q, n) => `<div class="q" data-q="${n}">
      <p class="qtext"><span class="qn">${n + 1}</span>${q.q}</p>
      ${q.choices ? `<ol class="choices">${q.choices.map((c, k) => `<li><button type="button" data-c="${k}"><span class="letter">${'ABCDE'[k]}</span><span>${c}</span></button></li>`).join('')}</ol>`
        : '<button type="button" class="reveal">Show the solution</button>'}
      <div class="why" hidden>${q.why || q.solution}</div></div>`).join('')}</section>`;
  };
  const xrefHtml = i => {
    const here = `${DIR}/${i}`, links = XREFS.flatMap(([a, al, b, bl, note]) => a === here ? [[b, bl, note]] : b === here ? [[a, al, note]] : []);
    if (!links.length) return '';
    return `<aside class="xref"><div class="kicker">Compare</div>${links.map(([to, label, note]) => {
      const [d, k] = to.split('/');
      return `<p><a href="${d === DIR ? '' : `../${d}/`}#${k}">${label} →</a> ${note}</p>`; }).join('')}</aside>`;
  };
  // small screens: the page ends with a way on to the next (book.css shows it there)
  const turnHtml = i => i < N - 1 ? `<button type="button" class="turn" data-turn="${i + 1}"><span class="kicker">Next page</span>${PAGES[i + 1].title} →</button>` : '';
  const sheetHtml = i => { const p = PAGES[i]; return `<div class="kicker">${p.kicker}</div><h1>${p.title}</h1><div class="sub">${p.sub}</div>${p.body}${xrefHtml(i)}${practiceHtml(i)}${turnHtml(i)}`; };
  // answering: click a choice to mark it and show the worked solution
  $('sheet').addEventListener('click', e => {
    const b = e.target.closest('button'), q = b && b.closest('.q');
    if (b?.dataset.turn) return goto(+b.dataset.turn);
    if (!q) return;
    const item = PRACTICE[shown][+q.dataset.q];
    if (b.dataset.c !== undefined) {
      if (q.classList.contains('done')) return;
      q.classList.add('done');
      q.querySelectorAll('[data-c]').forEach(c => { c.disabled = true; c.classList.toggle('right', +c.dataset.c === item.answer); });
      if (+b.dataset.c !== item.answer) b.classList.add('wrong');
    } else if (b.classList.contains('reveal')) b.hidden = true;
    q.querySelector('.why').hidden = false;
  });
  let shown = -1, leafFor = -1;
  // the leaf's back is the next left page: the same folio at its foot
  const leafFolio = $('folio').parentNode.cloneNode(true); leafFolio.lastElementChild.removeAttribute('id');
  document.querySelector('.leaf-back').append(leafFolio);
  function showPage(i) {
    if (i === shown) return;
    shown = i;
    $('sheet').innerHTML = sheetHtml(i);
    $('left').scrollTop = 0;
    $('pagenum').textContent = `${i + 1} / ${N}`;
    // the address names the page, so it can be bookmarked or linked: kinematics/#3
    history.replaceState(null, '', i ? `#${i}` : location.pathname);
    $('folio').textContent = i + 1;
    $('figno').textContent = `Fig. ${chapter.no}${i ? '.' + i : ''}`;
    $('figtitle').textContent = PAGES[i].fig;
    [...$('dots').children].forEach((b, k) => b.setAttribute('aria-current', k === i));
  }
  const goto = (i, now) => scrollTo({ top: Math.max(0, Math.min(N - 1, i)) * pageH, behavior: reduced || now ? 'auto' : 'smooth' });
  const fromHash = () => { const m = /^#(\d+)$/.exec(location.hash); return m && +m[1] < N ? +m[1] : null; };
  history.scrollRestoration = 'manual';
  addEventListener('hashchange', () => { const k = fromHash(); if (k !== null) goto(k); });
  // a compact pager for small screens, where a row of dots would not fit
  $('dots').insertAdjacentHTML('afterend', '<span class="pager"><button type="button" aria-label="Previous page">‹</button><span id="pagenum"></span><button type="button" aria-label="Next page">›</button></span><a class="eqlink" href="../equations/">Equations</a><a class="gh" href="https://github.com/nathanliow/atlas-of-physics" aria-label="Source on GitHub"><svg viewBox="0 0 16 16" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg></a>');
  const [prevB, nextB] = document.querySelectorAll('.pager button');
  prevB.onclick = () => goto(Math.round(scrollY / pageH) - 1); nextB.onclick = () => goto(Math.round(scrollY / pageH) + 1);
  PAGES.forEach((p, i) => {
    const b = document.createElement('button');
    b.setAttribute('aria-label', `Page ${i + 1}: ${p.title}`);
    b.onclick = () => goto(i);
    $('dots').appendChild(b);
  });

  // ---------- scene ----------
  const E = createEngine($('gl'), { fov: 18, near: 0.2, far: 300 });
  // no WebGL: the text, practice and live numbers still work; the figure says why it is empty and how to fix it
  if (!E.renderer) {
    const chrome = /Chrome\//.test(navigator.userAgent) && !/Edg\//.test(navigator.userAgent);
    const fig = $('gl').parentElement;
    fig.classList.add('nogl');
    fig.insertAdjacentHTML('beforeend', `<div class="nogl-note" role="alert">
      <div class="kicker">Figure unavailable</div>
      <h2>The 3D figures need WebGL, which your browser could not start.</h2>
      <p>This usually means <b>hardware acceleration</b> (graphics acceleration) is turned off.</p>
      <p>${chrome ? 'In Chrome, open <code>chrome://settings/system</code>, turn on <i>Use graphics acceleration when available</i> and relaunch.'
        : 'Turn on hardware or graphics acceleration in your browser’s settings and restart it.'}
        <span class="more">If it is already on, your graphics driver may be blocked: <code>chrome://gpu</code> (or <code>about:support</code> in Firefox) shows why.</span></p>
      <p class="muted more">The text and practice questions still work without it.</p></div>`);
  }
  const W = chapter.buildWorld(E);
  // the figure's box, read once per resize: reading it every frame forced a layout after each DOM write.
  // Its size is the layout size, so the book zooming open (cover.js) cannot shrink the canvas; cover.js refits after.
  let rect;
  const fit = () => { const c = $('gl'), b = c.getBoundingClientRect(); rect = { left: b.left, top: b.top, width: c.clientWidth, height: c.clientHeight }; E.resize(rect.width, rect.height); };
  addEventListener('resize', fit);
  new ResizeObserver(fit).observe($('gl')); fit();

  // ---------- labels anchored to the scene ----------
  const labels = (W.labels || []).map(L => {
    const el = document.createElement('div'); el.className = 'lbl ' + L.cls; el.innerHTML = L.html; $('labels').appendChild(el);
    return { el, at: L.at, text: L.text, last: L.html };   // text: optional () => html for live values
  });
  function placeLabels(w, h) {
    for (const L of labels) {
      const p = L.at();
      if (!p) { L.el.style.opacity = 0; continue; }
      const [x, y, front] = E.toScreen(p, w, h);
      L.el.style.opacity = front && x > 8 && x < w - 8 && y > 8 && y < h - 8 ? 1 : 0;
      L.el.style.left = `${x}px`; L.el.style.top = `${y}px`;
      if (L.text) { const h = L.text(); if (h !== L.last) { L.el.innerHTML = h; L.last = h; } }
    }
  }

  // ---------- hover / click ----------
  let hovered = null, selected = null, pageLit = PAGES[0].lit;
  const relight = () => E.setLit(hovered || selected || pageLit);
  // hover is re-checked every frame at the pointer's last spot, so moving things light up as they
  // pass under a still cursor and a click lands on whatever is lit at that moment
  // Hover is latched: once something lights up it stays lit (and time stays stopped) until the
  // pointer moves LATCH px from where it caught it, so a moving thing can't slip out from under it.
  let pointer = null, anchor = null;
  const LATCH = 40;
  function hoverAt(fromMove) {
    if (!pointer || (drag && drag.moved)) return;
    if (hovered && anchor && Math.hypot(pointer.x - anchor.x, pointer.y - anchor.y) < LATCH) return;
    if (!fromMove && hovered) return;            // per-frame checks only catch new things passing under
    const r = rect;
    const k = E.pick(pointer.x - r.left, pointer.y - r.top, r.width, r.height);
    if (k) anchor = { ...pointer };
    if (k !== hovered) {
      hovered = k; relight();
      if (k) timeRate = 0;                       // stop at once, so it stays where it was caught
      $('gl').classList.toggle('pointing', !!k);
      $('hint').textContent = k ? `${E.ASM[k].userData.title} — click to break it down` : selected ? CLOSE_HINT : DEFAULT_HINT;
    }
  }
  // drag turns the camera around the subject; shift- or right-drag pans; a still click selects
  const orbit = { az: 0, el: 0, pan: new E.THREE.Vector3() };
  let drag = null;
  $('gl').addEventListener('contextmenu', e => e.preventDefault());
  $('gl').addEventListener('pointerdown', e => {
    drag = { x: e.clientX, y: e.clientY, pan: e.shiftKey || e.button === 2, moved: false };
    $('gl').setPointerCapture(e.pointerId);
  });
  $('gl').addEventListener('pointerup', e => {
    if (drag && !drag.moved && e.button === 0) {
      // a finger has no hover: a tap picks whatever is under it
      const k = e.pointerType === 'mouse' ? hovered : E.pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
      select(k && k !== selected ? k : null);
    }
    drag = null; $('gl').classList.remove('dragging');
  });
  $('gl').addEventListener('dblclick', () => { orbit.az = 0; orbit.el = 0; orbit.pan.set(0, 0, 0); });
  $('gl').addEventListener('pointermove', e => {
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.hypot(dx, dy) < 4) return;
      drag.moved = true; drag.x = e.clientX; drag.y = e.clientY;
      $('gl').classList.add('dragging');
      if (drag.pan) {
        // world units per screen pixel at the target's depth, so the scene follows the cursor
        const cam = E.camera, k = 2 * Math.tan(E.THREE.MathUtils.degToRad(cam.fov / 2)) * cam.position.distanceTo(lookAt) / rect.height;
        const right = new E.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0), up = new E.THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
        orbit.pan.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else { orbit.az -= dx * 0.35; orbit.el += dy * 0.25; }
      return;
    }
    pointer = { x: e.clientX, y: e.clientY };
    hoverAt(true);
  });
  $('gl').addEventListener('pointerleave', () => { pointer = null; anchor = null; hovered = null; relight(); $('gl').classList.remove('pointing'); });
  addEventListener('keydown', e => {
    if (e.key === 'Escape') select(null);
    if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); goto(Math.round(scrollY / pageH) + 1); }
    if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); goto(Math.round(scrollY / pageH) - 1); }
  });

  let selectScroll = 0, focusAmt = 0, lastFocus = null;
  function focusOf(k) {
    const g0 = E.ASM[k];
    // an assembly may name its own breakdown view: userData.focus = () => ({ target: [x, y, z], radius })
    if (g0.userData.focus) { const f = g0.userData.focus(); return { target: f.target, dist: Math.max(E.distFor(f.radius), g0.userData.minDist ?? 2) }; }
    const g = g0, box = new E.THREE.Box3();
    g.updateMatrixWorld(true);
    const shown = o => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };   // hidden parents too
    g.traverse(o => { if (o.isMesh && o.userData.part !== undefined && shown(o)) box.expandByObject(o); });
    const s = box.getBoundingSphere(new E.THREE.Sphere());
    return { target: s.center.toArray(), dist: Math.max(E.distFor(Math.max(s.radius, g.userData.minRadius ?? 1.2)), g.userData.minDist ?? 8) };   // a scene may allow a closer zoom
  }
  function select(k) {
    selected = k;
    for (const [key, g] of Object.entries(E.ASM)) g.userData.target = key === k ? 1 : 0;
    selectScroll = scrollY; relight();
    const plate = $('plate');
    if (!k) { plate.hidden = true; $('hint').textContent = DEFAULT_HINT; return; }
    const u = E.ASM[k].userData;
    plate.innerHTML = `
      <button class="close" type="button">${touch ? 'Close' : 'Close · Esc'}</button>
      <div class="kicker">Breakdown</div>
      <h1>${u.title}</h1>
      <div class="sub">${u.sub}</div>
      <p>${PLATES[k].text}</p>
      <table class="data" id="facts"></table>`;
    plate.hidden = false;
    plate.querySelector('.close').onclick = () => select(null);
    $('hint').textContent = CLOSE_HINT;
  }

  // a small badge says when motion is stopped (pointing at something, or a breakdown open)
  const paused = document.createElement('div');
  paused.className = 'paused'; paused.setAttribute('aria-hidden', 'true');
  paused.innerHTML = '<span class="bars"></span>paused';
  $('gl').parentElement.appendChild(paused);

  // ---------- frame ----------
  // resolution follows the device: if frames run slow for two seconds running, draw fewer pixels
  // ponytail: only ever steps down (to 1 px per CSS px); stepping back up would need hysteresis
  let last0 = performance.now(), slow = 0, win = [], dprCap = touch ? 1.5 : 2;
  E.setDprCap(dprCap);
  function adapt(ms) {
    win.push(ms);
    if (win.length < 120) return;
    const hitch = Math.max(...win) > 250, avg = win.reduce((a, b) => a + b) / win.length;
    win = [];
    if (hitch) return;
    slow = avg > 1000 / 45 ? slow + 1 : 0;
    if (slow >= 2 && dprCap > 1) { dprCap = Math.max(1, dprCap - 0.25); E.setDprCap(dprCap); slow = 0; }
  }
  let timeRate = 1, last = performance.now(), clock = chapter.clock0 || 0, orbitPage = 0, orbitHome = false;
  const lookAt = new E.THREE.Vector3();
  function frame(now) {
    const dt = Math.min(Math.max((now - last) / 1000, 0), 1 / 20); last = now;   // a frame stamp can predate setup
    const s = Math.min(Math.max(scrollY / pageH, 0), N - 1);
    const i = Math.min(Math.floor(s), N - 1), f = s - i, j = Math.min(i + 1, N - 1);
    if (selected && Math.abs(scrollY - selectScroll) > pageH * 0.25) select(null);
    adapt(now - last0); last0 = now;

    // text: the leaf turns over the second half of each page's scroll
    const flip = narrow() || i === j ? 0 : smooth(0.5, 1, f);
    showPage(flip > 0.999 ? j : (narrow() ? Math.round(s) : i));
    if (PAGES[shown].lit !== pageLit) { pageLit = PAGES[shown].lit; relight(); }
    const leaf = $('leaf');
    if (flip > 0.001 && flip < 0.999) {
      if (leafFor !== j) { leafFor = j; $('leafsheet').innerHTML = sheetHtml(j); $('leafnext').textContent = PAGES[j].fig; leafFolio.lastElementChild.textContent = j + 1; }
      leaf.style.visibility = 'visible';
      leaf.style.transform = `rotateY(${-180 * flip}deg)`;
      leaf.querySelector('.leaf-front').style.opacity = 0.25 + 0.6 * smooth(0.15, 0.5, flip);
      leaf.style.setProperty('--shade', (0.10 * Math.sin(flip * Math.PI)).toFixed(3));
    } else leaf.style.visibility = 'hidden';
    $('cue').style.opacity = s < 0.05 ? 1 : 0;

    // camera: the scroll path, blended toward the opened thing
    const u = ease(smooth(0.3, 1, f));
    const A = PAGES[i].cam, B = PAGES[j].cam;
    let cam = { target: A.target.map((v, k) => lerp(v, B.target[k], u)), az: lerp(A.az, B.az, u), el: lerp(A.el, B.el, u), dist: lerp(A.dist, B.dist, u) };
    cam.dist *= Math.max(1, 1.25 / E.camera.aspect);
    if (!reduced && !drag) cam.az += Math.sin(now / 5200) * 1.2;
    const page = Math.round(s);
    if (page !== orbitPage) { orbitPage = page; orbitHome = true; }
    if (drag && drag.moved) orbitHome = false;
    if (orbitHome) { const k = Math.exp(-dt * 3); orbit.az *= k; orbit.el *= k; orbit.pan.multiplyScalar(k); }
    focusAmt += ((selected ? 1 : 0) - focusAmt) * (1 - Math.exp(-dt * 4));
    if (selected) lastFocus = focusOf(selected);
    if (focusAmt > 0.001 && lastFocus) {
      const F = lastFocus;
      cam = { target: cam.target.map((v, k) => lerp(v, F.target[k], focusAmt)), az: cam.az, el: lerp(cam.el, Math.max(cam.el, 6), focusAmt), dist: lerp(cam.dist, F.dist, focusAmt) };
    }
    cam.az += orbit.az;
    cam.el = Math.min(Math.max(cam.el + orbit.el, -4), 85);
    cam.target = cam.target.map((v, k) => v + orbit.pan.getComponent(k));
    lookAt.fromArray(cam.target);
    E.placeCamera(cam);

    // physics: time pauses while something is open, so it can be read
    // time eases to a stop while something is pointed at or open, so moving things can be caught and read
    timeRate = selected || hovered ? 0 : timeRate + (1 - timeRate) * (1 - Math.exp(-dt * 4));
    if (!reduced) clock += dt * timeRate;
    paused.classList.toggle('on', !reduced && !!(selected || hovered));
    const state = chapter.state(clock, reduced);
    const LA = PAGES[i].look, LB = PAGES[j].look, look = {};
    for (const key of chapter.lookKeys) look[key] = lerp(LA[key] || 0, LB[key] || 0, u);
    if (chapter.forceLook) chapter.forceLook(selected, look);
    W.update(state, look);
    E.stepExplode(dt);

    $('readout').textContent = chapter.readout(state, PAGES[shown]);
    if (chapter.onFrame) chapter.onFrame(state, [$('sheet'), $('leafsheet')]);
    if (selected && $('facts')) $('facts').innerHTML = PLATES[selected].facts(state).map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');

    hoverAt(false);
    E.render();
    placeLabels(rect.width, rect.height);
    requestAnimationFrame(frame);
  }
  relight();
  { const k = fromHash(); if (k !== null) goto(k, true); }
  // the first frame drawn: the book can open now (cover.js)
  document.fonts.ready.then(() => requestAnimationFrame(t => { frame(t); dispatchEvent(new Event('bookready')); }));
  window.__atlas = { E, select, goto };
}
