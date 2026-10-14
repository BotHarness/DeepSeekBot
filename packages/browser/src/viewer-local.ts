import type { IncomingMessage, ServerResponse } from 'node:http';

import type { BrowserViewerHost } from './viewer.js';
import type { BotBrowserRuntimes } from './runtimes.js';
import { createFrameFeeds } from './frame-feed.js';
import type { TakeoverCompletion, TakeoverService } from './takeover.js';

export const LOCAL_VIEWER_PREFIX = '/botharness-browser/viewer/local';

export function localViewerUrl(slug: string): string {
  return `${LOCAL_VIEWER_PREFIX}/?slug=${encodeURIComponent(slug)}`;
}

export type ViewerLocale = 'zh' | 'en';

export interface ViewerStrings {
  readonly title: string;
  readonly trackpadOn: string;
  readonly directTap: string;
  readonly hintTrackpad: string;
  readonly hintDirect: string;
  readonly done: string;
  readonly failed: string;
  readonly leftClick: string;
  readonly rightClick: string;
  readonly scrollUp: string;
  readonly scrollDown: string;
  readonly keyboard: string;
  readonly takeOver: string;
  readonly release: string;
  readonly overlayCta: string;
  readonly navDirect: string;
  readonly navTrack: string;
  readonly missingSlug: string;
  readonly browserNotRunning: string;
  readonly frameUnavailable: string;
  readonly inputUnavailable: string;
  readonly pauseRequired: string;
  readonly inputFailed: string;
  readonly handoffExpired: string;
  readonly handoffUnavailable: string;
  readonly handoffDone: string;
  readonly requesting: string;
  readonly takingOver: string;
  readonly releasing: string;
  readonly statusUnavailable: string;
  readonly takeoverUnavailable: string;
  readonly releaseUnavailable: string;
  readonly handoffInProgress: string;
}

export const VIEWER_STRINGS: Record<ViewerLocale, ViewerStrings> = {
  en: {
    title: 'Bot Browser',
    trackpadOn: 'Trackpad: on',
    directTap: 'Direct tap',
    hintTrackpad: 'Swipe moves the cursor, tap clicks, long-press right-clicks',
    hintDirect: 'Tap clicks, long-press right-clicks, swipe scrolls, type on your keyboard',
    done: 'Done',
    failed: 'Could not finish',
    leftClick: 'Left Click',
    rightClick: 'Right Click',
    scrollUp: '▲ Scroll',
    scrollDown: '▼ Scroll',
    keyboard: '⌨ Keyboard',
    takeOver: 'Take over',
    release: 'Release',
    overlayCta: '👆 Tap to take over and operate',
    navDirect: 'Direct tap',
    navTrack: 'Trackpad',
    missingSlug: 'missing slug',
    browserNotRunning: 'browser not running',
    frameUnavailable: 'frame unavailable',
    inputUnavailable: 'input unavailable',
    pauseRequired: 'Pause the bot in the Browser entry, then act',
    inputFailed: 'input failed',
    handoffExpired: 'handoff link expired or already used',
    handoffUnavailable: 'handoff link unavailable',
    handoffDone: 'Reported, the bot will verify',
    requesting: 'requesting takeover…',
    takingOver: 'taking over…',
    releasing: 'releasing…',
    statusUnavailable: 'takeover status unavailable',
    takeoverUnavailable: 'takeover unavailable',
    releaseUnavailable: 'release unavailable',
    handoffInProgress: 'handoff in progress, finishing keeps pause',
  },
  zh: {
    title: 'Bot 浏览器',
    trackpadOn: '触控板：开',
    directTap: '直接点按',
    hintTrackpad: '滑动移动光标，轻点点击，长按右键',
    hintDirect: '点按点击，长按右键，滑动滚动，用键盘直接输入',
    done: '完成',
    failed: '无法完成',
    leftClick: '左键点击',
    rightClick: '右键点击',
    scrollUp: '▲ 上滚',
    scrollDown: '▼ 下滚',
    keyboard: '⌨ 键盘',
    takeOver: '接管',
    release: '取消接管',
    overlayCta: '👆 点击接管，直接操作',
    navDirect: '直接点按',
    navTrack: '触控板',
    missingSlug: '缺少 slug',
    browserNotRunning: '浏览器未运行',
    frameUnavailable: '画面不可用',
    inputUnavailable: '输入不可用',
    pauseRequired: '先接管再操作',
    inputFailed: '输入失败',
    handoffExpired: '接管链接已过期或已使用',
    handoffUnavailable: '接管链接不可用',
    handoffDone: '已提交，Bot 会校验',
    requesting: '正在请求接管…',
    takingOver: '正在接管…',
    releasing: '正在释放…',
    statusUnavailable: '接管状态不可用',
    takeoverUnavailable: '接管不可用',
    releaseUnavailable: '释放不可用',
    handoffInProgress: '交接进行中，保持暂停',
  },
};

