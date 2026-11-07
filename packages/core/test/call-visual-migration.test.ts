import { rmSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { isChannelMessage } from '../src/channels/channel.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot } from './helpers.js';

describe('call visual unsaved migration', () => {
  it('strips the removed unsaved marker so old call messages read again', () => {
    const home = createTempRoot('botharness-call-unsaved-migration-');
    const prior = mountOperationalDatabase({
      dshHome: home,
      schemaPlan: defineSchemaPlan(
        BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation < 133),
      ),
    });
    const visual = { source: 'screen', frames: 4, layout: '2x2' };
    const payload = (id: string, extra: Record<string, unknown>) =>
      JSON.stringify({
        id,
        at: '2026-11-04T00:00:00.000Z',
        author: { kind: 'human' },
        voiceCall: { callId: 'call-0123456789abcdef', visual: { ...visual, ...extra } },
      });
    attachOperationalModule(prior, 'messaging').transaction((database) => {
      const insert = database.prepare(
        `INSERT INTO source_events (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
         VALUES (?, 'human-message', 'mira', 'dm-mira', ?, '这是什么', '2026-11-04T00:00:00.000Z', ?)`,
      );
      insert.run('event-unsaved', 'human-1', payload('human-1', { unsaved: true }));
      insert.run('event-unseen', 'human-2', payload('human-2', { unsaved: true, unseen: true }));
      insert.run('event-saved', 'human-3', payload('human-3', {}));
    });
    prior.close();
    expect(
      isChannelMessage({ ...JSON.parse(payload('human-1', { unsaved: true })), body: '这是什么' }),
    ).toBe(false);
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    try {
      const rows = attachOperationalModule(owner, 'messaging').read((database) =>
        database
          .prepare(
            'SELECT source_event_id, body, payload_json FROM source_events ORDER BY source_event_id',
          )
          .all(),
      ) as { source_event_id: string; body: string; payload_json: string }[];
      const messages = rows.map((row): Record<string, unknown> => ({
        ...(JSON.parse(row.payload_json) as Record<string, unknown>),
        body: row.body,
      }));
      expect(messages.map((message) => isChannelMessage(message))).toEqual([true, true, true]);
      expect(rows.map((row) => row.payload_json.includes('unsaved'))).toEqual([
        false,
        false,
        false,
      ]);
      expect(
        messages.map((message) => (message['voiceCall'] as { visual: unknown }).visual),
      ).toEqual([
        { ...visual, layout: '2+2' },
        { ...visual, layout: '2+2' },
        { ...visual, layout: '2+2', unseen: true },
      ]);
    } finally {
      owner.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
