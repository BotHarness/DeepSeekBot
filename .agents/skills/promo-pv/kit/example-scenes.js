// Example timeline: three reference scenes from the Tobs PV, small enough to read in one sitting.
// Every time is on the beat grid: T(bar) for bars, TB(beat) for beats. Replace with your own storyboard.
const BEIGE = '#ECEAE6', BLUE = '#4176E6';

// ---- 1 · the answer: a typed line with a caret, then the name drops in letter by letter, the logo lands on top ----
S('answer', 0, T(3), (root) => {
  root.style.background = BEIGE;
  const caret = `<span style="display:inline-block;width:.09em;height:.95em;margin-left:.08em;vertical-align:-.12em;background:${BLUE};border-radius:2px"></span>`;
  const l1 = el('div', 'abs', root); l1.style.cssText += `left:0;right:0;top:400px;text-align:center;font:800 54px Geist,"Noto Sans CJK SC";letter-spacing:.3em;color:${BLUE};white-space:pre;`;
  const l2 = el('div', 'abs', root); l2.style.cssText += 'left:0;right:0;top:490px;text-align:center;font:800 92px Geist,"Noto Sans CJK SC";color:#0F1115;white-space:pre;';
  const type = (e, txt, t, a, cps, on) => { const n = Math.floor(clamp((t - a) * cps, 0, txt.length)); const blink = on && (n < txt.length || Math.floor(t * 3.2) % 2 === 0); const h = (t < a ? '' : txt.slice(0, n)) + (on && t >= a - 0.3 ? `<span style="opacity:${blink ? 1 : 0}">${caret}</span>` : ''); if (e._h !== h) { e._h = h; e.innerHTML = h; } return n; };
  const word = el('div', 'abs', root, 'Team of Bots'); word.style.cssText += 'left:0;right:0;top:660px;text-align:center;font:800 150px/1 Geist;letter-spacing:-.02em;color:#3A3D44;';
  const wc = splitChars(word); [0, 4, 7].forEach(i => { wc[i].style.color = BLUE; });
  const logo = logoStk(root, 960 - 150, 250, 300, -4);
  const a = 0.2, Ts = T(1.25), Tg = T(2);
  return (t) => {
    const n1 = type(l1, '隆重介绍', t, a, 9, t < a + 0.6), n2 = type(l2, '一款基于 Bot 人机交互的产品', t, a + 0.6, 17, t >= a + 0.6);
    for (let i = 0; i < n1; i++) cue('ty1' + i, a + i / 9, 'tick', 0.45);
    for (let i = 0; i < n2; i += 2) cue('ty2' + i, a + 0.6 + i / 17, 'tick', 0.35);
    const ko = t > Ts - 0.15 ? outS(t, Ts - 0.15, 0.3) : 1;
    fx(l1, { y: -60 * (1 - ko), o: ko }); fx(l2, { y: -60 * (1 - ko), o: ko });
    stag(wc, t, Ts + 0.05, 0.05, (c, tt, aa, i) => { drop(c, tt, aa, { h: 160 }); if (i % 3 === 0) cue('wc' + i, aa + 0.22, 'pop', 0.6); });
    drop(logo, t, Tg, { h: 760, d: 0.34 }); cue('logo', Tg + 0.34, 'pop', 1.2);
    if (t >= Tg + 0.8) { const fl = clamp((t - Tg - 0.8) / 0.6); fx(logo, { r: bob(t, 0, 2, 0.4) * fl, y: bob(t, 1, 5, 0.4) * fl, origin: '50% 100%' }); }
  };
}, { tout: { type: 'zoom', d: 0.25, amt: 0.25 } });

