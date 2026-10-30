// timeline: BEATS (seconds) and END come from beats.js, written by beats.py
const BEAT = BEATS.length > 1 ? (BEATS[BEATS.length - 1] - BEATS[0]) / (BEATS.length - 1) : 0.5;
const TB = (b) => { const n = BEATS.length; if (!n) return b * BEAT; if (b <= 0) return BEATS[0] + b * BEAT; if (b >= n - 1) return BEATS[n - 1] + (b - n + 1) * BEAT; const i = Math.floor(b); return BEATS[i] + (BEATS[i + 1] - BEATS[i]) * (b - i); };
const T = (bar) => TB(bar * 4);
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const mix = (c1, c2, k) => { const p = (c) => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const a = p(c1), b = p(c2); return '#' + a.map((v, i) => Math.round(lerp(v, b[i], clamp(k))).toString(16).padStart(2, '0')).join(''); };
const stage = document.getElementById('stage');
// images are decoded before each frame is captured, so nothing pops in half-loaded
const pending = new Set();
function el(tag, cls, parent, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; (parent || stage).appendChild(e); e.querySelectorAll('img').forEach(i => pending.add(i)); if (tag === 'img') pending.add(e); return e; }
// sound cues: the first call for a key wins; the mixer places each one at its time
const EVENTS = {};
function cue(key, t, type, gain = 1) { if (!(key in EVENTS)) EVENTS[key] = { t, type, gain }; }
// Bot avatars always come from the product's own pixel-avatar package (lib/pixel-avatar.js → global PX)
const avatarSvg = (name) => PX.pixelAvatarSvg(PX.seededRecipe(name));
function logoStk(parent, x, y, size, r = 0) { const d = el('div', 'stk', parent, '<img src="assets/tobs-logo.png" style="width:100%;height:100%;display:block">'); d.style.cssText += `left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${size * 0.24}px;transform:rotate(${r}deg);`; return d; }
function botStk(parent, name, x, y, size, r = 0) {
  const d = el('div', 'stk', parent, `<div style="position:absolute;inset:0">${avatarSvg(name)}</div>`);
  d.style.cssText += `left:${x}px;top:${y}px;width:${size}px;height:${size}px;border-radius:${size * 0.24}px;border-width:${Math.max(4, size * 0.05)}px;transform:rotate(${r}deg);`;
  const s = d.querySelector('svg'); s.setAttribute('width', '100%'); s.setAttribute('height', '100%'); s.style.display = 'block';
  return d;
}
