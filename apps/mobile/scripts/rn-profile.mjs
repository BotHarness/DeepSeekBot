import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, all) => {
    if (cur.startsWith('--'))
      acc.push([cur.slice(2), all[i + 1]?.startsWith('--') ? true : (all[i + 1] ?? true)]);
    return acc;
  }, []),
);
const metro = Number(args.metro ?? 8081);
const out = resolve(args.out ?? `rn-profile-${Date.now()}`);
const maxSeconds = Number(args.max ?? 120);
const quietSeconds = Number(args.quiet ?? 4);
const top = Number(args.top ?? 25);
mkdirSync(out, { recursive: true });

const targets = await (await fetch(`http://127.0.0.1:${metro}/json/list`)).json();
const target = targets.find((t) => t.reactNative?.capabilities?.nativePageReloads) ?? targets[0];
if (!target) throw new Error(`no inspector target on Metro :${metro} (is the app open?)`);
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const fromRepo = (name, prefix) => {
  try {
    return createRequire(join(repo, 'noop.js'))(name);
  } catch {
    const pnpm = join(repo, 'node_modules/.pnpm');
    const dir = readdirSync(pnpm)
      .filter((d) => d.startsWith(prefix))
      .sort()
      .pop();
    return createRequire(join(pnpm, dir, 'node_modules', name, 'noop.js'))(name);
  }
};
const WebSocket = fromRepo('ws', 'ws@8');
const ws = new WebSocket(target.webSocketDebuggerUrl.replace('//localhost:', '//127.0.0.1:'), {
  origin: `http://127.0.0.1:${metro}`,
});
await new Promise((ok, fail) => (ws.on('open', ok), ws.on('error', fail)));
let nextId = 1;
const pending = new Map();
ws.on('message', (data) => {
  const msg = JSON.parse(String(data));
  if (msg.id && pending.has(msg.id)) {
    const { ok, fail } = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) fail(new Error(`${msg.error.message}`));
    else ok(msg.result);
  }
});
let closing = false;
ws.on('close', (code) => {
  if (closing) return;
  for (const { fail } of pending.values()) fail(new Error(`inspector socket closed (${code})`));
  pending.clear();
  console.error(`inspector socket closed (${code}); the app reloaded, crashed or Metro restarted`);
  process.exit(2);
});
const send = (method, params = {}) =>
  new Promise((ok, fail) => {
    const id = nextId++;
    pending.set(id, { ok, fail });
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 500));
  return r.result.value;
};

const install = `(() => {
  const g = globalThis;
  const hook = g.__REACT_DEVTOOLS_GLOBAL_HOOK__;
  if (!hook) return 'no __REACT_DEVTOOLS_GLOBAL_HOOK__';
  const nameOf = (f) => {
    const t = f.type;
    if (!t) return undefined;
    if (f.tag === 14) return t.displayName || (t.type && (t.type.displayName || t.type.name));
    if (f.tag === 11) return t.displayName || (t.render && (t.render.displayName || t.render.name));
    return t.displayName || t.name;
  };
  const COMPONENT = new Set([0, 1, 11, 14, 15]);
  if (!g.__agentPerf) {
    g.__agentPerf = { on: false };
    const prev = hook.onCommitFiberRoot;
    hook.onCommitFiberRoot = function (rendererID, root) {
      const p = g.__agentPerf;
      if (p.on) {
        const now = performance.now();
        p.commits.push(now);
        p.commitMs += root.current.actualDuration || 0;
        const stack = [root.current];
        let rendered = 0;
        while (stack.length) {
          const f = stack.pop();
          if (COMPONENT.has(f.tag)) {
            const mount = f.alternate === null;
            if (mount || (f.flags & 1) === 1) {
              const n = nameOf(f) || 'Anonymous';
              const e = (p.renders[n] ||= { renders: 0, mounts: 0, selfMs: 0 });
              mount ? e.mounts++ : e.renders++;
              e.selfMs += f.selfBaseDuration || 0;
              rendered++;
            }
          }
          if (f.child && !(f.alternate && f.alternate.child === f.child)) stack.push(f.child);
          if (f.sibling && f !== root.current) stack.push(f.sibling);
        }
        p.renderedPerCommit.push(rendered);
      }
      return prev && prev.apply(this, arguments);
    };
  }
  const p = g.__agentPerf;
  Object.assign(p, { on: true, start: performance.now(), commits: [], commitMs: 0, renders: {}, renderedPerCommit: [], frames: [] });
  const tick = (t) => { if (!p.on) return; p.frames.push(t); requestAnimationFrame(tick); };
  requestAnimationFrame(tick);
  return 'ok';
})()`;

