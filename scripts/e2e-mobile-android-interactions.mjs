import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const serial = flag('--serial');
const owner = flag('--owner');
const batch = flag('--batch');
const mode = flag('--mode');
const title = flag('--title');
const label = flag('--label');
for (const key of ['--serial', '--owner', '--batch', '--mode', '--title', '--label'])
  assert(args.includes(key) && flag(key) && !flag(key).startsWith('--'), `Missing ${key}`);
assert(
  ['profile', 'settings', 'keyboard', 'form-keyboard'].includes(mode) && /^[a-z0-9-]+$/.test(label),
  'Invalid mode/label',
);
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const qa = join(dirname(common), '.humanlayer/device-qa/windows');
const lease = JSON.parse(readFileSync(join(qa, 'active.json'), 'utf8'));
assert(
  lease.serial === serial &&
    lease.owner === owner &&
    lease.batch === batch &&
    resolve(lease.worktree) === root,
  'ANDROID_QA_LEASE_MISMATCH',
);
const config = JSON.parse(readFileSync(join(qa, 'config.json'), 'utf8'));
const adb = join(config.sdk, 'platform-tools/adb.exe');
const out = join(qa, 'evidence', batch, lease.lane);
mkdirSync(out, { recursive: true });
const prefix = join(out, label);
const call = (...command) =>
  execFileSync(adb, ['-s', serial, ...command], {
    encoding: 'utf8',
    timeout: 35000,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const bounds = (node) => (node?.bounds?.match(/\d+/g) ?? []).map(Number);
const nodes = (xml) =>
  [...xml.matchAll(/<node\b([^>]+)>/g)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]),
    ),
  );
function state() {
  const text = call('shell', 'dumpsys', 'window');
  assert(/mCurrentFocus=.*ai\.botharness\.deepseekbot\.dev\//.test(text), 'QA_APP_NOT_FOREGROUND');
  return text;
}
function dump() {
  state();
  call('shell', 'uiautomator', 'dump', '/sdcard/bh-interactions.xml');
  const xml = call('exec-out', 'cat', '/sdcard/bh-interactions.xml');
  call('shell', 'rm', '/sdcard/bh-interactions.xml');
  assert(
    !xml.replaceAll('deepseekbot://pair?p=…', '').includes('deepseekbot://pair?p='),
    'PAIRING_SCREEN_CAPTURE_REFUSED',
  );
  return xml;
}
const tap = (node) => {
  assert(node, 'CONTROL_MISSING');
  const [l, t, r, b] = bounds(node);
  call('shell', 'input', 'tap', `${Math.round((l + r) / 2)}`, `${Math.round((t + b) / 2)}`);
};
function capture(name) {
  const xml = dump();
  writeFileSync(`${prefix}-${name}.xml`, xml);
  writeFileSync(
    `${prefix}-${name}.png`,
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], {
      timeout: 15000,
      maxBuffer: 16 * 1024 * 1024,
    }),
  );
  return nodes(xml);
}
const imeTop = () =>
  Number(
    state().match(
      /(?:type|mType)=ime\b[^\n]*?(?:frame|mFrame)=\[\d+,(\d+)\]\[\d+,\d+\][^\n]*?(?:visible|mVisible)=true/,
    )?.[1],
  );