export function viewerLocaleOf(
  headers: Record<string, string | string[] | undefined>,
): ViewerLocale {
  const raw = headers['accept-language'];
  const first = Array.isArray(raw) ? (raw[0] ?? '') : (raw ?? '');
  return first.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

function viewerPage(locale: ViewerLocale): string {
  const T = VIEWER_STRINGS[locale];
  return `<!DOCTYPE html>
<html lang="${locale}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${T.title}</title>
<style>
html,body{margin:0;padding:0;height:100%;background:#101014;color:#fff;font-family:system-ui,-apple-system,sans-serif}
#wrap{max-width:1280px;margin:0 auto;padding:8px;box-sizing:border-box}
#toolbar{display:flex;gap:8px;align-items:center;padding:8px 2px}
#handoff{display:none;border:1px solid #665;border-radius:8px;background:#23230f;padding:10px 12px;margin:8px 2px;font-size:13px}
#handoffBtns{display:flex;gap:8px;margin-top:8px}
#modeBtn{border:1px solid #555;border-radius:14px;background:#222;color:#fff;font-size:13px;padding:6px 12px;cursor:pointer}
#hint{font-size:12px;opacity:.65}
#stage{position:sticky;top:0;z-index:1;background:#101014;padding-top:4px;touch-action:none}
#videoCanvas{width:100%;height:auto;display:block;background:#000;border-radius:8px;min-height:120px;touch-action:none}
#cursor{position:absolute;width:16px;height:16px;margin:-8px 0 0 -8px;border:2px solid #fff;border-radius:50%;box-shadow:0 0 0 1px #000;pointer-events:none;display:none}
#takePill{position:absolute;left:50%;bottom:14px;transform:translateX(-50%);display:none;border:1px solid #6af;border-radius:20px;background:rgba(20,30,50,.92);color:#fff;font-size:14px;padding:10px 18px;cursor:pointer;touch-action:manipulation;white-space:nowrap;max-width:92%}
#takePill:active{background:#2a3f5f}
#padRow{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 2px}
.padBtn{min-height:68px;border:1px solid #555;border-radius:18px;background:#222;color:#fff;font-size:17px;cursor:pointer;touch-action:manipulation}
.padBtn:active{background:#3a3a42;border-color:#888;transform:scale(0.97)}
.padBtn.armed{background:#356;border-color:#6af;color:#fff}
.padBtn.wide{grid-column:1/-1}
#kbdRow{position:sticky;bottom:0;display:flex;flex-direction:column;gap:8px;padding:8px 2px;background:#101014}
#footNav{display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:4px 2px 10px}
.footBtn{min-height:56px;border:1px solid #555;border-radius:16px;background:#1c1c22;color:#fff;font-size:15px;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center;gap:8px}
.footBtn:active{background:#3a3a42}
.footBtn.active{border-color:#6af;background:#233246}
#modRow{display:flex;gap:8px}
.modBtn{flex:1;border:1px solid #555;border-radius:14px;background:#222;color:#fff;font-size:15px;padding:8px 4px;cursor:pointer;touch-action:manipulation}
.modBtn:active{background:#3a3a42;border-color:#888}
.modBtn.armed{background:#356;border-color:#6af;color:#fff}
#typeRow{display:flex;gap:8px}
.ripple{position:absolute;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;border:2px solid #fff;opacity:.9;pointer-events:none;animation:rippleAnim .35s ease-out forwards}
@keyframes rippleAnim{to{transform:scale(1.8);opacity:0}}
#typeRow{display:flex;gap:8px}
#ghost{position:fixed;left:0;bottom:0;width:4px;height:4px;opacity:0.01;border:0;padding:0;pointer-events:none}
#kbd{flex:1;border:1px solid #555;border-radius:14px;background:#1a1a1f;color:#fff;font-size:14px;padding:8px 12px;min-width:0}
.keyBtn{border:1px solid #555;border-radius:14px;background:#222;color:#fff;font-size:13px;padding:8px 12px;cursor:pointer;touch-action:manipulation}
.keyBtn:active{background:#3a3a42;border-color:#888}
#modeBtn:active{background:#3a3a42}
#status{font-size:12px;opacity:.7;padding:8px 2px;min-height:16px}
</style>
</head>
<body>
<div id="wrap"><div id="handoff"><div id="handoffText"></div><div id="handoffBtns"><button class="keyBtn" id="doneBtn" type="button">${T.done}</button><button class="keyBtn" id="failBtn" type="button">${T.failed}</button></div></div><div id="toolbar"><button id="modeBtn" type="button">${T.trackpadOn}</button><span id="hint"></span></div><div id="stage"><canvas id="videoCanvas"></canvas><div id="cursor"></div><button id="takePill" type="button"><span id="takePillText"></span></button></div><div id="padRow"><button class="padBtn" id="padLeft" type="button">${T.leftClick}</button><button class="padBtn" id="padRight" type="button">${T.rightClick}</button><button class="padBtn" id="padUp" type="button">${T.scrollUp}</button><button class="padBtn" id="padDown" type="button">${T.scrollDown}</button><button class="padBtn wide" id="padKbd" type="button">${T.keyboard}</button><button class="padBtn wide" id="padTakeover" type="button">${T.takeOver}</button></div><div id="kbdRow"><div id="modRow"><button class="modBtn" id="modMeta" type="button">⌘</button><button class="modBtn" id="modCtrl" type="button">⌃</button><button class="modBtn" id="modAlt" type="button">⌥</button><button class="modBtn" id="modShift" type="button">⇧</button><button class="keyBtn" id="enterBtn" type="button">⏎</button><button class="keyBtn" id="backBtn" type="button">⌫</button></div></div><div id="footNav"><button class="footBtn" id="navDirect" type="button"><span>🖱️</span><span>${T.navDirect}</span></button><button class="footBtn" id="navTrack" type="button"><span>👆</span><span>${T.navTrack}</span></button></div><input id="ghost" type="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" tabindex="-1" enterkeyhint="go"><div id="status"></div></div>
<script>
const T = ${JSON.stringify(VIEWER_STRINGS[locale]).replace(/</g, '\\u003c')};
(() => {
  const params = new URLSearchParams(location.search);
  const slug = params.get('slug') ?? '';
  const surface = document.getElementById('videoCanvas');
  const surfaceCanvas = surface instanceof HTMLCanvasElement ? surface : null;
  const cursor = document.getElementById('cursor');
  const status = document.getElementById('status');
  const modeBtn = document.getElementById('modeBtn');
  const hint = document.getElementById('hint');
  const padLeft = document.getElementById('padLeft');
  const padRight = document.getElementById('padRight');
  const padUp = document.getElementById('padUp');
  const padDown = document.getElementById('padDown');
  const padKbd = document.getElementById('padKbd');
  const padTakeover = document.getElementById('padTakeover');
  const takePill = document.getElementById('takePill');
  const takePillText = document.getElementById('takePillText');
  const navDirect = document.getElementById('navDirect');
  const navTrack = document.getElementById('navTrack');
  const footNav = document.getElementById('footNav');
  const ghost = document.getElementById('ghost');
  const ghostField = ghost instanceof HTMLInputElement ? ghost : null;
  const enterBtn = document.getElementById('enterBtn');
  const backBtn = document.getElementById('backBtn');
  const padRow = document.getElementById('padRow');
  const kbdRow = document.getElementById('kbdRow');
  const modBtns = {
    meta: document.getElementById('modMeta'),
    ctrl: document.getElementById('modCtrl'),
    alt: document.getElementById('modAlt'),
    shift: document.getElementById('modShift'),
  };
  const handoffBox = document.getElementById('handoff');
  const handoffText = document.getElementById('handoffText');
  const doneBtn = document.getElementById('doneBtn');
  const failBtn = document.getElementById('failBtn');
  const handoffToken = params.get('takeover') ?? '';
  const toolbar = document.getElementById('toolbar');
  const forcedMode = params.get('mode');
  let modeOverride;
  if ((forcedMode === 'direct' || forcedMode === 'trackpad') && window.parent !== window) {
    modeOverride = forcedMode;
    if (toolbar) toolbar.style.display = 'none';
  }
  async function finishHandoff(reason) {
    if (handoffToken === '') return;
    try {
      const response = await fetch('handoff/complete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: handoffToken, reason }),
      });
      say(response.ok ? T.handoffDone : T.handoffExpired);
      if (handoffBox) handoffBox.style.display = 'none';
    } catch {
      say('handoff completion unavailable');
    }
  }
  async function loadHandoff() {
    if (handoffToken === '') return;
    try {
      const accepted = await fetch('handoff/accept', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: handoffToken }),
      });
      if (!accepted.ok) {
        say(T.handoffExpired);
        return;
      }
      const details = await (await fetch('handoff?token=' + encodeURIComponent(handoffToken), { cache: 'no-store' })).json();
      if (handoffBox) handoffBox.style.display = 'block';
      if (handoffText) handoffText.textContent = typeof details.instructions === 'string' ? details.instructions : '';
    } catch {
      say(T.handoffUnavailable);
    }
  }
  if (doneBtn) doneBtn.addEventListener('click', () => void finishHandoff('done'));
  if (failBtn) failBtn.addEventListener('click', () => void finishHandoff('failed'));
  let mode = window.innerWidth < 768 && window.matchMedia('(pointer: coarse)').matches ? 'trackpad' : 'direct';
  if (modeOverride !== undefined) mode = modeOverride;
  const finePointer = window.matchMedia('(pointer: fine)').matches;
  const armed = { meta: false, ctrl: false, alt: false, shift: false };
  function armedMods() {
    const out = [];
    if (armed.meta) out.push('meta');
    if (armed.ctrl) out.push('ctrl');
    if (armed.alt) out.push('alt');
    if (armed.shift) out.push('shift');
    return out;
  }
  function disarm() {
    armed.meta = false;
    armed.ctrl = false;
    armed.alt = false;
    armed.shift = false;
    for (const key of Object.keys(modBtns)) {
      const btn = modBtns[key];
      if (btn) btn.classList.remove('armed');
    }
  }
  function layoutRows() {
    const bare = mode === 'direct' && finePointer;
    if (padRow) padRow.style.display = bare ? 'none' : '';
    if (kbdRow) kbdRow.style.display = bare ? 'none' : '';
    if (footNav) footNav.style.display = bare ? 'none' : '';
    return bare;
  }
  let takenState = false;
  function paintOverlay() {
    const bare = mode === 'direct' && finePointer;
    if (takePill) takePill.style.display = takenState || bare ? 'none' : '';
  }
  function setMode(next) {
    if (mode === next) return;
    mode = next;
    paint();
  }
  let cx = 0;
  let cy = 0;
  let viewW = 0;
  let viewH = 0;
  let cursorInit = false;
  let lastScroll = 0;
  function say(text) {
    if (status) status.textContent = text;
  }
  function paint() {
    if (modeBtn) modeBtn.textContent = mode === 'trackpad' ? T.trackpadOn : T.directTap;
    if (hint) hint.textContent = mode === 'trackpad' ? T.hintTrackpad : T.hintDirect;
    if (cursor) cursor.style.display = mode === 'trackpad' ? 'block' : 'none';
    if (navDirect) navDirect.classList.toggle('active', mode === 'direct');
    if (navTrack) navTrack.classList.toggle('active', mode === 'trackpad');
    layoutRows();
    paintOverlay();
    place();
  }
  function place() {
    if (!surface || !cursor || surface.clientWidth === 0) return;
    if (!cursorInit) {
      cx = surface.clientWidth / 2;
      cy = surface.clientHeight / 2;
      cursorInit = true;
    }
    cx = Math.max(0, Math.min(surface.clientWidth, cx));
    cy = Math.max(0, Math.min(surface.clientHeight, cy));
    cursor.style.left = cx + 'px';
    cursor.style.top = cy + 'px';
  }
  function pagePoint(clientX, clientY) {
    if (!surface || !surfaceCanvas) return null;
    const rect = surface.getBoundingClientRect();
    const dx = clientX - rect.left;
    const dy = clientY - rect.top;
    if (dx < 0 || dy < 0 || dx > rect.width || dy > rect.height || rect.width === 0 || rect.height === 0) return null;
    const baseW = viewW > 0 ? viewW : surfaceCanvas.width;
    const baseH = viewH > 0 ? viewH : surfaceCanvas.height;
    const sx = baseW / rect.width;
    const sy = baseH / rect.height;
    return { x: Math.round(dx * sx), y: Math.round(dy * sy) };
  }
  function cursorPoint() {
    if (!surface || !surfaceCanvas || surface.clientWidth === 0 || surfaceCanvas.width === 0) return null;
    const baseW = viewW > 0 ? viewW : surfaceCanvas.width;
    const baseH = viewH > 0 ? viewH : surfaceCanvas.height;
    return { x: Math.round(cx * (baseW / surface.clientWidth)), y: Math.round(cy * (baseH / surface.clientHeight)) };
  }
  async function send(body) {
    try {
      const response = await fetch('input', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(Object.assign({ slug }, body)),
      });
      if (response.status === 409) {
        say(T.pauseRequired);
        return;
      }
      if (!response.ok) {
        try {
          const reason = await response.text();
          say(reason === '' ? T.inputFailed + ' (' + response.status + ')' : reason.slice(0, 160));
        } catch {
          say(T.inputFailed + ' (' + response.status + ')');
        }
        return;
      }
      say('');
      if (frameMode !== 'stream') void poll();
    } catch {
      say(T.inputUnavailable);
    }
  }
  let frameSeq = '';
  let frameMode = 'snapshot';
  let looping = false;
  async function loop() {
    if (looping) return;
    looping = true;
    for (;;) {
      const delay = await poll();
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  async function poll() {
    if (slug === '') {
      say(T.missingSlug);
      return 1000;
    }
    try {
      const response = await fetch('frame?slug=' + encodeURIComponent(slug) + '&t=' + Date.now() + (frameSeq === '' ? '' : '&after=' + frameSeq), { cache: 'no-store' });
      if (response.status === 204) return 0;
      if (!response.ok) {
        frameSeq = '';
        say(response.status === 404 ? T.browserNotRunning : T.frameUnavailable + ' (' + response.status + ')');
        return 1000;
      }
      frameSeq = response.headers.get('x-frame-seq') ?? '';
      frameMode = response.headers.get('x-frame-mode') === 'stream' ? 'stream' : 'snapshot';
      const blob = await response.blob();
      const headerW = Number(response.headers.get('x-viewport-width'));
      const headerH = Number(response.headers.get('x-viewport-height'));
      if (Number.isFinite(headerW) && headerW > 0) viewW = headerW;
      if (Number.isFinite(headerH) && headerH > 0) viewH = headerH;
      if (surfaceCanvas) {
        const bitmap = await createImageBitmap(blob);
        if (surfaceCanvas.width !== bitmap.width || surfaceCanvas.height !== bitmap.height) {
          surfaceCanvas.width = bitmap.width;
          surfaceCanvas.height = bitmap.height;
        }
        const context = surfaceCanvas.getContext('2d');
        if (context) context.drawImage(bitmap, 0, 0);
        if (typeof bitmap.close === 'function') bitmap.close();
      }
      place();
      return frameMode === 'stream' ? 0 : 1000;
    } catch {
      say(T.frameUnavailable);
      return 1000;
    }
  }
  if (modeBtn) modeBtn.addEventListener('click', () => {
    setMode(mode === 'trackpad' ? 'direct' : 'trackpad');
  });
  if (navDirect) navDirect.addEventListener('click', () => setMode('direct'));
  if (navTrack) navTrack.addEventListener('click', () => setMode('trackpad'));
  function padClick(point) {
    if (point !== null) void send({ kind: 'click', x: point.x, y: point.y });
  }
  if (padLeft) padLeft.addEventListener('click', () => padClick(cursorPoint()));
  if (padRight) padRight.addEventListener('click', () => {
    const point = cursorPoint();
    if (point !== null) void send({ kind: 'click', x: point.x, y: point.y, button: 'right' });
  });
  if (padUp) padUp.addEventListener('click', () => void send({ kind: 'scroll', direction: 'up', amount: 600 }));
  if (padDown) padDown.addEventListener('click', () => void send({ kind: 'scroll', direction: 'down', amount: 600 }));
  function paintTakeover(active) {
    takenState = active;
    if (padTakeover) {
      padTakeover.textContent = active ? T.release : T.takeOver;
      padTakeover.classList.toggle('armed', active);
    }
    paintOverlay();
  }
  if (typeof window !== 'undefined' && window.parent !== window) {
    window.addEventListener('message', (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data !== null && typeof data === 'object' && data.type === 'bh-takeover-state') {
        paintTakeover(data.active === true);
      }
    });
  }
  const readTakeover = async () => {
        try {
          const response = await fetch('/api/browser/observation?slug=' + encodeURIComponent(slug), {
            cache: 'no-store',
          });
          if (!response.ok) return undefined;
          const state = await response.json();
          if (state === null || typeof state !== 'object') return undefined;
          return {
            taken: state.takeover === true,
            pending: state.handoffPending === true,
          };
        } catch {
          return undefined;
        }
      };
      const flipTakeover = async (active) => {
        try {
          const response = await fetch('/api/browser/takeover', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slug, active }),
          });
          return response.ok;
        } catch {
          return false;
        }
      };
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  async function engageTakeover() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'bh-takeover-toggle' }, window.location.origin);
    }
    if (padTakeover) padTakeover.classList.add('armed');
    say(T.requesting);
    const before = await readTakeover();
    if (before === undefined) {
      say(T.statusUnavailable);
      if (padTakeover) padTakeover.classList.remove('armed');
      return;
    }
    if (before.taken) {
      paintTakeover(true);
      say('');
      return;
    }
    await sleep(1500);
    const current = await readTakeover();
    if (current === undefined || current.taken) {
      if (current !== undefined) paintTakeover(true);
      say('');
      return;
    }
    say(T.takingOver);
    if (await flipTakeover(true)) {
      paintTakeover(true);
      say('');
    } else {
      say(T.takeoverUnavailable);
      if (padTakeover) padTakeover.classList.remove('armed');
    }
  }
  async function releaseTakeover() {
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'bh-takeover-toggle' }, window.location.origin);
    }
    if (padTakeover) padTakeover.classList.add('armed');
    say(T.requesting);
    const before = await readTakeover();
    if (before === undefined) {
      say(T.statusUnavailable);
      if (padTakeover) padTakeover.classList.remove('armed');
      return;
    }
    if (!before.taken) {
      paintTakeover(false);
      say('');
      return;
    }
    if (before.pending) {
      say(T.handoffInProgress);
      if (padTakeover) padTakeover.classList.remove('armed');
      return;
    }
    await sleep(1500);
    const current = await readTakeover();
    if (current === undefined || !current.taken) {
      if (current !== undefined) paintTakeover(false);
      say('');
      return;
    }
    say(T.releasing);
    if (await flipTakeover(false)) {
      paintTakeover(false);
      say('');
    } else {
      say(T.releaseUnavailable);
      if (padTakeover) padTakeover.classList.remove('armed');
    }
  }
  if (padTakeover) padTakeover.addEventListener('click', () => {
    if (takenState) void releaseTakeover();
    else void engageTakeover();
  });
  if (takePillText) takePillText.textContent = T.overlayCta;
  if (takePill) takePill.addEventListener('click', () => {
    void engageTakeover();
  });
  void (async () => {
    try {
      const response = await fetch('/api/browser/observation?slug=' + encodeURIComponent(slug), {
        cache: 'no-store',
      });
      if (!response.ok) return;
      const state = await response.json();
      if (state !== null && typeof state === 'object') paintTakeover(state.takeover === true);
    } catch {
      void 0;
    }
  })();
  if (padKbd) padKbd.addEventListener('click', () => {
    if (document.activeElement === ghostField) {
      disarm();
      if (ghostField) ghostField.blur();
      padKbd.classList.remove('armed');
    } else {
      focusGhost();
    }
  });
  if (ghostField) {
    ghostField.addEventListener('focus', () => {
      if (padKbd) padKbd.classList.add('armed');
    });
    ghostField.addEventListener('blur', () => {
      if (padKbd) padKbd.classList.remove('armed');
    });
  }
  function focusGhost() {
    if (ghostField) {
      try {
        ghostField.focus({ preventScroll: true });
      } catch {
        ghostField.focus();
      }
    }
  }
  async function pressControl(key) {
    const mods = armedMods();
    disarm();
    await send(mods.length === 0 ? { kind: 'key', key } : { kind: 'key', key, modifiers: mods });
  }
  function flushGhost(asEnter) {
    if (!ghostField) return;
    const value = ghostField.value;
    if (value === '' && !asEnter) return;
    ghostField.value = '';
    const mods = armedMods();
    disarm();
    if (asEnter || (mods.length > 0 && value.length === 1)) {
      void send({ kind: 'key', key: asEnter ? 'Enter' : value, modifiers: mods });
      return;
    }
    void send({ kind: 'type', text: value });
  }
  if (ghostField) {
    ghostField.addEventListener('input', (event) => {
      if (event.isComposing) return;
      const value = ghostField.value;
      if (value === '') return;
      ghostField.value = '';
      const mods = armedMods();
      disarm();
      if (mods.length > 0 && value.length === 1) {
        void send({ kind: 'key', key: value, modifiers: mods });
        return;
      }
      void send({ kind: 'type', text: value });
    });
    ghostField.addEventListener('compositionend', () => {
      const value = ghostField.value;
      if (value === '') return;
      ghostField.value = '';
      disarm();
      void send({ kind: 'type', text: value });
    });
    ghostField.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        flushGhost(true);
      }
    });
  }
  const deadKeys = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'NumLock', 'ScrollLock', 'Fn', 'FnLock', 'Hyper', 'Super', 'Symbol', 'SymbolLock', 'Process', 'Unidentified'];
  document.addEventListener('keydown', (event) => {
    if (layoutRows()) {
      const target = event.target;
      const inField = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
      if (deadKeys.includes(event.key)) return;
      const mods = [];
      if (event.ctrlKey) mods.push('ctrl');
      if (event.metaKey) mods.push('meta');
      if (event.altKey) mods.push('alt');
      const control = event.key.length > 1 || mods.length > 0;
      if (!control) {
        if (!inField) focusGhost();
        return;
      }
      event.preventDefault();
      const full = [...mods];
      if (event.shiftKey && !full.includes('shift') && (event.key.length > 1 || mods.length > 0)) full.push('shift');
      void send(full.length === 0 ? { kind: 'key', key: event.key } : { kind: 'key', key: event.key, modifiers: full });
    }
  });
  for (const key of Object.keys(modBtns)) {
    const btn = modBtns[key];
    if (btn) btn.addEventListener('click', () => {
      armed[key] = !armed[key];
      btn.classList.toggle('armed', armed[key]);
    });
  }
  if (enterBtn) enterBtn.addEventListener('click', () => void pressControl('Enter'));
  if (backBtn) backBtn.addEventListener('click', () => void pressControl('Backspace'));

  let suppressClick = false;
  if (surface) {
    surface.addEventListener('click', (event) => {
      if (suppressClick) {
        suppressClick = false;
        return;
      }
      if (mode !== 'direct') return;
      const point = pagePoint(event.clientX, event.clientY);
      if (point !== null) {
        ripple(event.clientX, event.clientY);
        void send({ kind: 'click', x: point.x, y: point.y });
      }
      if (surface) {
        const rect = surface.getBoundingClientRect();
        cx = event.clientX - rect.left;
        cy = event.clientY - rect.top;
        cursorInit = true;
        place();
      }
      if (layoutRows()) focusGhost();
    });
    surface.addEventListener('wheel', (event) => {
      event.preventDefault();
      const now = Date.now();
      if (now - lastScroll < 250) return;
      lastScroll = now;
      const amount = Math.max(100, Math.min(1000, Math.abs(Math.round(event.deltaY))));
      void send({ kind: 'scroll', direction: event.deltaY > 0 ? 'down' : 'up', amount });
    }, { passive: false });
  }
  const stage = document.getElementById('stage');
  function ripple(clientX, clientY) {
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const dot = document.createElement('div');
    dot.className = 'ripple';
    dot.style.left = clientX - rect.left + 'px';
    dot.style.top = clientY - rect.top + 'px';
    stage.appendChild(dot);
    setTimeout(() => dot.remove(), 380);
  }
  if (stage) {
    let startX = 0;
    let startY = 0;
    let startCx = 0;
    let startCy = 0;
    let startT = 0;
    let moved = 0;
    let tracking = false;
    let downType = '';
    stage.addEventListener('pointerdown', (event) => {
      tracking = true;
      downType = event.pointerType;
      startX = event.clientX;
      startY = event.clientY;
      startCx = cx;
      startCy = cy;
      startT = Date.now();
      moved = 0;
      if (mode === 'trackpad') {
        try {
          stage.setPointerCapture(event.pointerId);
        } catch {
          void 0;
        }
      }
    });
    stage.addEventListener('pointermove', (event) => {
      if (!tracking) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      moved = Math.max(moved, Math.abs(dx) + Math.abs(dy));
      if (mode !== 'trackpad') return;
      cx = startCx + dx;
      cy = startCy + dy;
      place();
    });
    stage.addEventListener('pointerup', (event) => {
      if (!tracking) return;
      tracking = false;
      const held = Date.now() - startT;
      const still = moved < 12;
      if (mode === 'trackpad') {
        if (still && held < 400) {
          const point = cursorPoint();
          if (point !== null) {
            ripple(startX, startY);
            void send({ kind: 'click', x: point.x, y: point.y });
          }
        } else if (still && held >= 500) {
          const point = cursorPoint();
          if (point !== null) {
            ripple(startX, startY);
            void send({ kind: 'click', x: point.x, y: point.y, button: 'right' });
          }
        }
        return;
      }
      if (still && held >= 500) {
        const point = pagePoint(event.clientX, event.clientY);
        if (point !== null) {
          suppressClick = true;
          ripple(event.clientX, event.clientY);
          void send({ kind: 'click', x: point.x, y: point.y, button: 'right' });
        }
        return;
      }
      if (!still && moved >= 24 && downType !== 'mouse') {
        const dy = startY - event.clientY;
        const amount = Math.max(100, Math.min(1500, Math.round(Math.abs(dy) * 2)));
        void send({ kind: 'scroll', direction: dy > 0 ? 'down' : 'up', amount });
      }
    });
    stage.addEventListener('pointercancel', () => {
      tracking = false;
    });
  }
  window.addEventListener('resize', place);
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      window.scrollTo(0, 0);
      place();
    });
  }
  paint();
  void loadHandoff();
  void loop();
})();
</script>
</body>
</html>`;
}

function headersOf(request: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(request.headers)) {
    if (Array.isArray(value)) for (const entry of value) headers.append(key, entry);
    else if (value !== undefined) headers.set(key, value);
  }
  return headers;
}

