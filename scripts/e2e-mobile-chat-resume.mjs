import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { setTimeout } from 'node:timers/promises';

// Runs inside an already assigned physical iOS QA window. The caller owns the
// existing driver session and its cleanup; this script never builds or pairs.
const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  assert(index >= 0 && args[index + 1] && !args[index + 1].startsWith('--'), `Missing ${name}`);
  return args[index + 1];
};
const lease = JSON.parse(readFileSync(resolve(option('--lease')), 'utf8'));
assert(lease.active && lease.owner === option('--owner'), 'IOS_QA_LEASE_MISMATCH');
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
    throw new Error(`Driver failed at ${label}; see private evidence`, { cause: error });
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
let backgrounded = false;
try {
  const initial = drive('initial', 'snapshot');
  assert(snapshot(initial).appBundleId === app, 'OPEN_DESIGNATED_DEV_QA_CHAT_FIRST');
  assert(facts(initial).messageVisible && facts(initial).composerVisible, 'INVALID_CHAT_BASELINE');
  if (!closed) drive('focus', 'press', `@${field(initial).ref}`);
  const before = drive('before', 'snapshot');
  assert(facts(before).messageVisible && facts(before).composerVisible, 'INVALID_FOCUSED_BASELINE');
  drive('before-image', 'screenshot', join(out, 'before.private.png'));
  const home = drive('background', 'open', 'com.apple.springboard', '--foreground');
  assert(home.appBundleId === 'com.apple.springboard', 'BACKGROUND_TRIGGER_NOT_PROVEN');
  backgrounded = true;
  await setTimeout(seconds * 1000);
  const after = drive('resume', 'open', app, '--foreground');
  backgrounded = false;
  drive('after-image', 'screenshot', join(out, 'after.private.png'));
  const result = {
    backgroundSeconds: seconds,
    keyboardExpected: !closed,
    before: facts(before),
    after: facts(after),
    draftUnchanged: field(before)?.value === field(after)?.value,
  };
  result.pass =
    result.after.messageVisible && result.after.composerVisible && result.draftUnchanged;
  save('result.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
  assert(result.pass, 'CHAT_RESUME_BLANK_OR_DRAFT_LOST');
} finally {
  // A driver failure after Home still returns the owned app to the foreground.
  // Never relaunch: losing the process would invalidate this regression.
  if (backgrounded) drive('restore-foreground', 'open', app, '--foreground');
}
