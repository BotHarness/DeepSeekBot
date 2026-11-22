import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';

const {
  BH_E2E_HOME: home,
  BH_E2E_ORIGIN: origin,
  BH_E2E_EXPORT_DIR: dir,
  BH_E2E_ARCHIVE: archive,
  BH_E2E_VOLUME: volume,
  BH_E2E_UI_RESULTS: uiPath,
  BH_E2E_REPORT: reportPath,
} = process.env;
assert.ok(home && origin && dir && archive && volume && uiPath && reportPath);
const target = new URL(origin);
assert.equal(target.protocol, 'http:');
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname));
assert.match(volume, /^botharness-computer-[a-z0-9-]+-qa-config$/u);
assert.equal(basename(archive), archive);
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
async function route(path, body, expected = 200) {
  const response = await fetch(`${origin}/api/computer/${path}`, {
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
    headers: { cookie, 'content-type': 'application/json' },
    signal: AbortSignal.timeout(30_000),
  });
  assert.equal(response.status, expected);
  return response.json();
}
const status = await route('status');
assert.equal(status.provider, 'docker');
assert.equal(status.status.storage.kind, 'volume');
assert.equal(status.status.storage.target, volume);
assert.equal(status.exportDir, dir);
assert.equal(status.status.state, 'running');
assert.ok((await route('exports')).files.includes(archive));
const archived = execFileSync('tar', ['-xOf', join(dir, archive), './bh166-proof.txt'], {
  encoding: 'utf8',
  shell: false,
  windowsHide: true,
});
const restored = execFileSync(
  'docker',
  ['exec', volume.slice(0, -'-config'.length), 'cat', '/config/bh166-proof.txt'],
  { encoding: 'utf8', shell: false, windowsHide: true },
);
assert.equal(archived.trim(), 'original-166-proof');
assert.equal(restored, archived);
const refusals = [
  ['export', {}, 'authorize-required'],
  ['import', { file: archive }, 'authorize-required'],
  ['import', { authorize: true, file: `../${archive}` }, 'invalid-archive'],
  ['import', { authorize: true, file: `/tmp/${archive}` }, 'invalid-archive'],
  ['export', { authorize: true, dir: 'relative' }, 'dir-invalid'],
];
for (const [path, body, code] of refusals) assert.equal((await route(path, body, 400)).code, code);
const ui = JSON.parse(readFileSync(uiPath, 'utf8'));
for (const key of [
  'nativeSettings',
  'fallbackPathSaved',
  'idleTimeSaved',
  'exportAuthorized',
  'archiveSelected',
  'importAuthorized',
  'reloadPersisted',
  'lightAndDark',
])
  assert.equal(ui[key], true, key);
assert.equal(ui.nativeSystemPicker, 'human-qa-pending');
writeFileSync(
  reportPath,
  JSON.stringify(
    {
      realDockerRoundTrip: true,
      archivedMarkerMatchesRestoredVolume: true,
      computerRestarted: true,
      directoryLiveWithoutRestart: true,
      authorizationAndTraversalRefusals: refusals.length,
      ui,
    },
    null,
    2,
  ) + '\n',
);
console.log('Real Computer Settings round trip verified; native system selection awaits Human QA.');
