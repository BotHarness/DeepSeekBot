import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import {
  createHumanAttentionDecisions,
  createHumanAttentionQuery,
} from '../src/runtime/human-attention.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

function fixture() {
  const home = createTempRoot('human-attention-status-');
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const database = attachOperationalModule(owner, 'human-attention-status');
  let clock = Date.parse('2026-11-01T00:00:00.000Z');
  const now = () => new Date(clock);
  const active = { questions: [] as string[], approvals: [] as string[] };
  const channels = createSqliteChannelStore({ database, rootDir: join(home, 'channels'), now });
  const query = createHumanAttentionQuery(
    database,
    () => active.questions,
    () => active.approvals,
    undefined,
    undefined,
    now,
  );
  const decisions = createHumanAttentionDecisions(database, now);
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  return {
    database,
    channels,
    query,
    decisions,
    dm,
    active,
    advance: () => {
      clock += 7200000;
    },
  };
}

describe('Human attention status parity', () => {
  it('keeps unread counts separate from action state for a large ordinary history', () => {
    const current = fixture();
    current.database.transaction((database) => {
      const event = database.prepare(`INSERT INTO source_events
        (source_event_id, source_kind, bot_slug, channel_id, message_id, body, created_at, payload_json)
        VALUES (?, 'bot-message', 'ada', ?, ?, ?, ?, ?)`);
      const placement = database.prepare(`INSERT INTO channel_placements
        (channel_id, revision, source_event_id, message_id) VALUES (?, ?, ?, ?)`);
      for (let index = 1; index <= 2000; index++) {
        const id = `status-history-${index}`;
        event.run(
          id,
          current.dm.id,
          id,
          id,
          '2026-11-01T00:00:00.000Z',
          JSON.stringify({ author: { kind: 'bot', slug: 'ada' } }),
        );
        placement.run(current.dm.id, index, id, id);
      }
    });
    expect(current.query.status(true)).toEqual({
      unreadCount: 2000,
      hasAction: false,
      messageCounts: { replies: 0, other: 2000 },
    });
  });

  it.each(['grant', 'question', 'approval'] as const)(
    'keeps %s action visibility, dismissals and snoozes identical to the list',
    async (kind) => {
      const current = fixture();
      const fields: Partial<ChannelMessage> =
        kind === 'grant'
          ? { grantRequest: true }
          : kind === 'question'
            ? {
                userQuestionRequest: {
                  sessionId: 'status-session',
                  questions: [{ id: 'choice', question: 'Choose?' }],
                },
              }
            : {
                toolApprovalRequest: {
                  sessionId: 'status-session',
                  callId: 'status-call',
                  toolName: 'bash',
                  role: 'orchestrator',
                  cwd: '/tmp/status',
                  input: '{}',
                },
              };
      current.active.questions.push('status-card');
      current.active.approvals.push('status-card');
      await current.channels.appendMessage(current.dm.id, {
        id: 'status-card',
        at: '2026-11-01T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Needs attention',
        ...fields,
      });
      const verify = (hasAction: boolean) => {
        expect(current.query.list({ category: 'action', limit: 1 }).items.length > 0).toBe(
          hasAction,
        );
        expect(current.query.status().hasAction).toBe(hasAction);
      };
      verify(true);
      const item = current.query.list({ category: 'action' }).items[0]!;
      expect(current.decisions.dismiss(item)).toBe(true);
      verify(false);
      expect(current.decisions.restore(item)).toBe(true);
      verify(true);
      expect(current.decisions.snooze(item, '2026-11-01T01:00:00.000Z')).toBe(true);
      verify(false);
      current.advance();
      verify(true);
      if (kind !== 'grant') {
        current.active.questions.length = 0;
        current.active.approvals.length = 0;
        verify(false);
      }
    },
  );
});
