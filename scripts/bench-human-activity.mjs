import { build } from 'esbuild';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const root = resolve(process.argv[2] ?? '.');
const explicit = existsSync(join(root, 'packages/core/src/humans/context.ts'));
const stage = mkdtempSync(join(tmpdir(), 'human-activity-bench-'));
const source = (file) => JSON.stringify(join(root, 'packages/core/src', file));
try {
  const result = await build({
    stdin: {
      contents: `
        import { mountOperationalDatabase, attachOperationalModule } from ${source('database/owner.ts')};
        import { BOT_HARNESS_SCHEMA_PLAN } from ${source('database/schema-plan.ts')};
        import { createHumanAttentionQuery } from ${source('runtime/human-attention.ts')};
        ${explicit ? `import { OWNER_HUMAN_CONTEXT } from ${source('humans/context.ts')};` : ''}
        import { performance } from 'node:perf_hooks';
        export function run(home) {
          const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
          try {
            if (owner.mode !== 'ready') throw new Error('Database did not mount');
            const port = attachOperationalModule(owner, 'human-attention');
            port.transaction(db => {
              const channel = db.prepare('INSERT INTO channel_records(channel_id, record_json) VALUES (?, ?)');
              const source = db.prepare("INSERT INTO source_events(source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json) VALUES (?, 'bot-message', ?, ?, ?, ?, ?, ?)");
              const placement = db.prepare('INSERT INTO channel_placements(channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)');
              for (let c = 0; c < 100; c++) {
                const slug = 'bench-' + c, id = 'dm-' + slug;
                channel.run(id, JSON.stringify({ id, type: 'dm', name: slug, botSlug: slug, members: [slug], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' }));
                for (let m = 1; m <= 200; m++) {
                  const messageId = id + '-' + m;
                  const at = new Date(Date.UTC(2026, 0, 1, 0, c, m)).toISOString();
                  source.run(messageId, slug, id, messageId, 'Seeded activity', at, JSON.stringify({ id: messageId, at, author: { kind: 'bot', slug } }));
                  placement.run(id, m, messageId, messageId);
                }
              }
            }, ['channel', 'source-event']);
            const query = createHumanAttentionQuery(port);
            const durations = [];
            for (let i = 0; i < 60; i++) {
              const start = performance.now();
              const page = query.list(${explicit ? 'OWNER_HUMAN_CONTEXT, ' : ''}{ category: 'unread', limit: 30 });
              const duration = performance.now() - start;
              if (page.items.length !== 30) throw new Error('Expected 30 Activity rows');
              if (i >= 10) durations.push(duration);
            }
            durations.sort((a, b) => a - b);
            return { channels: 100, messages: 20000, warmup: 10, samples: durations.length,
              medianMs: durations[25], p95Ms: durations[47], maxMs: durations[49] };
          } finally { owner.close(); }
        }
      `,
      resolveDir: root,
      loader: 'ts',
    },
    nodePaths: [resolve('packages/core/node_modules')],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    packages: 'bundle',
    logLevel: 'silent',
  });
  const { run } = await import(
    `data:text/javascript;base64,${Buffer.from(result.outputFiles[0].contents).toString('base64')}`
  );
  const measurements = run(stage);
  console.log(
    JSON.stringify({
      root: pathToFileURL(root).pathname,
      explicitHumanContext: explicit,
      ...measurements,
    }),
  );
  if (measurements.p95Ms > 250) throw new Error('Activity listing p95 exceeds the 250 ms guard');
} finally {
  rmSync(stage, { recursive: true, force: true });
}
