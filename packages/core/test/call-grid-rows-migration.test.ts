import { expect, it } from 'vitest';
import { isChannelMessage } from '../src/channels/channel.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { createTempRoot } from './helpers.js';

const AT = '2026-11-04T00:00:00.000Z';
const CALL = 'call-0123456789abcdef';
const event =
  'INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';

const sentence = (id: string, visual: object) => ({
  id,
  at: AT,
  author: { kind: 'human' },
  body: '这是什么',
  voiceCall: { callId: CALL, visual },
});
const record = (frames: number, layout: string) => ({
  callId: CALL,
  botSlug: 'mira',
  state: 'frames',
  startedAt: AT,
  source: 'screen',
  frames,
  layout,
  fromMs: 12_000,
  toMs: 40_000,
});
const recordBody = (frames: number, layout: string) =>
  `Screen record of call ${CALL} from 0:12 to 0:40 while the Human was silent: a ${layout} grid of ${frames} keyframes, oldest first.`;

it('rewrites square call grid layouts as balanced rows at generation 133', () => {
  const home = createTempRoot('bh3689-grid-rows-');
  const prior = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 133),
    ),
  });
  const rows: [string, string, object][] = [
    ['s-5', '这是什么', sentence('s-5', { source: 'camera', frames: 5, layout: '3x3' })],
    [
      's-4',
      '这是什么',
      sentence('s-4', { source: 'camera', frames: 4, layout: '2x2', unseen: true }),
    ],
    ['s-16', '这是什么', sentence('s-16', { source: 'screen', frames: 16, layout: '4x4' })],
    ['s-same', '这是什么', sentence('s-same', { source: 'screen', sameAs: 's-5' })],
    [
      'r-8',
      recordBody(8, '3x3'),
      {
        id: 'r-8',
        at: AT,
        author: { kind: 'system' },
        body: '',
        voiceCallRecord: record(8, '3x3'),
      },
    ],
  ];
  attachOperationalModule(prior, 'test').transaction((db) => {
    for (const [id, body, payload] of rows)
      db.prepare(event).run(
        id,
        'human-message',
        'mira',
        'dm-mira',
        id,
        body,
        AT,
        JSON.stringify(payload),
      );
  });
  prior.close();

  const current = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  expect(current.mode).toBe('ready');
  const port = attachOperationalModule(current, 'test');
  const read = port.read((db) =>
    db
      .prepare('SELECT message_id, body, payload_json FROM source_events ORDER BY message_id')
      .all(),
  ) as { message_id: string; body: string; payload_json: string }[];
  const byId = new Map(
    read.map((row) => [row.message_id, { ...JSON.parse(row.payload_json), body: row.body }]),
  );
  expect(byId.get('s-5').voiceCall.visual).toEqual({ source: 'camera', frames: 5, layout: '3+2' });
  expect(byId.get('s-4').voiceCall.visual).toEqual({
    source: 'camera',
    frames: 4,
    layout: '2+2',
    unseen: true,
  });
  expect(byId.get('s-16').voiceCall).toEqual({ callId: CALL });
  expect(byId.get('s-same').voiceCall.visual).toEqual({ source: 'screen', sameAs: 's-5' });
  expect(byId.get('r-8').voiceCallRecord.layout).toBe('3+3+2');
  expect(byId.get('r-8').body).toBe(recordBody(8, '3+3+2'));
  for (const message of byId.values()) expect(isChannelMessage(message)).toBe(true);
  current.close();
});
