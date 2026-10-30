
// ===========================================================================
// v5 motion engine — every move follows the Disney principles:
// anticipation → spring with overshoot (follow-through), squash & stretch from speed,
// arcs instead of straight lines, staggered (overlapping) entrances, slow in / slow out.
// ===========================================================================
const TAU = Math.PI * 2;
// damped spring step response after s seconds. z = damping ratio (lower = more overshoot), f = natural frequency (Hz)
function sprS(s, z = 0.5, f = 1.8) {
  if (s <= 0) return 0;
  const w = TAU * f;
  if (z >= 1) return 1 - Math.exp(-w * s) * (1 + w * s);
  const wd = w * Math.sqrt(1 - z * z);
  return 1 - Math.exp(-z * w * s) * (Math.cos(wd * s) + (z * w / wd) * Math.sin(wd * s));
}
// anticipation then spring: pulls back by `ant` over `ta` s before `a`, launches on `a`, overshoots and settles
function go(t, a, o = {}) {
  const { ta = 0.14, ant = 0.06, z = 0.55, f = 1.7 } = o;
  if (t < a - ta) return 0;
  if (t < a) return -ant * Math.sin(Math.PI / 2 * (t - a + ta) / ta);
  return -ant + (1 + ant) * sprS(t - a, z, f);
}
const eIn = (k, p = 3) => Math.pow(clamp(k), p);
const eOut = (k, p = 3) => 1 - Math.pow(1 - clamp(k), p);
const eIO = (k, p = 3) => { k = clamp(k); return k < .5 ? Math.pow(2 * k, p) / 2 : 1 - Math.pow(2 - 2 * k, p) / 2; };
const ioq = (k) => eIO(k, 5);
// numeric speed of any f(t)
const dv = (f, t, h = 1 / 120) => (f(t + h) - f(t - h)) / (2 * h);
// quadratic arc from A to B bowed by `bend` × distance (sideways)
function arc(p, ax, ay, bx, by, bend = 0.25) {
  const mx = (ax + bx) / 2, my = (ay + by) / 2, dx = bx - ax, dy = by - ay;
  const cx = mx - dy * bend, cy = my + dx * bend;
  const u = 1 - p;
  return [u * u * ax + 2 * u * p * cx + p * p * bx, u * u * ay + 2 * u * p * cy + p * p * by];
}
// pop-in scale: y leads x so the shape stretches as it grows and squashes as it settles
function popS(t, a, o = {}) {
  const { z = 0.42, f = 2.1, lag = 0.045 } = o;
  return [sprS(t - a - lag, z, f), sprS(t - a, z, f)];
}
// exit: a small anticipation swell, then accelerate away
function outS(t, a, d = 0.3) { const k = prog(t, a, a + d); return k < 0.3 ? 1 + 0.06 * Math.sin(Math.PI / 2 * k / 0.3) : 1.06 * (1 - eIn((k - 0.3) / 0.7, 2.4)); }
// gentle idle float (a "moving hold")
const bob = (t, ph = 0, amp = 6, hz = 0.35) => Math.sin(t * TAU * hz + ph) * amp;