function readBody(request: IncomingMessage, limit = 32_768): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('input too large'));
        return;
      }
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    request.once('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('invalid input'));
      }
    });
    request.once('error', reject);
  });
}

function boundedAmount(value: unknown): number {
  if (typeof value !== 'number' || Number.isNaN(value)) return 600;
  return Math.max(100, Math.min(2000, Math.round(value)));
}

function validCoord(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 10_000;
}

export interface LocalViewerOptions {
  runtimes: BotBrowserRuntimes;
  currentTab: (slug: string) => string | undefined;
  isTakeover: (slug: string) => boolean;
  touch: (slug: string) => void;
  hasAccess: (slug: string) => boolean;
  note: (detail: string) => void;
  takeover: TakeoverService;
  frameWaitMs?: number;
}

export type ViewerFrameResult =
  | {
      status: 200;
      seq: number;
      mode: 'stream' | 'snapshot';
      mimeType: string;
      data: string;
      viewport?: { width: number; height: number };
    }
  | { status: 204 }
  | { status: 400 | 403 | 404; error: string };

export type ViewerInputResult =
  | { status: 200; url: string; title: string }
  | { status: 400 | 403 | 409; error: string };

export interface LocalViewerActions {
  frame(slug: string, after: string | null): Promise<ViewerFrameResult>;
  input(slug: string, body: Record<string, unknown>): Promise<ViewerInputResult>;
  close(): Promise<void>;
}