// ---- 2 · bento: the whole board first, then the camera focuses each feature on the beat, back out on the drop ----
S('bento', T(3), T(8), (root) => {
  root.style.background = BEIGE;
  const cam = el('div', 'abs', root); cam.style.cssText += 'left:0;top:0;width:1920px;height:1080px;transform-origin:0 0;';
  const ht = el('div', 'title abs', root, '欢迎来到 Bot 的世界'); ht.style.cssText += 'left:100px;top:70px;font-size:76px;z-index:3;';
  const htc = splitChars(ht);
  const X0 = 100, Y0 = 200, CW = 415, CH = 400, G = 20, cards = [];
  const cell = (c, w, bg, title, sub, fg = '#fff') => {
    const W = w * CW + (w - 1) * G, L = X0 + c * (CW + G);
    const d = el('div', 'abs', cam, `<div style="position:absolute;left:36px;top:30px;font:800 44px Geist,'Noto Sans CJK SC'">${title}</div><div style="position:absolute;left:36px;top:88px;font:600 24px Geist,'Noto Sans CJK SC';opacity:.82">${sub}</div><div class="ck" style="position:absolute;left:36px;top:180px;font:800 72px GeistMono"></div>`);
    d.style.cssText += `left:${L}px;top:${Y0}px;width:${W}px;height:${CH}px;border-radius:34px;background:${bg};color:${fg};overflow:hidden;box-shadow:0 24px 50px -28px rgba(0,0,0,.45);`;
    d._cx = L + W / 2; d._cy = Y0 + CH / 2; d._w = W; cards.push(d); return d;
  };
  cell(0, 2, BLUE, '托布 + 群聊', '一句话组队，群里 @ 谁谁就来'); cell(2, 1, '#287454', '记忆', '是一个 Git 仓库'); cell(3, 1, '#7957C9', '定时任务', '每周五 17:30 发周报');
  const ck = cards[2].querySelector('.ck');
  const a = T(3), D = T(7), TS = cards.map((_, k) => T(4 + k));
  const tgt = (k) => k < 0 || k >= cards.length ? [960, 540, 0] : [cards[k]._cx, cards[k]._cy, Math.log(Math.min(2.2, 1500 / cards[k]._w, 860 / CH))];
  const cAt = (t) => -1 + [...TS, D].reduce((s, ts) => s + sprS(t - ts, 0.62, 1.35), 0);
  const camAt = (t) => { const c = cAt(t), i0 = Math.max(-1, Math.min(cards.length, Math.floor(c))), f = c - i0, A = tgt(i0), B = tgt(i0 + 1); return [lerp(A[0], B[0], f), lerp(A[1], B[1], f), lerp(A[2], B[2], f), c]; };
  return (t) => {
    const [cx, cy, lz, c] = camAt(t), z = Math.exp(lz);
    cam.style.transform = `translate(${(960 - cx * z).toFixed(1)}px,${(540 - cy * z).toFixed(1)}px) scale(${z.toFixed(4)})`;
    const ov = clamp(-c) + clamp(c - (cards.length - 1));
    cards.forEach((d, i) => {
      const ai = a + 0.12 + i * 0.08, foc = clamp(1 - Math.abs(i - c));
      if (t < ai) { fx(d, { o: 0 }); return; }
      const k = sprS(t - ai, 0.55, 1.6);
      fx(d, { y: 160 * (1 - k), s: lerp(0.7, 1, k), r: (i % 2 ? 4 : -4) * (1 - k), o: clamp((t - ai) / 0.1) * Math.max(ov, lerp(0.3, 1, foc)) });
      d.style.zIndex = foc > 0.5 ? '2' : '';
      cue('in' + i, ai, 'pop', 0.5); cue('foc' + i, TS[i], 'swish', 0.6);
    });
    const ct = TS[2] + 0.4, v = t >= ct ? '17:30' : '17:29'; if (ck.textContent !== v) ck.textContent = v;
    fx(ck, { s: 1 + (t >= ct ? 0.14 * Math.exp(-(t - ct) * 7) * Math.cos((t - ct) * 20) : 0) });
    cue('drop', D, 'whoosh', 1.1);
    const tk = Math.min(1 - prog(t, TS[0] - 0.1, TS[0] + 0.25), 1) + prog(t, D + 0.2, D + 0.5);
    stag(htc, t, a + 0.25, 0.04, (ch, tt, aa) => drop(ch, tt, aa, { h: 80 }));
    if (t > TS[0] - 0.1) htc.forEach(ch => fx(ch, { o: clamp(tk), y: -30 * (1 - clamp(tk)) }));
  };
}, { tin: { type: 'fade', d: 0.3 } });

