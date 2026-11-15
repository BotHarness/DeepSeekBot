import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { rpc } from './verify-app.mjs';

const instancePath = process.env.BH_E2E_INSTANCE;
assert.ok(instancePath, 'Set BH_E2E_INSTANCE to a fresh isolated Host instance.json');
const instance = JSON.parse(readFileSync(instancePath, 'utf8'));
assert.equal(
  (await rpc(instance, 'botharness/list')).bots.length,
  0,
  'Use a fresh Profile: an existing Tob would hide the regression',
);
const measurements = [];
async function measure(method) {
  const started = performance.now();
  await rpc(instance, `botharness/${method}`);
  const ms = Math.round(performance.now() - started);
  measurements.push({ method, ms });
  return ms;
}
const onboarding = measure('onboarding');
try {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const settings = await Promise.all(
    ['approvalTemplates', 'promptPresets', 'voiceProviders'].map(measure),
  );
  assert.ok(
    settings.every((ms) => ms < 500),
    'Lightweight settings reads must finish within 500ms during first-Tob preparation',
  );
} finally {
  await onboarding;
  const result = JSON.stringify({ budgetMs: 500, measurements }, null, 2);
  if (process.env.BH_E2E_RESULT) writeFileSync(process.env.BH_E2E_RESULT, result + '\n');
  console.log(result);
}