export function createLocalViewerActions(options: LocalViewerOptions): LocalViewerActions {
  const feeds = createFrameFeeds(
    options.frameWaitMs === undefined ? {} : { waitMs: options.frameWaitMs },
  );
  const refuse = <S extends 400 | 403 | 404 | 409>(status: S, error: string) => ({
    status,
    error,
  });
  return {
    async frame(slug, afterText) {
      if (slug === '') return refuse(400, 'slug is required');
      if (!options.hasAccess(slug)) return refuse(403, 'Browser Access is off for this PersonaBot');
      const runtime = options.runtimes.for(slug);
      if (!runtime.isRunning()) return refuse(404, 'browser not running');
      const tabId = options.currentTab(slug);
      if (tabId === undefined) return refuse(404, 'no browser tab');
      const after =
        afterText !== null && /^\d{1,15}$/u.test(afterText) ? Number(afterText) : undefined;
      const next = await feeds.next(slug, tabId, runtime, after);
      if (next === undefined) {
        if (after !== undefined && runtime.isRunning()) return { status: 204 };
        return refuse(404, 'frame unavailable');
      }
      return {
        status: 200,
        seq: next.seq,
        mode: next.mode,
        mimeType: next.frame.mimeType,
        data: next.frame.data,
        ...(next.frame.viewport === undefined ? {} : { viewport: next.frame.viewport }),
      };
    },

    async input(slug, body) {
      if (slug === '') return refuse(400, 'slug is required');
      if (!options.hasAccess(slug)) return refuse(403, 'Browser Access is off for this PersonaBot');
      if (!options.isTakeover(slug)) return refuse(409, 'Pause the bot before human input');
      const runtime = options.runtimes.for(slug);
      if (!runtime.isRunning()) return refuse(409, 'browser not running');
      const tabId = options.currentTab(slug);
      if (tabId === undefined) return refuse(409, 'no browser tab');
      const done = (page: { url: string; title: string }, input: string) => {
        options.takeover.recordInput(slug, input);
        return { status: 200 as const, url: page.url, title: page.title };
      };
      const kind = body['kind'];
      try {
        if (kind === 'click') {
          const x = body['x'];
          const y = body['y'];
          if (!validCoord(x) || !validCoord(y)) return refuse(400, 'x and y are required');
          const button = body['button'];
          if (button !== undefined && button !== 'left' && button !== 'right')
            return refuse(400, 'button must be left or right');
          options.touch(slug);
          const page = await runtime.clickAt(tabId, x, y, button === 'right' ? 'right' : 'left');
          options.note(`viewer click slug=${slug} button=${button === 'right' ? 'right' : 'left'}`);
          return done(page, `click x=${x} y=${y}`);
        }
        if (kind === 'scroll') {
          const direction = body['direction'] === 'up' ? 'up' : 'down';
          const amount = boundedAmount(body['amount']);
          options.touch(slug);
          const page = await runtime.scroll(tabId, direction, amount);
          options.note(`viewer scroll slug=${slug} direction=${direction} amount=${amount}`);
          return done(page, `scroll ${direction} ${amount}`);
        }
        if (kind === 'type') {
          const text = body['text'];
          if (typeof text !== 'string' || text === '' || text.length > 4000)
            return refuse(400, 'text must be 1-4000 characters');
          options.touch(slug);
          const page = await runtime.insertText(tabId, text);
          options.note(`viewer type slug=${slug} chars=${text.length}`);
          return done(page, `type chars=${text.length}`);
        }
        if (kind === 'key') {
          const key = body['key'];
          if (typeof key !== 'string' || key === '') return refuse(400, 'key is required');
          options.touch(slug);
          const modifiers = Array.isArray(body['modifiers'])
            ? body['modifiers'].filter(
                (entry): entry is 'alt' | 'ctrl' | 'meta' | 'shift' =>
                  entry === 'alt' || entry === 'ctrl' || entry === 'meta' || entry === 'shift',
              )
            : [];
          const page = await runtime.pressKey(tabId, key, modifiers);
          const modText = modifiers.length === 0 ? '' : `+${modifiers.join('+')}`;
          options.note(`viewer key slug=${slug} key=${key.slice(0, 32)}${modText}`);
          return done(page, `key ${key.slice(0, 32)}${modText}`);
        }
      } catch (error) {
        return refuse(409, error instanceof Error ? error.message.slice(0, 200) : 'input failed');
      }
      return refuse(400, 'unknown input kind');
    },

    close: () => feeds.close(),
  };
}

