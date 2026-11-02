// ---- pixel cosmos (2D): black sky, square pixel stars with plus-shaped sparkles, nyan-style rainbow trails
// Paint the frame black first (ctx.fillRect), then drawStars, then flyers far → near with nyan() before drawSpr().
const PXF = 1000;
function pxStars(n, seed = 7) {
  let r = seed; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const C = ['#fff', '#fff', '#fff', ...RB];
  return Array.from({ length: n }, () => ({ x: (rnd() - 0.5) * 60, y: (rnd() - 0.5) * 34, z: 1 + rnd() * 59, c: C[Math.floor(rnd() * C.length)], s: 0.6 + rnd() * 0.8 }));
}
// travel: how far the camera has moved forward; trail: how far it had moved a moment ago (for warp streaks)
function drawStars(ctx, stars, travel, prev, t) {
  const D = 59;
  for (const s of stars) {
    const z = ((s.z - travel) % D + D) % D + 1, zp = ((s.z - prev) % D + D) % D + 1;
    const X = 960 + s.x * PXF / z, Y = 540 + s.y * PXF / z; if (X < -40 || X > 1960 || Y < -40 || Y > 1120) continue;
    const sz = Math.max(3, Math.round(s.s * 90 / z / 3) * 3), tw = 0.55 + 0.45 * Math.sin(t * 5 + s.x * 7);
    ctx.globalAlpha = Math.min(1, 1.6 - z / 45) * tw; ctx.fillStyle = s.c;
    if (zp > z && zp - z < 20) { // streak
      const X0 = 960 + s.x * PXF / zp, Y0 = 540 + s.y * PXF / zp;
      if (Math.hypot(X - X0, Y - Y0) > sz * 1.5) { ctx.strokeStyle = s.c; ctx.lineWidth = sz; ctx.lineCap = 'butt'; ctx.beginPath(); ctx.moveTo(X0, Y0); ctx.lineTo(X, Y); ctx.stroke(); }
    }
    const qx = Math.round((X - sz / 2) / 3) * 3, qy = Math.round((Y - sz / 2) / 3) * 3;
    ctx.fillRect(qx, qy, sz, sz);
    if (sz >= 6) { // pixel sparkle: a plus with one-pixel arms that pulse
      const th = Math.max(3, Math.round(sz / 9) * 3), arm = Math.round(sz * (0.6 + 0.5 * tw) / 3) * 3, c0 = qx + sz / 2 - th / 2, c1 = qy + sz / 2 - th / 2;
      ctx.globalAlpha *= 0.75; ctx.fillRect(qx - arm, c1, sz + 2 * arm, th); ctx.fillRect(c0, qy - arm, th, sz + 2 * arm);
    }
  }
  ctx.globalAlpha = 1;
}
const svgSized = (s, n = 256) => s.replace(/<svg([^>]*)>/, (m, a) => '<svg' + a.replace(/\s(width|height)="[^"]*"/g, '') + ` width="${n}" height="${n}">`);
const loadImg = (src) => new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(i); i.src = src; });
// a sticker: white rounded frame with the avatar inside, plus a blurred twin for depth of field
async function stickerCanvas(src, n = 220) {
  const img = await loadImg(src.startsWith('<') ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgSized(src)) : src);
  const c = document.createElement('canvas'); c.width = c.height = n; const x = c.getContext('2d');
  const rr = (p, w, r) => { x.beginPath(); x.roundRect(p, p, w, w, r); };
  rr(0, n, n * 0.24); x.fillStyle = '#fff'; x.fill();
  const b = Math.round(n * 0.05); x.save(); rr(b, n - 2 * b, n * 0.2); x.clip(); x.drawImage(img, b, b, n - 2 * b, n - 2 * b); x.restore();
  const p = Math.round(n * 0.1), bl = document.createElement('canvas'); bl.width = bl.height = n + 2 * p; const y = bl.getContext('2d');
  y.filter = `blur(${Math.round(n * 0.045)}px)`; y.drawImage(c, p, p);
  return { sharp: c, blur: bl, pad: p / n };
}
// a session chip: the grey "新聊天 (3)" pills that get absorbed into the logo
function sessCanvas(txt) {
  const c = document.createElement('canvas'), x = c.getContext('2d'); x.font = '600 34px Geist,"Noto Sans CJK SC"';
  const w = Math.ceil(x.measureText(txt).width) + 96, h = 68; c.width = w; c.height = h; const y = c.getContext('2d');
  y.beginPath(); y.roundRect(2, 2, w - 4, h - 4, 32); y.fillStyle = '#2B2E3D'; y.fill(); y.lineWidth = 4; y.strokeStyle = '#8E95B8'; y.stroke();
  y.fillStyle = '#8E95B8'; y.beginPath(); y.roundRect(22, 20, 30, 24, 7); y.fill(); y.beginPath(); y.moveTo(28, 44); y.lineTo(28, 52); y.lineTo(38, 44); y.fill();
  y.font = '600 34px Geist,"Noto Sans CJK SC"'; y.fillStyle = '#E3E6F2'; y.textBaseline = 'middle'; y.fillText(txt, 66, h / 2 + 1);
  const p = 14, bl = document.createElement('canvas'); bl.width = w + 2 * p; bl.height = h + 2 * p; const z = bl.getContext('2d'); z.filter = 'blur(8px)'; z.drawImage(c, p, p);
  return { sharp: c, blur: bl, pad: p / w, w, h };
}
// nyan trail: six flat rainbow bands, stepped up/down like pixel art; pts = [[x, y, width], ...] head first
function nyan(ctx, pts, t, alpha = 1) {
  const N = pts.length; if (N < 2) return;
  const ph = Math.floor(t * 12);
  for (let i = 0; i < N - 1; i++) {
    const [x0, y0, w0] = pts[i], [x1, y1] = pts[i + 1]; const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 0.5) continue;
    const nx = -dy / L, ny = dx / L, wave = ((i + ph) & 1 ? 1 : -1) * w0 * 0.07, a = alpha * (1 - i / (N - 1));
    // overlap a little along the path so segments read as one ribbon
    const ex = dx / L * 2, ey = dy / L * 2;
    ctx.globalAlpha = Math.max(0, a);
    for (let b = 0; b < 6; b++) {
      const o0 = (b / 6 - 0.5) * w0 + wave, o1 = ((b + 1) / 6 - 0.5) * w0 + wave;
      ctx.fillStyle = RB[b]; ctx.beginPath();
      ctx.moveTo(x0 - ex + nx * o0, y0 - ey + ny * o0); ctx.lineTo(x1 + ex + nx * o0, y1 + ey + ny * o0);
      ctx.lineTo(x1 + ex + nx * o1, y1 + ey + ny * o1); ctx.lineTo(x0 - ex + nx * o1, y0 - ey + ny * o1); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}
function drawSpr(ctx, spr, x, y, w, h, rot, blurK, alpha) {
  if (alpha <= 0.003 || w < 1) return;
  ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
  if (blurK < 0.98) { ctx.globalAlpha = alpha * (1 - blurK); ctx.drawImage(spr.sharp, -w / 2, -h / 2, w, h); }
  if (blurK > 0.02) { const p = spr.pad * w; ctx.globalAlpha = alpha * Math.min(1, blurK * 1.2); ctx.drawImage(spr.blur, -w / 2 - p, -h / 2 - p, w + 2 * p, h + 2 * p); }
  ctx.restore();
}
const proj = (p) => ({ x: 960 + p[0] * PXF / p[2], y: 540 + p[1] * PXF / p[2], k: PXF / p[2] });
