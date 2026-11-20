import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
assert.ok(home && evidence && process.env.BH_E2E_ORIGIN);
const result = spawnSync(process.execPath, ['scripts/e2e-safe-tool-activity.mjs'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    BH_E2E_SESSIONS: 'true',
    BH_E2E_COMPACT: 'true',
    BH_E2E_SOURCE_ROLE: 'orchestrator',
  },
  shell: false,
  windowsHide: true,
});
assert.equal(result.status, 0, 'Real native Tool / safe Activity UI verifier must pass');
const proof = JSON.parse(readFileSync(resolve(home, 'tool-detail-proof.json'), 'utf8'));
for (const [key, value] of Object.entries(proof))
  assert.equal(value, true, `Host Consumer proof: ${key}`);
writeFileSync(resolve(evidence, 'capability-proof.json'), `${JSON.stringify(proof, null, 2)}\n`);
console.log(JSON.stringify({ capability: 'PASS', assertions: Object.keys(proof) }));