// ---- 3 · pixel cosmos: bots and old sessions dive into the logo from every direction; each one fills the bar ----
S('cosmos', T(8), END, async (root) => {
  root.style.background = '#000';
  const [cv, ctx] = canvasIn(root);
  const track = el('div', 'abs', root); track.style.cssText += 'left:600px;top:560px;width:720px;height:30px;border-radius:15px;background:#1B2142;';
  const lab = el('div', 'kicker abs', root); lab.style.cssText += 'left:600px;top:614px;color:#AEB6D6;font-size:24px;';
  const [bv, bx] = canvasIn(root); bv.style.zIndex = 2;
  const stars = pxStars(420, 13), lg = await stickerCanvas('assets/tobs-logo.png', 300);
  const names = ['Mira', 'Nova', 'Theo', 'Luna', 'Juno', 'Ivy', 'Rin', 'Coco', 'Sol', 'Kai', '架构师', '测试工程师'];
  const bots = []; for (const n of names) bots.push(await stickerCanvas(avatarSvg(n), 180));
  const sess = ['新聊天 (3)', '方案 v4 最终版', '继续上次的', '周报 again'].map(sessCanvas);
  const a = T(8), Z = END - 1.2, LG = [0, -0.88, 4], K = bots.length + sess.length;
  let r = 21; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647;
  const F = Array.from({ length: K }, (_, k) => {
    const isS = k % 4 === 1 && (k >> 2) < sess.length, spr = isS ? sess[k >> 2] : bots[(k - (k >> 2) - (k % 4 > 1 ? 1 : 0)) % bots.length];
    const x = k / (K - 1), ab = a + 0.6 + (Z - a - 0.6) * (1 - Math.pow(1 - x, 1.7)), dur = 0.85 + rnd() * 0.45;
    const th = rnd() * TAU, near = rnd() < 0.4, rr = near ? 1 + rnd() * 1.2 : 8 + rnd() * 14, S0 = [Math.cos(th) * rr, Math.sin(th) * rr * 0.62, near ? 0.7 + rnd() * 0.8 : 18 + rnd() * 40];
    return { isS, spr, ab, t0: ab - dur, S0, C: [(S0[0] + LG[0]) / 2 - Math.sin(th) * rr * 0.4, (S0[1] + LG[1]) / 2 + Math.cos(th) * rr * 0.3, (S0[2] + LG[2]) / 2], w: isS ? spr.w / 260 * 0.5 : 0.5 };
  });
  const bez = (u, f) => f.S0.map((_, j) => (1 - u) * (1 - u) * f.S0[j] + 2 * u * (1 - u) * f.C[j] + u * u * LG[j]);
  const pAt = (t) => F.reduce((s, f) => s + clamp(sprS(t - f.ab, 0.7, 2.6), 0, 1.15), 0) / K;
  return (t) => {
    const lt = t - a; ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080);
    drawStars(ctx, stars, 3.5 * lt, 3.5 * (lt - 1 / 30), t);
    let pulse = 0; F.forEach(f => { if (t > f.ab) pulse += Math.exp(-(t - f.ab) * 9) * Math.cos((t - f.ab) * 28); });
    const live = F.filter(f => t >= f.t0 && t < f.ab).map(f => { const u = (t - f.t0) / (f.ab - f.t0); return { f, u, p: bez(eIn(u, 1.6), f) }; }).sort((p, q) => q.p[2] - p.p[2]);
    const one = ({ f, u, p }) => {
      const P = proj(p), w = f.w * P.k * (1 - 0.85 * eIn(prog(t, f.ab - 0.2, f.ab), 2)), h = f.isS ? w * f.spr.h / f.spr.w : w;
      const pts = []; for (let i = 0; i < 14; i++) { const Q = proj(bez(eIn(Math.max(0, u - i * 0.03), 1.6), f)); pts.push([Q.x, Q.y, Math.min(h * 0.6, (f.isS ? f.w * 0.3 : f.w) * Q.k * 0.55)]); }
      nyan(ctx, pts, t, clamp(u / 0.15) * (f.isS ? 0.7 : 1));
      drawSpr(ctx, f.spr, P.x, P.y, w, h, 0, p[2] < 1.6 ? clamp((1.6 - p[2]) / 0.9) * 0.9 : clamp((p[2] - 9) / 25) * 0.8, clamp(u / 0.1));
    };
    live.filter(o => o.p[2] > LG[2]).forEach(one);
    const pr = pAt(t), ls = 300 * lerp(0.82, 1, Math.min(1, pr)) * sprS(lt - 0.05, 0.5, 1.6) * (1 + 0.05 * pulse);
    const g = ctx.createRadialGradient(960, 320, 40, 960, 320, 330 + 120 * pr); g.addColorStop(0, `rgba(160,180,255,${0.35 + 0.35 * pr})`); g.addColorStop(1, 'rgba(160,180,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 1920, 1080); drawSpr(ctx, lg, 960, 320, ls, ls * (1 - 0.03 * pulse), 0, 0, 1);
    live.filter(o => o.p[2] <= LG[2]).forEach(one);
    F.forEach((f, k) => cue('ab' + k, f.ab, f.isS ? 'tick' : 'pop', 0.5));
    const p = Math.min(1, pr);
    fx(track, { sx: sprS(lt - 0.2, 0.55, 1.8), o: clamp((lt - 0.2) / 0.15), origin: '50% 50%' });
    lab.textContent = `${Math.round(p * 100)}% · SESSION → BOT`; lab.style.opacity = clamp((lt - 0.4) / 0.3);
    bx.clearRect(0, 0, 1920, 1080); bv.style.display = p > 0.003 ? '' : 'none';
    if (p > 0.003) { bx.save(); bx.beginPath(); bx.roundRect(600, 560, 720, 30, 15); bx.clip(); rbDraw(bx, 600, 600 + 720 * p, 575, 30, { t, amp: 3, step: 20 }); bx.restore(); }
    flash(a, 0.3, 0.55);
  };
});
