import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args[args.indexOf(name) + 1];
const serial = args.includes('--serial') ? flag('--serial') : undefined;
const owner = args.includes('--owner') ? flag('--owner') : undefined;
const batch = args.includes('--batch') ? flag('--batch') : undefined;
const label = args.includes('--label') ? flag('--label') : 'pairing';
if (!serial || !owner || !batch || !/^[a-z0-9-]+$/.test(label)) {
  throw new Error(
    'Use --serial <adb-serial> --owner <task> --batch <batch> [--label <name>] [--paired --instance <private instance.json> --expect-bot <name>]',
  );
}
if (args.includes('--paired') && (!args.includes('--instance') || !args.includes('--expect-bot')))
  throw new Error('PAIRED_REQUIRES_INSTANCE_AND_BOT');
if (args.includes('--instance') && !args.includes('--paired'))
  throw new Error('INSTANCE_REQUIRES_PAIRED');
const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], {
  cwd: root,
  encoding: 'utf8',
}).trim();
const qa = join(dirname(common), '.humanlayer/device-qa/windows');
const lease = JSON.parse(readFileSync(join(qa, 'active.json'), 'utf8'));
if (
  lease.serial !== serial ||
  lease.owner !== owner ||
  lease.batch !== batch ||
  resolve(lease.worktree) !== root
) {
  throw new Error('ANDROID_QA_LEASE_MISMATCH');
}
const config = JSON.parse(readFileSync(join(qa, 'config.json'), 'utf8'));
const adb = join(config.sdk, 'platform-tools/adb.exe');
const out = join(qa, 'evidence', batch, lease.lane);
mkdirSync(out, { recursive: true });
const prefix = join(out, label);
const call = (...command) =>
  execFileSync(adb, ['-s', serial, ...command], { encoding: 'utf8', timeout: 15000 });
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
const proof = [];
const bounds = (value) => (value.match(/\d+/g) ?? []).map(Number);
function nodes(xml) {
  return [...xml.matchAll(/<node\b([^>]+)>/g)].map((match) =>
    Object.fromEntries(
      [...match[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((attr) => [attr[1], attr[2]]),
    ),
  );
}
function windowState() {
  const state = call('shell', 'dumpsys', 'window');
  if (!/mCurrentFocus=.*ai\.botharness\.deepseekbot\.dev\//.test(state))
    throw new Error('QA_APP_NOT_FOREGROUND');
  const ime = state.match(
    /(?:type|mType)=ime\b[^\n]*?(?:frame|mFrame)=\[\d+,(\d+)\]\[\d+,\d+\][^\n]*?(?:visible|mVisible)=true/,
  );
  return ime ? Number(ime[1]) : undefined;
}
function dump() {
  windowState();
  call('shell', 'uiautomator', 'dump', '/sdcard/bh-pair-qa.xml');
  const xml = call('exec-out', 'cat', '/sdcard/bh-pair-qa.xml');
  call('shell', 'rm', '/sdcard/bh-pair-qa.xml');
  return xml;
}
function tap(node) {
  if (!node) throw new Error('PAIR_CONTROL_MISSING');
  const [left, top, right, bottom] = bounds(node.bounds);
  call(
    'shell',
    'input',
    'tap',
    `${Math.round((left + right) / 2)}`,
    `${Math.round((top + bottom) / 2)}`,
  );
}
async function waitFor(read, timeout = 60000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    let value;
    try {
      value = read();
    } catch (error) {
      if (!(error instanceof Error) || error.message !== 'QA_APP_NOT_FOREGROUND') throw error;
    }
    if (value) return value;
    await sleep(300);
  }
  throw new Error('PAIR_UI_TIMEOUT');
}
function capture(suffix, xml) {
  writeFileSync(
    `${prefix}-${suffix}.png`,
    execFileSync(adb, ['-s', serial, 'exec-out', 'screencap', '-p'], { timeout: 15000 }),
  );
  writeFileSync(`${prefix}-${suffix}.xml`, xml);
}
try {
  if (!args.includes('--paired')) {
    const initial = await waitFor(() => {
      const xml = dump();
      return nodes(xml).some((node) => node.class === 'android.widget.EditText') ? xml : undefined;
    });
    tap(nodes(initial).find((node) => node.class === 'android.widget.EditText'));
    const keyboardTop = await waitFor(windowState);
    await sleep(600);
    const xml = dump();
    const field = nodes(xml).find((node) => node.class === 'android.widget.EditText');
    const button = nodes(xml).find(
      (node) =>
        node.class === 'android.widget.Button' &&
        ['配对', 'Pair'].includes(node['content-desc'] || node.text),
    );
    const fieldBottom = field ? bounds(field.bounds)[3] : Infinity;
    const buttonBottom = button ? bounds(button.bounds)[3] : Infinity;
    if (field?.text && field.text !== 'deepseekbot://pair?p=…')
      throw new Error('PAIR_INPUT_MUST_BE_EMPTY');
    capture('keyboard', xml);
    proof.push({ step: 'keyboard', keyboardTop, fieldBottom, buttonBottom });
    if (fieldBottom > keyboardTop || buttonBottom > keyboardTop)
      throw new Error('PAIR_FIELD_OBSCURED');
  } else {
    const instance = JSON.parse(readFileSync(resolve(flag('--instance')), 'utf8'));
    const origin = new URL(instance.url).origin;
    if (new URL(origin).hostname !== '127.0.0.1')
      throw new Error('ISOLATED_LOOPBACK_HOST_REQUIRED');
    const login = await fetch(instance.url, { redirect: 'manual' });
    const cookie = login.headers
      .getSetCookie()
      .map((entry) => entry.split(';')[0])
      .join('; ');
    const request = async (path, body) => {
      const response = await fetch(`${origin}${path}`, {
        headers: { cookie, 'content-type': 'application/json' },
        ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
      });
      if (!response.ok) throw new Error(`PAIR_HOST_HTTP_${response.status}`);
      return response.json();
    };
    const snapshot = await request('/api/botharness/devices');
    const registered = snapshot.devices.filter((device) => device.revokedAt == null);
    if (registered.length !== 1 || !registered[0].lastSeenAt)
      throw new Error('PAIR_REQUIRES_ONE_LIVE_QA_DEVICE');
    const paired = await waitFor(() => {
      const current = dump();
      return current.includes('Android QA Host') &&
        (!args.includes('--expect-bot') || current.includes(flag('--expect-bot'))) &&
        !current.includes('deepseekbot://pair?p=')
        ? current
        : undefined;
    });
    capture('paired', paired);
    proof.push({ step: 'paired', registered: true, visibleHost: true });
    call('shell', 'am', 'force-stop', 'ai.botharness.deepseekbot.dev');
    call('shell', 'monkey', '-p', 'ai.botharness.deepseekbot.dev', '1');
    const restored = await waitFor(() => {
      const current = dump();
      return current.includes('Android QA Host') &&
        (!args.includes('--expect-bot') || current.includes(flag('--expect-bot')))
        ? current
        : undefined;
    });
    capture('restored', restored);
    proof.push({
      step: 'restart',
      visibleHost: true,
      lastSeen: (await request('/api/botharness/devices')).devices.some(
        (device) =>
          device.id === registered[0].id && device.revokedAt == null && Boolean(device.lastSeenAt),
      ),
    });
  }
  const result = { result: 'pass', proof };
  writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} catch (error) {
  const result = {
    result: 'fail',
    code: error instanceof Error ? error.message : 'PAIR_QA_FAILED',
    proof,
  };
  writeFileSync(`${prefix}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  process.exitCode = 1;
}
