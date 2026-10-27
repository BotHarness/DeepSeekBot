import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Missing ${name}`);
  return args[index + 1];
};
const lease = JSON.parse(readFileSync(resolve(option('--lease')), 'utf8'));
assert(lease.active === true && lease.owner === option('--owner'), 'IOS_QA_LEASE_MISMATCH');
for (const key of ['driver', 'stateDir', 'session', 'udid'])
  assert(typeof lease[key] === 'string' && lease[key], `Missing lease ${key}`);
const message = option('--message');
const seconds = Number(option('--seconds'));
assert(Number.isFinite(seconds) && seconds >= 5 && seconds <= 30, 'Use 5–30 background seconds');
const out = resolve(option('--out'));
mkdirSync(out, { recursive: false, mode: 0o700 });
const app = 'ai.botharness.deepseekbot.dev';
const closed = args.includes('--keyboard-closed');
const env = { ...process.env, AGENT_DEVICE_STATE_DIR: lease.stateDir };
const save = (name, value) => writeFileSync(join(out, name), value, { mode: 0o600 });
function drive(label, ...command) {
  let raw;
  try {
    raw = execFileSync(
      process.execPath,
      [
        lease.driver,
        ...command,
        '--session',
        lease.session,
        '--platform',
        'ios',
        '--udid',
        lease.udid,
        '--json',
      ],
      { env, encoding: 'utf8', timeout: 95000, maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    save(`${label}.private.json`, error.stdout || '{}');
    save(`${label}.private.stderr`, error.stderr || '');
    throw new Error(`Driver failed at ${label}; see private evidence`);
  }
  save(`${label}.private.json`, raw);
  const result = JSON.parse(raw);
  assert(result.success, `Driver refused ${label}`);
  return result.data;
}
const snapshot = (data) => data.snapshot ?? data;
const field = (data) => snapshot(data).nodes.find((node) => node.identifier === 'composer-input');
function facts(data) {
  const input = field(data);
  const rect = input?.rect ?? { width: 0, height: 0 };
  return {
    messageVisible: snapshot(data).nodes.some((node) => node.label === message),
    composerVisible: rect.width > 0 && rect.height > 0 && input?.hittable === true,
    composerRect: rect,
  };
}
function processId(label) {
  const path = join(out, `${label}.private.json`);
  try {
    execFileSync(
      'xcrun',
      [
        'devicectl',
        'device',
        'info',
        'processes',
        '--device',
        lease.udid,
        '--json-output',
        path,
        '--quiet',
      ],
      { encoding: 'utf8', timeout: 30000, stdio: ['ignore', 'pipe', 'pipe'] },
    );
  } catch (error) {
    save(`${label}.private.stderr`, error.stderr || '');
    throw new Error(`Process observation failed at ${label}; see private evidence`);
  }
  const processes = JSON.parse(readFileSync(path, 'utf8')).result.runningProcesses;
  const matches = processes.filter((entry) =>
    entry.executable?.endsWith('/DeepSeekBotDev.app/DeepSeekBotDev'),
  );
  assert(matches.length === 1, 'DEV_PROCESS_NOT_UNIQUE');
  return matches[0].processIdentifier;
}
function anchor(data, baseline) {
  const nodes = snapshot(data).nodes;
  if (!baseline)
    return (
      nodes.find((node) => node.label === message && node.identifier) ??
      nodes.find((node) => node.label === message)
    );
  return (
    nodes.find((node) => baseline.identifier && node.identifier === baseline.identifier) ??
    nodes.find(
      (node) =>
        node.label === message &&
        ['width', 'height'].every(
          (key) =>
            Number.isFinite(node.rect?.[key]) && Math.abs(node.rect[key] - baseline.rect[key]) <= 2,
        ),
    )
  );
}

let backgrounded = false;
try {
  const initial = drive('initial', 'snapshot');
  assert(snapshot(initial).appBundleId === app, 'OPEN_DESIGNATED_DEV_QA_CHAT_FIRST');
  assert(facts(initial).messageVisible && facts(initial).composerVisible, 'INVALID_CHAT_BASELINE');
  if (!closed) drive('focus', 'press', `@${field(initial).ref}`);
  await setTimeout(500);
  const before = drive('before', 'snapshot');
  assert(facts(before).messageVisible && facts(before).composerVisible, 'INVALID_FOCUSED_BASELINE');
  drive('before-image', 'screenshot', join(out, 'before.private.png'));
  const beforePid = processId('process-before');
  const beforeAnchor = anchor(before);
  backgrounded = true;
  const home = drive('background', 'open', 'com.apple.springboard', '--foreground');
  assert(home.appBundleId === 'com.apple.springboard', 'BACKGROUND_TRIGGER_NOT_PROVEN');
  await setTimeout(seconds * 1000);
  const after = drive('resume', 'open', app, '--foreground');
  backgrounded = false;
  drive('after-image', 'screenshot', join(out, 'after.private.png'));
  const afterPid = processId('process-after');
  const afterAnchor = anchor(after, beforeAnchor);
  const anchorUnchanged =
    beforeAnchor &&
    afterAnchor &&
    ['x', 'y', 'width', 'height'].every(
      (key) =>
        Number.isFinite(beforeAnchor.rect?.[key]) &&
        Number.isFinite(afterAnchor.rect?.[key]) &&
        Math.abs(beforeAnchor.rect[key] - afterAnchor.rect[key]) <= 2,
    );
  const result = {
    backgroundSeconds: seconds,
    keyboardExpected: !closed,
    before: facts(before),
    after: facts(after),
    draftUnchanged: field(before)?.value === field(after)?.value,
    sameProcess: beforePid === afterPid,
    readingAnchorUnchanged: Boolean(anchorUnchanged),
  };
  result.pass =
    result.after.messageVisible &&
    result.after.composerVisible &&
    result.draftUnchanged &&
    result.sameProcess &&
    result.readingAnchorUnchanged;
  save('result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert(result.pass, 'CHAT_RESUME_BLANK_OR_DRAFT_LOST');
} finally {
  if (backgrounded) drive('restore-foreground', 'open', app, '--foreground');
}