const collect = `(() => {
  const p = globalThis.__agentPerf; p.on = false;
  return JSON.stringify({ start: p.start, end: performance.now(), commits: p.commits, commitMs: p.commitMs,
    renders: p.renders, renderedPerCommit: p.renderedPerCommit, frames: p.frames });
})()`;

await send('Runtime.enable');
await send('Profiler.enable').catch(() => {});
await send('Profiler.setSamplingInterval', { interval: 1000 }).catch(() => {});
const installed = await evaluate(install);
if (installed !== 'ok') throw new Error(installed);
await send('Profiler.start');
const t0 = Date.now();
let child;
if (typeof args.run === 'string') child = spawn('sh', ['-c', args.run], { stdio: 'inherit' });

let lastCount = 0;
let lastChange = Date.now();
for (;;) {
  await new Promise((r) => setTimeout(r, 500));
  const n = await Promise.race([
    evaluate('globalThis.__agentPerf.commits.length'),
    new Promise((r) => setTimeout(() => r(-1), 5000)),
  ]);
  if (n === -1) lastChange = Date.now();
  if (n !== lastCount) {
    lastCount = n;
    lastChange = Date.now();
  }
  const elapsed = (Date.now() - t0) / 1000;
  if (elapsed > maxSeconds) break;
  const quiet = Date.now() - lastChange > quietSeconds * 1000;
  if (child ? child.exitCode !== null && quiet : lastCount > 0 && quiet) break;
}
const react = JSON.parse(await evaluate(collect));
const { profile } = await send('Profiler.stop');
closing = true;
ws.close();
child?.kill();
writeFileSync(join(out, 'profile.cpuprofile'), JSON.stringify(profile));
writeFileSync(join(out, 'react.json'), JSON.stringify(react));

const c = react.commits;
const windowMs = c.length > 1 ? c[c.length - 1] - c[0] : 0;
const inWindow = react.frames.filter((t) => c.length && t >= c[0] && t <= c[c.length - 1]);
const edges = windowMs ? [c[0], ...inWindow, c[c.length - 1]] : [];
const gaps = edges
  .slice(1)
  .map((t, i) => t - edges[i])
  .filter((g) => g > 0);
const frameMs = 1000 / 60;
const droppedFrames = gaps.reduce((s, g) => s + Math.max(0, Math.round(g / frameMs) - 1), 0);
const renders = Object.entries(react.renders)
  .map(([name, e]) => ({ name, ...e, selfMs: +e.selfMs.toFixed(1) }))
  .sort((a, b) => b.renders + b.mounts - (a.renders + a.mounts));

const nodes = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const k of n.children ?? []) parent.set(k, n.id);
const self = new Map();
const total = new Map();
let busyUs = 0;
let idleUs = 0;
const IDLE = new Set(['(idle)', '(program)', '(root)', '[root]']);
const isGc = (fn) => fn === '(garbage collector)' || fn.startsWith('[GC ');
let gcUs = 0;
let probeUs = 0;
const key = (n) =>
  `${n.callFrame.functionName || '(anonymous)'}\u0000${n.callFrame.url}\u0000${n.callFrame.lineNumber}\u0000${n.callFrame.columnNumber}`;