const scroll = (list) => {
  const handleBottom = bounds(handle(list))[3] ?? 0;
  return list
    .filter((node) => node.scrollable === 'true' && bounds(node)[1] >= handleBottom)
    .at(-1);
};
const handle = (list) => list.find((node) => node['resource-id'] === 'sheet-screen-handle');
const proof = [];
try {
  if (mode !== 'form-keyboard' && Number.isFinite(imeTop())) {
    call('shell', 'input', 'keyevent', '4');
    await sleep(500);
  }
  const initial = nodes(dump());
  const field = initial.find(
    (node) =>
      node.class === 'android.widget.EditText' && (node['content-desc'] ?? '').includes(title),
  );
  if (mode !== 'settings') {
    assert(field, 'OPEN_DESIGNATED_QA_CHAT_FIRST');
    if (mode !== 'form-keyboard')
      assert(!field.text || field.text === field['content-desc'], 'EMPTY_QA_COMPOSER_REQUIRED');
  }
  if (mode !== 'form-keyboard') assert(!handle(initial), 'CLOSE_EXISTING_SHEET_FIRST');
  const [, , width, height] = bounds(initial[0]);
  if (mode === 'form-keyboard') {
    capture('initial');
    tap(field);
    await sleep(1000);
    const shown = capture('shown');
    const input = shown.find(
      (node) => node.focused === 'true' && node.class === 'android.widget.EditText',
    );
    const top = imeTop();
    assert(Number.isFinite(top) && top < height * 0.8, 'REAL_SOFT_KEYBOARD_REQUIRED');
    assert(input && bounds(input)[1] >= 0 && bounds(input)[3] <= top + 1, 'INPUT_UNDER_KEYBOARD');
    if (args.includes('--action')) {
      const action = shown.find(
        (node) => node.clickable === 'true' && node['content-desc'] === flag('--action'),
      );
      assert(
        action && bounds(action)[1] >= 0 && bounds(action)[3] <= top + 1,
        'FORM_ACTION_UNDER_KEYBOARD',
      );
    }
    proof.push({
      step: 'focused-form-clearance',
      keyboardTop: top,
      inputBounds: bounds(input),
      roundingTolerancePx: 1,
      actionChecked: args.includes('--action'),
    });
  } else if (mode === 'profile' || mode === 'settings') {
    tap(
      initial.find(
        (node) =>
          node.class === 'android.widget.Button' &&
          (mode === 'settings'
            ? node['content-desc'] === title
            : (node['content-desc'] ?? '').startsWith(`${title},`)),
      ),
    );
    await sleep(700);
    const peek = capture('peek');
    assert(handle(peek), 'PROFILE_HANDLE_MISSING');
    const swipe = async (up, distance = 0.5) => {
      call(
        'shell',
        'input',
        'swipe',
        `${Math.round(width / 2)}`,
        `${Math.round(height * (up ? 0.78 : 0.3))}`,
        `${Math.round(width / 2)}`,
        `${Math.round(height * (up ? 0.78 - distance : 0.3 + distance))}`,
        '650',
      );
      await sleep(650);
    };
    await swipe(true);
    capture('expanded');
    await swipe(true);
    const scrolled = capture('scrolled');
    assert(
      !scrolled.some(
        (node) => node.text === title && bounds(node)[1] >= bounds(scroll(scrolled))[1],
      ),
      'PROFILE_MUST_SCROLL_BEYOND_HEADER',
    );
    const top = bounds(scroll(scrolled))[1];
    await swipe(false, 0.16);
    const down = capture('down');
    assert.equal(bounds(scroll(down))[1], top, 'SHEET_MOVED_BEFORE_CONTENT_TOP');
    proof.push({ step: 'scroll-before-sheet', top, after: bounds(scroll(down))[1] });
    const [l, t, r, b] = bounds(handle(down));
    call(
      'shell',
      'input',
      'swipe',
      `${Math.round((l + r) / 2)}`,
      `${Math.round((t + b) / 2)}`,
      `${Math.round(width / 2)}`,
      `${Math.round(height * 0.94)}`,
      '650',
    );
    await sleep(800);
    const closed = capture('closed');
    assert(
      !handle(closed) && closed.some((node) => node.class === 'android.widget.EditText'),
      'HANDLE_DRAG_DID_NOT_CLOSE',
    );
    proof.push({ step: 'handle-drag-close', closed: true });
  } else {
    capture('hidden');
    const remote = '/sdcard/bh-keyboard-motion.mp4';
    const recording = spawn(
      adb,
      ['-s', serial, 'shell', 'screenrecord', '--time-limit', '5', remote],
      { stdio: 'ignore' },
    );
    const finished = new Promise((done, reject) => {
      recording.on('error', reject);
      recording.on('exit', (code) => (code === 0 ? done() : reject(new Error('RECORDING_FAILED'))));
    });
    await sleep(1200);
    tap(field);
    await finished;
    call('pull', remote, `${prefix}.mp4`);
    call('shell', 'rm', remote);
    const shown = capture('shown');
    const focused = shown.find(
      (node) =>
        node.class === 'android.widget.EditText' && (node['content-desc'] ?? '').includes(title),
    );
    const keyboardTop = imeTop();
    assert(bounds(focused)[3] <= keyboardTop, 'COMPOSER_UNDER_KEYBOARD');
    const w = 244;
    const h = Math.round((height * w) / width / 2) * 2;
    const raw = execFileSync(
      'ffmpeg',
      [
        '-loglevel',
        'error',
        '-i',
        `${prefix}.mp4`,
        '-vf',
        `fps=30,scale=${w}:${h}`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgb24',
        'pipe:1',
      ],
      { timeout: 30000, maxBuffer: 100 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const [, , right, bottom] = bounds(field);
    const x = Math.round(((right - 24) * w) / width);
    const y = Math.round(((bottom - 12) * h) / height);
    const rgb = [...raw.subarray((y * w + x) * 3, (y * w + x) * 3 + 3)];
    const positions = [];
    for (let f = 0; f < raw.length / (w * h * 3); f++) {
      let run = 0,
        found = 0;
      for (let row = Math.round(h / 3); row < h - 15; row++) {
        const i = (f * w * h + row * w + x) * 3;
        const match = rgb.every((value, channel) => Math.abs(raw[i + channel] - value) < 7);
        run = match ? run + 1 : 0;
        if (run >= 10) found = row;
      }
      positions.push(found);
    }
    const first = positions[0];
    const last = positions.at(-1);
    const travel = first - last;
    const intermediate = new Set(positions.filter((row) => row > last + 3 && row < first - 3)).size;
    const maxStep = Math.max(...positions.slice(1).map((row, i) => Math.abs(row - positions[i])));
    proof.push({
      step: 'keyboard-motion',
      keyboardTop,
      first,
      last,
      travel,
      intermediate,
      maxStep,
    });
    assert(travel > 100 && intermediate >= 4 && maxStep < travel / 2, 'COMPOSER_JUMPS');
  }
  const result = { result: 'pass', mode, proof };
  writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    result: 'fail',
    mode,
    code: error instanceof Error ? error.message : 'QA_FAILED',
    proof,
  };
  writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
