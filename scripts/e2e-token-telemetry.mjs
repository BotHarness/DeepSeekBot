import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { rpc, verifyPaths } from './verify-app.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const value = (name) => args[args.indexOf(name) + 1];
assert.ok(flag('--name') && value('--name'), 'Pass --name for this task-owned verify-app instance');
assert.match(value('--name'), /^[a-z0-9][a-z0-9-]*$/u, 'Use a verify-app instance name');
const paths = verifyPaths(value('--name'), root);
const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
assert.equal(resolve(instance.worktree), root, "Refuse another worktree's Host");
assert.equal(
  new URL(instance.url).hostname,
  '127.0.0.1',
  'Only a local isolated Host is supported',
);
assert.equal(resolve(instance.home), resolve(paths.home), 'Refuse an unrelated Profile');
mkdirSync(paths.evidence, { recursive: true });

const bundle = join(paths.dir, 'token-telemetry-source.mjs');
const imported = [
  ['queryTokenUsageDays', 'usage/telemetry.ts'],
  ['queryModelUsageDays', 'usage/telemetry.ts'],
  ['startTokenUsage, startModelUsage', 'telemetry/token-usage.ts'],
  ['createTelemetryService, fetchTelemetrySender', 'telemetry/service.ts'],
];
await build({
  stdin: {
    contents: imported
      .map(
        ([names, path]) =>
          `export { ${names} } from ${JSON.stringify('./packages/core/src/' + path)};`,
      )
      .join('\n'),
    resolveDir: root,
    loader: 'js',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: bundle,
});
const {
  queryTokenUsageDays,
  queryModelUsageDays,
  startTokenUsage,
  startModelUsage,
  createTelemetryService,
  fetchTelemetrySender,
} = await import(pathToFileURL(bundle).href);
const local = await rpc(instance, 'botharness/overviewUsage', { period: 'week' });
assert.equal(local.freshness, 'ready', 'Finish reconciliation before comparing wire values');
assert.ok(local.totals.totalTokens > 0, 'First obtain a real model reply in this isolated Profile');
const database = new DatabaseSync(join(instance.home, 'botharness', 'botharness.db'), {
  readOnly: true,
});
try {
  const days = queryTokenUsageDays(database, new Date());
  const models = queryModelUsageDays(database, new Date());
  const routes = database
    .prepare('SELECT DISTINCT provider, model FROM usage_daily')
    .all()
    .flatMap((row) => [row.provider, row.model]);
  const batches = [];
  let delivered = 0;
  const sender = flag('--send') ? fetchTelemetrySender() : undefined;
  const telemetry = createTelemetryService({
    decision: { enabled: true },
    dataDir: join(paths.dir, 'wire-install'),
    pluginVersion: '0.0.0-qa.4255',
    dshVersion: instance.dshVersion,
    send: async (batch) => {
      batches.push(batch);
      if (sender) {
        await sender(batch);
        delivered += 1;
      }
    },
  });
  const snapshot = () => ({ days, models, isReconciled: true });
  startTokenUsage({ telemetry, snapshot })();
  startModelUsage({ telemetry, snapshot })();
  await telemetry.close();
  if (sender)
    assert.equal(delivered, batches.length, 'Telemetry transport must acknowledge every QA batch');
  const all = batches.flatMap((batch) => batch.batch);
  const events = all.filter((event) => event.event === 'app:token_usage_report');
  const modelEvents = all.filter((event) => event.event === 'app:model_usage_report');
  assert.equal(events.length, days.length);
  assert.equal(modelEvents.length, models.length);
  assert.ok(modelEvents.length > 0, 'The real reply must produce a per-model snapshot');
  for (const event of events) {
    const perModel = modelEvents.filter(
      (model) => model.properties.day_timestamp === event.properties.day_timestamp,
    );
    assert.equal(
      perModel.reduce((sum, model) => sum + model.properties.reported_total_token_count, 0),
      event.properties.reported_total_token_count,
      'Per-model snapshots must add up to the day snapshot',
    );
  }
  for (const event of modelEvents) {
    assert.match(event.properties.provider_kind, /^[a-z_]+$/);
    assert.match(event.properties.model_id, /^[a-z0-9][a-z0-9._:/-]*$/);
    for (const key of Object.keys(event.properties))
      assert.ok(!/bot_slug|session_id|human_id|content|prompt/.test(key));
  }
  const modelWire = JSON.stringify(modelEvents);
  for (const value of routes)
    if (/^(?:custom|other)(?:-\d+)?$/u.test(value) || /-\d+$/u.test(value))
      assert.ok(!modelWire.includes(`"${value}"`), 'Provider instance IDs stay local');
  for (const event of events) {
    const properties = event.properties;
    const day = new Date(properties.day_timestamp).toISOString().slice(0, 10);
    const expected = local.days.find((row) => row.day === day);
    assert.ok(expected);
    assert.equal(properties.reported_total_token_count, expected.totalTokens ?? 0);
    if (properties.is_partial === false)
      assert.equal(properties.total_token_count, expected.totalTokens);
    assert.equal(properties.is_reconciled, true);
    for (const key of Object.keys(properties))
      assert.ok(!/bot_slug|session_id|human_id|provider|model|content|prompt/.test(key));
  }

  const report = {
    result: 'pass',
    sentToPostHog: Boolean(sender),
    qaVersion: '0.0.0-qa.4255',
    checks: [
      'live Host overview equals production token snapshot wire',
      'owned usage only',
      'no Bot, Session, provider, model, Human or content identifiers in the day snapshot',
      'per-model snapshots add up to the day snapshot and name only provider kind and built-in model',
    ],
    snapshots: all.map((event) => ({
      event: event.event,
      timestamp: event.timestamp,
      properties: event.properties,
    })),
  };
  writeFileSync(
    join(paths.evidence, 'token-telemetry.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  process.stdout.write(JSON.stringify(report, null, 2) + '\n');
} finally {
  database.close();
}
