#!/usr/bin/env node
// Release-build chat performance capture on the shared Android phone lane.
// Usage and measurement rules: apps/mobile/scripts/android-chat-perf.md.
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const APP = 'ai.botharness.deepseekbot.dev';
const LATEST = /content-desc="(返回最新消息|Jump to latest)"/;
const SCENARIOS = ['warm-fling', 'cold-paging', 'back-to-latest', 'own-send'];

function parse(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let i = 0; i < rest.length; i++) {
    const key = rest[i];
    if (!key.startsWith('--')) throw new Error(`Unexpected argument ${key}`);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) options[key.slice(2)] = true;
    else {
      options[key.slice(2)] = next;
      i++;
    }
  }
  return { command, options };
}

function required(options, ...keys) {
  for (const key of keys) if (options[key] === undefined) throw new Error(`Missing --${key}`);
}

function phone(options) {
  required(options, 'owner', 'batch', 'queue');
  const queue = resolve(options.queue);
  const file = join(queue, 'active.json');
  if (!existsSync(file)) throw new Error('No active Android QA lease');
  const active = JSON.parse(readFileSync(file, 'utf8'));
  if (active.owner !== options.owner || active.batch !== options.batch || active.lane !== 'phone')
    throw new Error('Owner, batch and phone lane must match the active lease');
  const config = JSON.parse(readFileSync(join(queue, 'config.json'), 'utf8'));
  const adb = join(config.sdk, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
  const serial = active.serial;
  const run = (args, timeout = 15000) =>
    execFileSync(adb, ['-s', serial, ...args], {
      encoding: 'utf8',
      timeout,
      windowsHide: true,
      maxBuffer: 16e6,
    });
  const bytes = (args) =>
    execFileSync(adb, ['-s', serial, ...args], {
      timeout: 15000,
      windowsHide: true,
      maxBuffer: 16e6,
    });
  const shell = (...args) => run(['shell', ...args]);
  const xml = () => {
    shell('uiautomator', 'dump', '/sdcard/bh-chat-perf.xml');
    return run(['exec-out', 'cat', '/sdcard/bh-chat-perf.xml']);
  };
  const tap = (tree, pattern) => {
    const node = [...tree.matchAll(/<node\b[^>]*>/g)].map((m) => m[0]).find((n) => pattern.test(n));
    const b = /bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/.exec(node ?? '');
    if (!b) throw new Error(`Control missing: ${pattern}`);
    shell('input', 'tap', String((+b[1] + +b[3]) >> 1), String((+b[2] + +b[4]) >> 1));
  };
  const uptime = () => Number(shell('cat', '/proc/uptime').split(' ')[0]);
  const trace = (remote) =>
    spawn(adb, ['-s', serial, 'shell', 'perfetto', '--txt', '-c', '-', '-o', remote], {
      windowsHide: true,
      stdio: ['pipe', 'ignore', 'pipe'],
    });
  return { run, bytes, shell, xml, tap, uptime, trace };
}

const wait = (ms) => new Promise((done) => setTimeout(done, ms));
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

function state(d) {
  const setting = (ns, key) => d.shell('settings', 'get', ns, key).trim();
  const display = d.shell('dumpsys', 'display');
  return {
    at: new Date().toISOString(),
    pid: d.shell('pidof', APP).trim(),
    animation: [
      'window_animation_scale',
      'transition_animation_scale',
      'animator_duration_scale',
    ].map((key) => setting('global', key)),
    fontScale: setting('system', 'font_scale'),
    renderFrameRate: /renderFrameRate[ =]([\d.]+)/.exec(display)?.[1] ?? null,
    battery: /level: (\d+)/.exec(d.shell('dumpsys', 'battery'))?.[1] ?? null,
    thermalStatus: /Thermal Status: (\d+)/.exec(d.shell('dumpsys', 'thermalservice'))?.[1] ?? null,
    debuggable: d
      .shell('dumpsys', 'package', APP)
      .split('\n')
      .some((line) => /pkgFlags=.*DEBUGGABLE/.test(line)),
  };
}

async function openConversation(d, title) {
  let tree = d.xml();
  if (!tree.includes('resource-id="composer-input"')) {
    d.tap(tree, new RegExp(`(text|content-desc)="${title}`));
    await wait(2500);
    tree = d.xml();
  }
  if (!tree.includes(title) || !tree.includes('resource-id="composer-input"'))
    throw new Error('Conversation not open');
}

async function launch(d, title) {
  d.shell('am', 'force-stop', APP);
  d.shell('am', 'start', '-W', '-n', `${APP}/.MainActivity`);
  await wait(3000);
  await openConversation(d, title);
}

async function prepare(options) {
  required(options, 'apk', 'receipt', 'conversation', 'out');
  const d = phone(options);
  const receipt = JSON.parse(readFileSync(options.receipt, 'utf8'));
  if (sha256(options.apk) !== receipt.apkSha256)
    throw new Error('APK hash differs from its receipt');
  if (!d.run(['install', '-r', options.apk], 120000).includes('Success'))
    throw new Error('Install failed');
  await launch(d, options.conversation);
  const device = state(d);
  if (device.debuggable) throw new Error('A debuggable build is not a Release sample');
  mkdirSync(options.out, { recursive: true });
  const prepared = { ...receipt, conversation: options.conversation, device };
  writeFileSync(join(options.out, 'prepared.json'), JSON.stringify(prepared, null, 2));
  console.log(JSON.stringify({ prepared: options.out, sha: receipt.sha }));
}

const swipe = (d, older, ms = 650) =>
  d.shell(
    'input',
    'swipe',
    '600',
    older ? '700' : '2100',
    '600',
    older ? '2100' : '700',
    String(ms),
  );

async function setup(d, options) {
  const { scenario } = options;
  if (scenario === 'cold-paging') {
    await launch(d, options.conversation);
    await wait(1500);
  }
  if (scenario === 'warm-fling') {
    for (let i = 0; i < 16; i++) swipe(d, i < 8);
    await wait(1200);
    const tree = d.xml();
    if (LATEST.test(tree)) {
      d.tap(tree, LATEST);
      await wait(1200);
    }
  }
  if (scenario === 'back-to-latest') {
    for (let i = 0; i < 10; i++) swipe(d, true, 220);
    await wait(1500);
    if (!LATEST.test(d.xml())) throw new Error('Jump to latest is not offered');
  }
  if (scenario === 'own-send') {
    required(options, 'marker');
    d.tap(d.xml(), /resource-id="composer-input"/);
    await wait(800);
    d.shell('input', 'text', options.marker);
    await wait(800);
  }
}

async function gestures(d, scenario) {
  const actions = [];
  const act = async (name, fn, pause = 0) => {
    const at = d.uptime();
    fn();
    actions.push({ name, at, end: d.uptime() });
    if (pause) await wait(pause);
  };
  if (scenario === 'warm-fling')
    for (let i = 0; i < 16; i++) await act(i < 8 ? 'older' : 'newer', () => swipe(d, i < 8));
  if (scenario === 'cold-paging')
    for (let i = 0; i < 14; i++) await act('older', () => swipe(d, true, 220), 250);
  if (scenario === 'back-to-latest') await act('latest', () => d.tap(d.xml(), LATEST), 2000);
  if (scenario === 'own-send')
    await act('send', () => d.tap(d.xml(), /resource-id="composer-send"/), 2500);
  return actions;
}

async function capture(options) {
  required(options, 'scenario', 'label', 'config', 'out', 'conversation');
  if (!SCENARIOS.includes(options.scenario))
    throw new Error(`Scenario must be one of ${SCENARIOS.join(', ')}`);
  const d = phone(options);
  const out = join(options.out, options.label);
  mkdirSync(out, { recursive: true });
  await setup(d, options);
  const before = state(d);
  if (before.debuggable) throw new Error('A debuggable build is not a Release sample');
  writeFileSync(join(out, 'device-before.json'), JSON.stringify(before, null, 2));
  writeFileSync(join(out, 'memory-before.txt'), d.shell('dumpsys', 'meminfo', APP));
  const remote = `/data/misc/perfetto-traces/bh-chat-perf-${options.label}.perfetto-trace`;
  const trace = d.trace(remote);
  let log = '';
  trace.stderr.on('data', (chunk) => (log += chunk));
  const traced = new Promise((done) => trace.once('exit', done));
  trace.stdin.end(readFileSync(options.config));
  await wait(2000);
  if (trace.exitCode !== null) throw new Error(`Trace stopped before the scenario: ${log}`);
  const start = d.uptime();
  const actions = await gestures(d, options.scenario);
  await wait(500);
  const end = d.uptime();
  writeFileSync(join(out, 'memory-after.txt'), d.shell('dumpsys', 'meminfo', APP));
  const code = await traced;
  writeFileSync(join(out, 'perfetto.log'), log);
  if (code !== 0) throw new Error(`Trace exited ${code}`);
  d.run(['pull', remote, join(out, 'trace.perfetto-trace')], 60000);
  const tree = d.xml();
  writeFileSync(join(out, 'after.ui.xml'), tree);
  writeFileSync(join(out, 'after.png'), d.bytes(['exec-out', 'screencap', '-p']));
  const record = {
    scenario: options.scenario,
    label: options.label,
    start,
    end,
    actions,
    pid: before.pid,
  };
  writeFileSync(join(out, 'scenario.json'), JSON.stringify(record, null, 2));
  if (!tree.includes(options.conversation))
    throw new Error('The conversation left the screen; review the sample');
  console.log(JSON.stringify({ out, start, end, actions: actions.length }));
}

function csv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else quoted = !quoted;
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if (c === '\n' && !quoted) {
      row.push(cell.replace(/\r$/, ''));
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const keys = rows.shift() ?? [];
  return rows.map((r) => Object.fromEntries(keys.map((k, i) => [k, r[i]])));
}

function quantile(values, q) {
  const sorted = [...values].sort((a, b) => a - b);
  const i = (sorted.length - 1) * q;
  const low = Math.floor(i);
  return sorted[low] + (sorted[Math.ceil(i)] - sorted[low]) * (i - low);
}

function analyze(options) {
  required(options, 'dir', 'trace-processor');
  const { dir } = options;
  const scenario = JSON.parse(readFileSync(join(dir, 'scenario.json'), 'utf8'));
  const start = Math.round(scenario.start * 1e9);
  const end = Math.round(scenario.end * 1e9);
  const query = (name, sql) => {
    writeFileSync(join(dir, `${name}.sql`), sql);
    const text = execFileSync(
      options['trace-processor'],
      [
        'query',
        '--format',
        'csv',
        '--quiet',
        '-f',
        join(dir, `${name}.sql`),
        join(dir, 'trace.perfetto-trace'),
      ],
      { encoding: 'utf8', windowsHide: true, maxBuffer: 64e6 },
    );
    writeFileSync(join(dir, `${name}.csv`), text);
    return csv(text);
  };
  const bounds = query('bounds', 'SELECT * FROM trace_bounds;')[0];
  if (!bounds || Number(bounds.start_ts) > start || Number(bounds.end_ts) < end)
    throw new Error('The trace does not cover the scenario window');
  const errors = query(
    'errors',
    "SELECT name, value FROM stats WHERE value > 0 AND severity IN ('error', 'data_loss');",
  );
  const rows = query(
    'frames',
    `SELECT a.id, a.ts, a.dur, a.present_type, a.jank_type, a.layer_name,
  sf.present_type AS display_present_type, sf.ts + sf.dur AS presented_ts
FROM actual_frame_timeline_slice a JOIN process p ON a.upid = p.upid
LEFT JOIN actual_frame_timeline_slice sf ON a.display_frame_token > 0
  AND sf.display_frame_token = a.display_frame_token
  AND (sf.surface_frame_token IS NULL OR sf.surface_frame_token = 0)
  AND sf.upid IN (SELECT upid FROM process WHERE name = '/system/bin/surfaceflinger')
WHERE p.pid = ${Number(scenario.pid)} AND a.surface_frame_token <> 0 AND a.ts >= ${start} AND a.ts < ${end}
ORDER BY a.ts;`,
  );
  if (new Set(rows.map((r) => r.id)).size !== rows.length)
    throw new Error('The frame join multiplied frames');
  const presented = [
    ...new Set(
      rows
        .filter(
          (r) => r.present_type !== 'Dropped Frame' && r.display_present_type !== 'Dropped Frame',
        )
        .map((r) => Number(r.presented_ts))
        .filter((t) => Number.isFinite(t) && t >= start && t < end),
    ),
  ].sort((a, b) => a - b);
  const intervals = presented.slice(1).map((t, i) => (t - presented[i]) / 1e6);
  const pss = (file) =>
    Number(/TOTAL PSS:\s*(\d+)/.exec(readFileSync(join(dir, file), 'utf8'))?.[1]);
  const summary = {
    scenario: scenario.scenario,
    label: scenario.label,
    durationSeconds: (end - start) / 1e9,
    appFrames: rows.length,
    presentedFrames: presented.length,
    intervalMs:
      intervals.length === 0
        ? null
        : {
            p50: quantile(intervals, 0.5),
            p95: quantile(intervals, 0.95),
            p99: quantile(intervals, 0.99),
            max: Math.max(...intervals),
          },
    intervalsOver8ms: intervals.filter((v) => v > 8.4).length,
    intervalsOver16ms: intervals.filter((v) => v > 16.8).length,
    appDeadlineMissed: rows.filter((r) => (r.jank_type ?? '').includes('App Deadline Missed'))
      .length,
    droppedFrames: rows.filter((r) => r.present_type === 'Dropped Frame').length,
    layers: [...new Set(rows.map((r) => r.layer_name))],
    pssBeforeKiB: pss('memory-before.txt'),
    pssAfterKiB: pss('memory-after.txt'),
    traceErrors: errors,
  };
  writeFileSync(join(dir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary));
}

const { command, options } = parse(process.argv.slice(2));
if (command === 'prepare') await prepare(options);
else if (command === 'capture') await capture(options);
else if (command === 'analyze') analyze(options);
else
  throw new Error(
    'Usage: android-chat-perf.mjs prepare|capture|analyze (see android-chat-perf.md)',
  );