// transform an element on top of its own base transform (left/top stay put; scale/rotate about its centre)
function fx(e, p = {}) {
  if (e._b === undefined) { e._b = e.style.transform || ''; e.style.transformOrigin = p.origin || '50% 50%'; e._o0 = e.style.opacity || ''; }
  const s = p.s ?? 1, sx = (p.sx ?? 1) * s, sy = (p.sy ?? 1) * s;
  let tr = `translate(${(p.x || 0).toFixed(2)}px,${(p.y || 0).toFixed(2)}px)`;
  if (p.st) { const a = p.st[1]; tr += ` rotate(${a}rad) scale(${1 + p.st[0]},${1 / (1 + p.st[0])}) rotate(${-a}rad)`; }
  if (p.r) tr += ` rotate(${p.r.toFixed(3)}deg)`;
  if (sx !== 1 || sy !== 1) tr += ` scale(${sx.toFixed(4)},${sy.toFixed(4)})`;
  e.style.transform = tr + ' ' + e._b;
  const o = p.o ?? 1;
  if (p.o != null) e.style.opacity = clamp(o) * (e._o0 === '' ? 1 : parseFloat(e._o0));
  if (p.blur != null) e.style.filter = p.blur > 0.05 ? `blur(${p.blur.toFixed(2)}px)` : (e._f0 || '');
  e.style.display = o <= 0.002 || Math.abs(sx) < 0.002 || Math.abs(sy) < 0.002 ? 'none' : '';
}
const hide = (e) => { e.style.display = 'none'; };
// common entrances ---------------------------------------------------------
// pop: grows from nothing with a squashy overshoot, tiny spin settles
function pop(e, t, a, o = {}) {
  if (t < a) return fx(e, { o: 0 });
  const [sx, sy] = popS(t, a, o), s = o.s ?? 1;
  fx(e, { sx: sx * s, sy: sy * s, r: (o.r ?? 8) * (1 - sprS(t - a, 0.5, 1.6)), o: clamp((t - a) / 0.08), x: o.x || 0, y: (o.y || 0) + (o.dy ?? 0) * (1 - sprS(t - a, 0.6, 1.8)) });
}
// rise: slides up from `dy` below with anticipation-free spring; stretches while fast
function rise(e, t, a, o = {}) {
  const { dy = 80, dx = 0, z = 0.58, f = 1.7, blur = 0 } = o;
  if (t < a) return fx(e, { o: 0 });
  const p = sprS(t - a, z, f), v = Math.abs(dv(q => sprS(q - a, z, f), t)) * Math.hypot(dx, dy);
  fx(e, { x: (o.x || 0) + dx * (1 - p), y: (o.y || 0) + dy * (1 - p), st: [Math.min(0.18, v / 9000), Math.atan2(dy, dx)], o: clamp((t - a) / 0.12), r: (o.r ?? 0) * (1 - p), blur: blur ? blur * (1 - clamp((t - a) / 0.25)) : null, s: o.s });
}
// drop: falls in from above (ease-in like gravity), squashes on landing, rebounds
function drop(e, t, a, o = {}) {
  const { h = 140, d = 0.22 } = o;
  if (t < a) return fx(e, { o: 0, origin: '50% 100%' });
  const k = (t - a) / d;
  if (k < 1) { const y = -h * (1 - k * k); fx(e, { y, sy: 1 + 0.25 * k, sx: 1 - 0.12 * k, o: clamp(k * 3), origin: '50% 100%' }); return; }
  const s = t - a - d, sq = Math.exp(-s * 9) * Math.cos(s * 26);
  fx(e, { sy: 1 - 0.22 * sq, sx: 1 + 0.16 * sq, y: 0, o: 1, origin: '50% 100%' });
}
// type-on text
const typeOn = (e, txt, t, a, cps = 18) => { const n = Math.floor(clamp((t - a) * cps, 0, txt.length)); const s = txt.slice(0, n); if (e._ty !== s) { e._ty = s; e.textContent = s; } };
// split an element's text into inline-block characters (keeps inner spans)
function splitChars(e) {
  const out = [];
  const walk = (n) => {
    for (const c of [...n.childNodes]) {
      if (c.nodeType === 3) { const f = document.createDocumentFragment(); for (const ch of c.textContent) { if (ch === ' ') { f.appendChild(document.createTextNode(' ')); continue; } const s = document.createElement('span'); s.textContent = ch; s.style.display = 'inline-block'; f.appendChild(s); out.push(s); } c.replaceWith(f); }
      else if (c.nodeType === 1 && c.tagName !== 'BR') { if (getComputedStyle(c).backgroundColor !== 'rgba(0, 0, 0, 0)') { c.style.display = 'inline-block'; out.push(c); } else walk(c); }
    }
  };
  walk(e); return out;
}
// stagger helper: run f(item, start) for each item, `gap` seconds apart
const stag = (items, t, a, gap, f) => items.forEach((it, i) => f(it, t, a + i * gap, i));
// screen camera on a layer: world point (cx,cy) at the frame centre, scale s, roll r (deg)
function camT(e, cx, cy, s = 1, r = 0) { e.style.transformOrigin = '0 0'; e.style.transform = `translate(960px,540px) rotate(${r}deg) scale(${s}) translate(${-cx}px,${-cy}px)`; }