profile.samples.forEach((id, i) => {
  const dt = profile.timeDeltas[i + 1] ?? 0;
  const n = nodes.get(id);
  const fn = n.callFrame.functionName;
  if (isGc(fn)) gcUs += dt;
  if (IDLE.has(fn)) {
    idleUs += dt;
    return;
  }
  busyUs += dt;
  for (let cur = id; cur !== undefined; cur = parent.get(cur))
    if (nodes.get(cur).callFrame.url === '' && nodes.get(cur).callFrame.functionName !== '') {
      probeUs += dt;
      break;
    }
  self.set(key(n), (self.get(key(n)) ?? 0) + dt);
  const seen = new Set();
  for (let cur = id; cur !== undefined; cur = parent.get(cur)) {
    const k = key(nodes.get(cur));
    if (seen.has(k)) continue;
    seen.add(k);
    total.set(k, (total.get(k) ?? 0) + dt);
  }
});

let consumer;
try {
  const bundleUrl = profile.nodes.map((n) => n.callFrame.url).find((u) => u?.includes('.bundle'));
  const SourceMap = fromRepo('source-map', 'source-map@0.6');
  const map = await (await fetch(bundleUrl.replace('.bundle', '.map'))).json();
  consumer = new SourceMap.SourceMapConsumer(map);
} catch (error) {
  console.error(`source map unavailable (${error.message}); printing bundle positions`);
}
const where = (k) => {
  const [, url, line, col] = k.split('\u0000');
  if (!consumer || !url.includes('.bundle'))
    return url ? `${url.split('?')[0].split('/').pop()}:${+line + 1}` : '';
  const pos = consumer.originalPositionFor({ line: +line + 1, column: +col });
  return pos.source
    ? `${pos.source.replace(/^.*node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?/, '~/').replace(/^.*\/apps\/mobile\//, '')}:${pos.line}`
    : '?';
};
const rank = (m) =>
  [...m.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, top)
    .map(([k, us]) => ({
      fn: k.split('\u0000')[0],
      at: where(k),
      ms: +(us / 1000).toFixed(1),
      pct: +((100 * us) / busyUs).toFixed(1),
    }));

const summary = {
  target: target.title,
  recordedSeconds: +((Date.now() - t0) / 1000).toFixed(1),
  react: {
    commits: c.length,
    streamWindowSeconds: +(windowMs / 1000).toFixed(2),
    commitsPerSecond: windowMs ? +((c.length - 1) / (windowMs / 1000)).toFixed(1) : 0,
    commitRenderMsTotal: +react.commitMs.toFixed(1),
    componentsRenderedPerCommit: c.length
      ? +(react.renderedPerCommit.reduce((a, b) => a + b, 0) / c.length).toFixed(1)
      : 0,
    topComponents: renders.slice(0, top),
    components: Object.fromEntries(renders.map((r) => [r.name, [r.renders, r.mounts]])),
  },
  frames: {
    jsFps: windowMs ? +(inWindow.length / (windowMs / 1000)).toFixed(1) : 0,
    droppedFrames,
    droppedPct: gaps.length
      ? +((100 * droppedFrames) / (droppedFrames + gaps.length)).toFixed(1)
      : 0,
    longestFrameMs: gaps.length ? +Math.max(...gaps).toFixed(1) : 0,
    framesOver50ms: gaps.filter((g) => g > 50).length,
  },
  cpu: {
    busyMs: +(busyUs / 1000).toFixed(0),
    idleMs: +(idleUs / 1000).toFixed(0),
    gcMs: +(gcUs / 1000).toFixed(0),
    instrumentationMs: +(probeUs / 1000).toFixed(0),
    selfTop: rank(self),
    totalTop: rank(total),
  },
  files: { cpuprofile: join(out, 'profile.cpuprofile') },
};
writeFileSync(join(out, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
process.exit(0);