export function registerLocalViewer(
  options: LocalViewerOptions & {
    host: BrowserViewerHost;
    rejection: (headers: Headers) => number | undefined;
    actions?: LocalViewerActions;
  },
): () => void {
  const owned = options.actions === undefined ? createLocalViewerActions(options) : undefined;
  const actions = options.actions ?? owned!;
  const text = (response: ServerResponse, status: number, body: string): void => {
    response.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(body);
  };
  const release = options.host.register({
    kind: 'prefix',
    path: LOCAL_VIEWER_PREFIX,
    async handler(request, response) {
      const rejection = options.rejection(headersOf(request));
      if (rejection !== undefined) {
        response.writeHead(rejection);
        response.end();
        return;
      }
      const url = new URL(request.url ?? '/', 'http://127.0.0.1');
      if (url.pathname.endsWith('/handoff/accept') || url.pathname.endsWith('/handoff/complete')) {
        if (request.method !== 'POST') return text(response, 405, 'method not allowed');
        let handoffBody: Record<string, unknown>;
        try {
          handoffBody = (await readBody(request)) as Record<string, unknown>;
        } catch {
          return text(response, 400, 'invalid handoff request');
        }
        const token = typeof handoffBody['token'] === 'string' ? handoffBody['token'] : '';
        if (token === '') return text(response, 400, 'token is required');
        const completing = url.pathname.endsWith('/handoff/complete');
        if (completing) {
          const reason = handoffBody['reason'];
          if (reason !== 'done' && reason !== 'failed')
            return text(response, 400, 'reason must be done or failed');
          const finished = options.takeover.complete(token, reason as TakeoverCompletion);
          if (finished === undefined)
            return text(response, 410, 'takeover link expired or already used');
          options.note(`takeover complete slug=${finished.slug} reason=${reason}`);
          response.writeHead(200, {
            'content-type': 'application/json',
            'cache-control': 'no-store',
          });
          response.end(JSON.stringify({ ok: true }));
          return;
        }
        const accepted = options.takeover.accept(token);
        if (accepted === undefined)
          return text(response, 410, 'takeover link expired or already used');
        if (!options.hasAccess(accepted.slug))
          return text(response, 403, 'Browser Access is off for this PersonaBot');
        options.note(`takeover accept slug=${accepted.slug}`);
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(
          JSON.stringify({
            ok: true,
            slug: accepted.slug,
            instructions: accepted.instructions,
            expiresAt: accepted.expiresAt,
          }),
        );
        return;
      }
      if (url.pathname.endsWith('/handoff')) {
        if (request.method !== 'GET') return text(response, 405, 'method not allowed');
        const token = url.searchParams.get('token') ?? '';
        const record = token === '' ? undefined : options.takeover.describe(token);
        if (record === undefined || (record.state !== 'pending' && record.state !== 'accepted'))
          return text(response, 410, 'takeover link expired or already used');
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(
          JSON.stringify({
            ok: true,
            slug: record.slug,
            instructions: record.instructions,
            expiresAt: record.expiresAt,
            state: record.state,
          }),
        );
        return;
      }
      if (url.pathname.endsWith('/input')) {
        if (request.method !== 'POST') return text(response, 405, 'method not allowed');
        let body: Record<string, unknown>;
        try {
          body = (await readBody(request)) as Record<string, unknown>;
        } catch {
          return text(response, 400, 'invalid input');
        }
        const slug =
          typeof body['slug'] === 'string' && body['slug'] !== ''
            ? body['slug']
            : (url.searchParams.get('slug') ?? '');
        const result = await actions.input(slug, body);
        if (result.status !== 200) return text(response, result.status, result.error);
        response.writeHead(200, {
          'content-type': 'application/json',
          'cache-control': 'no-store',
        });
        response.end(JSON.stringify({ ok: true, url: result.url, title: result.title }));
        return;
      }
      if (request.method !== 'GET') return text(response, 405, 'method not allowed');
      const slug = url.searchParams.get('slug') ?? '';
      if (url.pathname.endsWith('/frame')) {
        const result = await actions.frame(slug, url.searchParams.get('after'));
        if (result.status === 204) {
          response.writeHead(204, { 'cache-control': 'no-store' });
          response.end();
          return;
        }
        if (result.status !== 200) return text(response, result.status, result.error);
        const body = Buffer.from(result.data, 'base64');
        response.writeHead(200, {
          'content-type': result.mimeType,
          'content-length': String(body.length),
          'cache-control': 'no-store',
          'x-frame-seq': String(result.seq),
          'x-frame-mode': result.mode,
          ...(result.viewport === undefined
            ? {}
            : {
                'x-viewport-width': String(result.viewport.width),
                'x-viewport-height': String(result.viewport.height),
              }),
        });
        response.end(body);
        return;
      }
      if (slug === '') return text(response, 400, 'slug is required');
      if (!options.hasAccess(slug))
        return text(response, 403, 'Browser Access is off for this PersonaBot');
      const page = viewerPage(viewerLocaleOf(request.headers));
      response.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': String(Buffer.byteLength(page)),
        'cache-control': 'no-store',
      });
      response.end(page);
    },
  });
  return () => {
    release();
    void owned?.close();
  };
}