// ---------------------------------------------------------------------------
// scenes: S(name, a, b, build, {pre, post, tin, tout}) — build(root, s) returns draw(t)
// ---------------------------------------------------------------------------
const SC = [];
function S(name, a, b, build, o = {}) { const s = { name, a, b, build, pre: o.pre ?? 0, post: o.post ?? 0, tin: o.tin || null, tout: o.tout || null }; if (s.tin && s.tin.pre !== false && ['push', 'iris', 'expand', 'fade'].includes(s.tin.type)) s.pre = Math.max(s.pre, s.tin.d ?? 0.5); SC.push(s); return s; }
const FLASH = [];
let flashEl;
async function buildAll() {
  for (const s of SC) {
    s.outer = el('div', 'abs', stage); s.outer.style.cssText += 'width:1920px;height:1080px;overflow:hidden;transform-origin:50% 50%;';
    s.root = el('div', 'abs', s.outer); s.root.style.cssText += 'width:1920px;height:1080px;';
    s.draw = (await s.build(s.root, s)) || (() => {});
    s.bg = s.root.style.background || s.bg || 'transparent'; s.outer.style.background = s.bg; s.root.style.background = 'transparent';
    s.outer.style.display = 'none';
  }
  for (const f of stage.querySelectorAll('iframe')) { try { const st = f.contentDocument.createElement('style'); st.textContent = '*,*::before,*::after{transition:none!important;animation-duration:0s!important;animation-delay:0s!important}'; f.contentDocument.head.appendChild(st); } catch (e) {} }
  flashEl = el('div', 'abs', stage); flashEl.style.cssText += 'width:1920px;height:1080px;background:#fff;pointer-events:none;display:none;z-index:99;';
}
// transitions on the scene's outer layer
function applyT(s, t) {
  let x = 0, y = 0, sc = 1, blur = 0, clip = 'none', op = 1;
  const ti = s.tin, to = s.tout;
  if (ti) {
    const d = ti.d ?? 0.5;
    if (ti.type === 'zoom' && t < s.a + 0.8) { const k = t - s.a; sc *= lerp(ti.from ?? 0.82, 1, sprS(k, 0.62, 2.0)); blur += 10 * (1 - eOut(k / 0.28)); op = clamp(k / 0.06); cue('wz-' + s.name, s.a, 'whoosh', 0.8); }
    if (ti.type === 'fade' && t < s.a) op = eIO(prog(t, s.a - d, s.a), 2);
    if (ti.type === 'push' && t < s.a) { const e = ioq(prog(t, s.a - d, s.a)); const dir = ti.dir || [1, 0]; x += 1920 * dir[0] * (1 - e); y += 1080 * dir[1] * (1 - e); cue('wp-' + s.name, s.a - d * 0.5, 'swish', 0.9); }
    if (ti.type === 'iris' && t < s.a) { const e = eIO(prog(t, s.a - d, s.a), 4); clip = `circle(${(e * 2300).toFixed(1)}px at ${ti.at[0]}px ${ti.at[1]}px)`; cue('wi-' + s.name, s.a - d * 0.7, 'whoosh', 0.7); }
    if (ti.type === 'expand' && t < s.a) { const e = ioq(prog(t, s.a - d, s.a)); const [rx, ry, rw, rh, rr] = ti.rect; const L = rx * (1 - e), T0 = ry * (1 - e), R = (1920 - rx - rw) * (1 - e), B = (1080 - ry - rh) * (1 - e); clip = `inset(${T0.toFixed(1)}px ${R.toFixed(1)}px ${B.toFixed(1)}px ${L.toFixed(1)}px round ${(rr * (1 - e)).toFixed(1)}px)`; if (ti.from) s.outer.style.background = mix(ti.from, s.bg, eIO(prog(t, s.a - d * 0.6, s.a), 2)); cue('we-' + s.name, s.a - d * 0.6, 'swish', 0.8); }
  }
  if (to) {
    const d = to.d ?? 0.3;
    if (to.type === 'zoom' && t > s.b - d) { const k = prog(t, s.b - d, s.b); sc *= 1 + (to.amt ?? 0.4) * eIn(k, 3); blur += 14 * eIn(k, 2); }
    if (to.type === 'push' && t > s.b - d) { const e = ioq(prog(t, s.b - d, s.b)); const dir = to.dir || [1, 0]; x -= 1920 * 0.35 * dir[0] * e; y -= 1080 * 0.35 * dir[1] * e; op = 1 - 0.5 * e; }
  }
  s.outer.style.transform = `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${sc.toFixed(4)})`;
  s.outer.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  s.outer.style.clipPath = clip; s.outer.style.opacity = op;
}
function flash(at, d = 0.35, peak = 0.9) { if (!FLASH.some(f => f[0] === at)) FLASH.push([at, d, peak]); }
async function renderFrame(t) {
  for (const s of SC) {
    const on = t >= s.a - s.pre && t < s.b + s.post;
    s.outer.style.display = on ? 'block' : 'none';
    if (on) { s.draw(t); applyT(s, t); }
  }
  let f = 0; for (const [a, d, p] of FLASH) if (t >= a - 0.06 && t < a + d) f = Math.max(f, t < a ? p * (t - a + 0.06) / 0.06 : p * (1 - eOut((t - a) / d, 2)));
  flashEl.style.display = f > 0.002 ? 'block' : 'none'; flashEl.style.opacity = f;
  const imgs = [...pending]; pending.clear();
  await Promise.all(imgs.map(i => i.decode().catch(() => {})));
}

