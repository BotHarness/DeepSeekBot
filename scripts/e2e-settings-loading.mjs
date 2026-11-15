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
const origin = performance.now();
async function measure(method) {
  const started = performance.now();
  try {
    await rpc(instance, `botharness/${method}`);
  } finally {
    const ended = performance.now();
    measurements.push({
      method,
      ms: Math.round(ended - started),
      startedMs: started - origin,
      endedMs: ended - origin,
    });
  }
}
const onboarding = measure('onboarding').then(
  () => ({ ok: true }),
  (error) => ({ ok: false, error }),
);
try {
  await new Promise((resolve) => setTimeout(resolve, 50));
  const results = await Promise.allSettled(
    ['approvalTemplates', 'promptPresets', 'voiceProviders'].map(measure),
  );
  const failure = results.find((result) => result.status === 'rejected');
  if (failure) throw failure.reason;
} finally {
  const settled = await onboarding;
  const result = JSON.stringify({ budgetMs: 500, measurements }, null, 2);
  if (process.env.BH_E2E_RESULT) writeFileSync(process.env.BH_E2E_RESULT, result + '\n');
  console.log(result);
  if (!settled.ok) throw settled.error;
}
const preparation = measurements.find((row) => row.method === 'onboarding');
const settings = measurements.filter((row) => row.method !== 'onboarding');
assert.ok(
  preparation &&
    settings.length === 3 &&
    settings.every(
      (row) => row.startedMs < preparation.endedMs && row.endedMs > preparation.startedMs,
    ),
  'Inconclusive sample: all settings reads must overlap first-Tob preparation',
);
assert.ok(
  settings.every((row) => row.ms < 500),
  'Lightweight settings reads must finish within 500ms during first-Tob preparation',
);
