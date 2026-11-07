import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { inboxFixture } from './inbox-fixture.js';
import { comparisonReport } from './fixtures/genui-report.js';
import { initialGenuiView } from '../src/channels/genui.js';
import { randomUUID } from 'node:crypto';
import { attachOperationalModule } from '../src/database/owner.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

describe('GenUI through canonical message ownership', () => {
  it('removes private views through actual Content Purge without deleting placements', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.core.channels.appendMessage(fixture.dm.id, {
        id: 'purge-report',
        at: '2026-01-01T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Synthetic report to purge.',
        genui: comparisonReport,
      });
      fixture.core.channels.saveGenuiView?.(
        fixture.dm.id,
        'purge-report',
        comparisonReport.snapshotId,
        0,
        { ...initialGenuiView(), selectedIds: ['alpha'] },
      );
      const scope = { before: '2026-02-01T00:00:00.000Z', channelIds: [fixture.dm.id] };
      const preview = fixture.core.contentPurge.textPreview(scope);
      expect(preview.messages).toBe(1);
      expect(fixture.core.contentPurge.textConfirm(scope, preview.token)).toMatchObject({
        messages: 1,
      });
      const database = attachOperationalModule(
        fixture.core.operationalDatabase,
        'genui-real-purge',
      );
      expect(
        database.read((db) =>
          db.prepare('SELECT COUNT(*) AS count FROM genui_private_views').get(),
        ),
      ).toMatchObject({ count: 0 });
      expect(
        database.read((db) =>
          db
            .prepare(
              'SELECT COUNT(*) AS count FROM channel_placements WHERE channel_id = ? AND message_id = ?',
            )
            .get(fixture.dm.id, 'purge-report'),
        ),
      ).toMatchObject({ count: 1 });
      expect(() => fixture.core.channels.genuiView?.(fixture.dm.id, 'purge-report')).toThrow(
        'unavailable',
      );
    } finally {
      await fixture.close();
    }
  });
  it('persists a private draft, fences stale writes and keeps it out of the message', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.core.channels.appendMessage(fixture.dm.id, {
        id: 'report-1',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Synthetic options compared.',
        genui: comparisonReport,
      });
      const first = fixture.core.channels.genuiView?.(fixture.dm.id, 'report-1');
      expect(first).toEqual({ version: 0, state: initialGenuiView() });
      const state = { ...initialGenuiView(), selectedIds: ['alpha'], filter: 'Al' };
      expect(
        fixture.core.channels.saveGenuiView?.(
          fixture.dm.id,
          'report-1',
          comparisonReport.snapshotId,
          0,
          state,
        ),
      ).toEqual({ version: 1, state });
      expect(fixture.core.channels.genuiView?.(fixture.dm.id, 'report-1')).toEqual({
        version: 1,
        state,
      });
      const second = createSqliteChannelStore({
        rootDir: fixture.core.channels.rootDir,
        database: attachOperationalModule(fixture.core.operationalDatabase, 'genui-second-client'),
      });
      expect(second.genuiView?.(fixture.dm.id, 'report-1')).toEqual({ version: 1, state });
      const accessDatabase = attachOperationalModule(
        fixture.core.operationalDatabase,
        'genui-access-test',
      );
      const record = fixture.core.channels.get(fixture.dm.id)!;
      accessDatabase.transaction((db) =>
        db
          .prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?')
          .run(JSON.stringify({ ...record, deletedAt: new Date().toISOString() }), fixture.dm.id),
      );
      expect(() => second.genuiView?.(fixture.dm.id, 'report-1')).toThrow('unavailable');
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'report-1', comparisonReport.snapshotId, 1, state),
      ).toThrow('unavailable');
      accessDatabase.transaction((db) =>
        db
          .prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?')
          .run(JSON.stringify(record), fixture.dm.id),
      );
      expect(() =>
        fixture.core.channels.saveGenuiView?.(
          fixture.dm.id,
          'report-1',
          comparisonReport.snapshotId,
          0,
          initialGenuiView(),
        ),
      ).toThrow('changed');
      expect(fixture.core.channels.message(fixture.dm.id, 'report-1')).not.toHaveProperty(
        'selectedIds',
      );
      const database = attachOperationalModule(
        fixture.core.operationalDatabase,
        'genui-purge-test',
      );
      database.transaction((db) =>
        db
          .prepare('DELETE FROM channel_placements WHERE channel_id = ? AND message_id = ?')
          .run(fixture.dm.id, 'report-1'),
      );
      expect(() => second.genuiView?.(fixture.dm.id, 'report-1')).toThrow('unavailable');
      expect(
        database.read((db) =>
          db.prepare('SELECT COUNT(*) AS count FROM genui_private_views').get(),
        ),
      ).toMatchObject({ count: 0 });
    } finally {
      await fixture.close();
    }
  });
  it('submits one ordinary Human request with canonical snapshot context and rejects changed reuse', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.core.channels.appendMessage(fixture.dm.id, {
        id: 'report-1',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Synthetic options compared.',
        genui: comparisonReport,
      });
      const methods = createBridgeMethods({ ...fixture.core });
      const payload = {
        channelId: fixture.dm.id,
        body: 'Compare my selection',
        messageId: `human-${randomUUID()}`,
        genuiReply: {
          messageId: 'report-1',
          snapshotId: comparisonReport.snapshotId,
          selectedIds: ['alpha'],
          intent: 'continue',
        },
      };
      const sent = await methods.channelSend(payload);
      expect(sent).toMatchObject({
        ok: true,
        value: { message: { author: { kind: 'human' }, genuiReply: payload.genuiReply } },
      });
      if (!sent.ok) throw new Error(sent.error.message);
      expect(sent.value.message.body).toContain('Alpha');
      expect(sent.value.message.replyTo).toBe('report-1');
      expect(await methods.channelSend(payload)).toMatchObject({
        ok: true,
        value: { message: { id: payload.messageId } },
      });
      expect(
        await methods.channelSend({
          channelId: payload.channelId,
          messageId: payload.messageId,
          body: sent.value.message.body,
          replyTo: sent.value.message.replyTo,
        }),
      ).toMatchObject({ ok: false });
      expect(
        await methods.channelSend({
          ...payload,
          genuiReply: { ...payload.genuiReply, selectedIds: ['beta'] },
        }),
      ).toMatchObject({ ok: false });
      expect(
        await methods.channelSend({
          ...payload,
          messageId: `human-${randomUUID()}`,
          genuiReply: { ...payload.genuiReply, selectedIds: ['fabricated'] },
        }),
      ).toMatchObject({ ok: false });
      expect(
        fixture.core.channels
          .readMessages(fixture.dm.id)
          .filter((message) => message.id === payload.messageId),
      ).toHaveLength(1);
    } finally {
      await fixture.close();
    }
  });
  it('publishes a complete report through the actual Bot Tool and appends a linked refresh', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.send('Compare these synthetic options', async (run) => {
        const tool = createBotMessageTool(() => run);
        const context = {
          callId: ToolCallId('genui-first'),
          signal: new AbortController().signal,
        } satisfies Partial<ToolRunContext>;
        const first = await tool.execute(
          {
            channel_id: fixture.dm.id,
            body: 'Synthetic options compared.',
            genui_json: JSON.stringify(comparisonReport),
          },
          context as ToolRunContext,
        );
        expect(first).toContain('committed');
        const previous = fixture.core.channels
          .readMessages(fixture.dm.id)
          .find((message) => message.genui !== undefined);
        expect(previous?.genui).toEqual(comparisonReport);
        if (previous === undefined) throw new Error('Report missing');
        const refreshed = {
          ...comparisonReport,
          snapshotId: 'synthetic-comparison-2',
          predecessorMessageId: previous.id,
        };
        await tool.execute(
          {
            channel_id: fixture.dm.id,
            body: 'Refreshed synthetic options.',
            genui_json: JSON.stringify(refreshed),
          },
          { ...context, callId: ToolCallId('genui-refresh') } as ToolRunContext,
        );
        expect(fixture.core.channels.message(fixture.dm.id, previous.id)?.genui).toEqual(
          comparisonReport,
        );
        expect(
          fixture.core.channels
            .readMessages(fixture.dm.id)
            .filter((message) => message.genui !== undefined),
        ).toHaveLength(2);
        const count = fixture.core.channels.readMessages(fixture.dm.id).length;
        await expect(
          tool.execute(
            {
              channel_id: fixture.dm.id,
              body: 'Invalid report',
              genui_json: JSON.stringify({ ...comparisonReport, version: 999 }),
            },
            { ...context, callId: ToolCallId('genui-invalid') } as ToolRunContext,
          ),
        ).rejects.toThrow();
        expect(fixture.core.channels.readMessages(fixture.dm.id)).toHaveLength(count);
      });
    } finally {
      await fixture.close();
    }
  });
});