// ---------------------------------------------------------------------------
// shared drawing helpers
// ---------------------------------------------------------------------------
const RB = ['#FF3B3B', '#FF9A1F', '#FFE23B', '#3BD16F', '#2FA8FF', '#7A5CFF'];
// nyan-style rainbow drawn back from the head x1; the wave flips `hz` times a second
function rbDraw(ctx, x0, x1, yc, h, { step = 24, amp = 5, t = 0, hz = 7, alpha = 1 } = {}) {
  const sh = h / 6, ph = Math.floor(t * hz); ctx.globalAlpha = alpha;
  for (let x = x1, i = 0; x > x0; x -= step, i++) { const w = Math.min(step, x - x0); const dy = ((i + ph) % 2) ? -amp : amp; for (let j = 0; j < 6; j++) { ctx.fillStyle = RB[j]; ctx.fillRect(x - w, yc - h / 2 + j * sh + dy, w + 0.6, sh + 0.6); } }
  ctx.globalAlpha = 1;
}
const canvasIn = (root, gl = false) => { const cv = el('canvas', 'abs', root); cv.width = 1920; cv.height = 1080; cv.style.cssText += 'left:0;top:0;width:1920px;height:1080px;'; return [cv, gl ? null : cv.getContext('2d')]; };
// move with automatic squash & stretch (from speed) and lean (from horizontal speed)
function moveFx(e, t, P, o = {}) {
  const p = P(t), q0 = P(t - 1 / 120), q1 = P(t + 1 / 120);
  const vx = (q1.x - q0.x) * 60, vy = (q1.y - q0.y) * 60, v = Math.hypot(vx, vy);
  fx(e, { x: p.x, y: p.y, s: p.s ?? 1, sx: p.sx, sy: p.sy, r: (p.r || 0) + (o.lean ?? 0) * clamp(vx / 3000, -1, 1), st: v > 30 ? [Math.min(o.maxSt ?? 0.22, v / (o.stK ?? 7000)), Math.atan2(vy, vx)] : null, o: p.o ?? 1, blur: o.mblur ? Math.min(6, v / 900) : null, origin: o.origin });
}
