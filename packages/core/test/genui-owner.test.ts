import { describe, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { inboxFixture } from './inbox-fixture.js';
import { comparisonReport } from './fixtures/genui-report.js';
import { initialGenuiView } from '../src/channels/genui.js';
import {
  genuiDocumentIdentity,
  initialGenuiDocumentState,
  type GenuiDocument,
} from '../src/channels/genui-document.js';
import { randomUUID } from 'node:crypto';
import { attachOperationalModule } from '../src/database/owner.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';

const htmlDocument: GenuiDocument = {
  version: 2,
  snapshotId: 'html-snapshot-1',
  observedAt: '2026-11-08T00:00:00Z',
  title: 'Synthetic local HTML',
  html: '<!doctype html><h1>Synthetic</h1><p>Local exploration</p>',
  stateContract: {
    version: 1,
    fields: {
      selection: { type: 'choice', initial: 'alpha', options: ['alpha', 'beta'] },
      expanded: { type: 'boolean', initial: false },
    },
  },
};

describe('GenUI through canonical message ownership', () => {
  it('persists HTML private state across clients with CAS, reset, access and purge fences', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.core.channels.appendMessage(fixture.dm.id, {
        id: 'html-document',
        at: '2026-01-01T00:00:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'Synthetic HTML summary.',
        genui: htmlDocument,
      });
      const initial = initialGenuiDocumentState(htmlDocument);
      expect(() =>
        fixture.core.channels.saveGenuiView?.(
          fixture.dm.id,
          'html-document',
          htmlDocument.snapshotId,
          0,
          undefined,
        ),
      ).toThrow('explicit');
      expect(fixture.core.channels.genuiView?.(fixture.dm.id, 'html-document')).toEqual({
        version: 0,
        state: initial,
      });
      const state = { version: 1, values: { selection: 'beta', expanded: true } };
      expect(
        fixture.core.channels.saveGenuiView?.(
          fixture.dm.id,
          'html-document',
          htmlDocument.snapshotId,
          0,
          state,
        ),
      ).toEqual({ version: 1, state });
      const second = createSqliteChannelStore({
        rootDir: fixture.core.channels.rootDir,
        database: attachOperationalModule(fixture.core.operationalDatabase, 'html-second-client'),
      });
      expect(second.genuiView?.(fixture.dm.id, 'html-document')).toEqual({ version: 1, state });
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'html-document', htmlDocument.snapshotId, 0, initial),
      ).toThrow('changed');
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'html-document', 'forged', 1, initial),
      ).toThrow('unavailable');
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'html-document', htmlDocument.snapshotId, 1, {
          version: 1,
          values: { selection: 'unknown', expanded: true },
        }),
      ).toThrow();
      expect(
        second.saveGenuiView?.(fixture.dm.id, 'html-document', htmlDocument.snapshotId, 1, initial),
      ).toEqual({ version: 2, state: initial });
      const database = attachOperationalModule(
        fixture.core.operationalDatabase,
        'html-access-purge',
      );
      const record = fixture.core.channels.get(fixture.dm.id)!;
      database.transaction((db) =>
        db
          .prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?')
          .run(JSON.stringify({ ...record, deletedAt: new Date().toISOString() }), fixture.dm.id),
      );
      expect(() => second.genuiView?.(fixture.dm.id, 'html-document')).toThrow('unavailable');
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'html-document', htmlDocument.snapshotId, 2, state),
      ).toThrow('unavailable');
      database.transaction((db) =>
        db
          .prepare('UPDATE channel_records SET record_json = ? WHERE channel_id = ?')
          .run(JSON.stringify(record), fixture.dm.id),
      );
      expect(fixture.core.channels.message(fixture.dm.id, 'html-document')?.genui).toEqual(
        htmlDocument,
      );
      const scope = { before: '2026-02-01T00:00:00.000Z', channelIds: [fixture.dm.id] };
      const preview = fixture.core.contentPurge.textPreview(scope);
      expect(fixture.core.contentPurge.textConfirm(scope, preview.token)).toMatchObject({
        messages: 1,
      });
      expect(() => second.genuiView?.(fixture.dm.id, 'html-document')).toThrow('unavailable');
      expect(() =>
        second.saveGenuiView?.(fixture.dm.id, 'html-document', htmlDocument.snapshotId, 2, state),
      ).toThrow('unavailable');
      expect(
        database.read((db) =>
          db.prepare('SELECT COUNT(*) AS count FROM genui_private_views').get(),
        ),
      ).toMatchObject({ count: 0 });
    } finally {
      await fixture.close();
    }
  });
  it('binds HTML follow-ups to canonical document hash and validated untrusted state, with safe retries', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.core.channels.appendMessage(fixture.dm.id, {
        id: 'html-document',
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: 'Synthetic HTML summary.',
        genui: htmlDocument,
      });
      const methods = createBridgeMethods({ ...fixture.core });
      const payload = {
        channelId: fixture.dm.id,
        messageId: `human-${randomUUID()}`,
        body: 'Explain this selection',
        genuiReply: {
          version: 2,
          messageId: 'html-document',
          snapshotId: htmlDocument.snapshotId,
          intent: 'continue',
          state: initialGenuiDocumentState(htmlDocument),
        },
      };
      const sent = await methods.channelSend(payload);
      expect(sent).toMatchObject({
        ok: true,
        value: {
          message: {
            author: { kind: 'human' },
            replyTo: 'html-document',
            genuiReply: payload.genuiReply,
          },
        },
      });
      if (!sent.ok) throw new Error(sent.error.message);
      expect(sent.value.message.body).toContain('Untrusted GenUI document context');
      expect(sent.value.message.body).toContain(genuiDocumentIdentity(htmlDocument));
      expect(sent.value.message.body).toContain('"state":{"version":1,"values":');
      expect(sent.value.message.body).not.toContain(htmlDocument.html);
      expect(await methods.channelSend(payload)).toMatchObject({
        ok: true,
        value: { message: { id: payload.messageId } },
      });
      expect(
        await methods.channelSend({
          ...payload,
          genuiReply: {
            ...payload.genuiReply,
            state: { version: 1, values: { selection: 'beta', expanded: false } },
          },
        }),
      ).toMatchObject({ ok: false });
      for (const update of [
        { snapshotId: 'forged' },
        { messageId: 'missing' },
        { documentHash: 'forged' },
        { state: { version: 1, values: { selection: 'unknown', expanded: false } } },
        {
          state: { version: 1, values: { selection: 'alpha', expanded: false, fabricated: true } },
        },
      ])
        expect(
          await methods.channelSend({
            ...payload,
            messageId: `human-${randomUUID()}`,
            genuiReply: { ...payload.genuiReply, ...update },
          }),
        ).toMatchObject({ ok: false });
      expect(
        await methods.channelSend({
          channelId: fixture.dm.id,
          messageId: payload.messageId,
          body: sent.value.message.body,
          replyTo: sent.value.message.replyTo,
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
  it('publishes HTML through the real Bot Tool, rejecting snapshot collisions and preserving linked refreshes', async () => {
    const fixture = await inboxFixture();
    try {
      await fixture.send('Publish synthetic HTML', async (run) => {
        const tool = createBotMessageTool(() => run);
        const context = {
          callId: ToolCallId('html-first'),
          signal: new AbortController().signal,
        } satisfies Partial<ToolRunContext>;
        const larger = { ...htmlDocument, html: `<p>${'x'.repeat(70_000)}</p>` };
        expect(
          await tool.execute(
            {
              channel_id: fixture.dm.id,
              body: 'Synthetic HTML summary.',
              genui_json: JSON.stringify(larger),
            },
            context as ToolRunContext,
          ),
        ).toContain('committed');
        const previous = fixture.core.channels
          .readMessages(fixture.dm.id)
          .find((message) => message.genui?.version === 2);
        if (previous === undefined) throw new Error('HTML missing');
        await expect(
          tool.execute(
            {
              channel_id: fixture.dm.id,
              body: 'Collision',
              genui_json: JSON.stringify(htmlDocument),
            },
            { ...context, callId: ToolCallId('html-collision') } as ToolRunContext,
          ),
        ).rejects.toThrow();
        const refreshed = {
          ...htmlDocument,
          snapshotId: 'html-snapshot-2',
          predecessorMessageId: previous.id,
        };
        expect(
          await tool.execute(
            {
              channel_id: fixture.dm.id,
              body: 'Refreshed HTML summary.',
              genui_json: JSON.stringify(refreshed),
            },
            { ...context, callId: ToolCallId('html-refresh') } as ToolRunContext,
          ),
        ).toContain('committed');
        expect(fixture.core.channels.message(fixture.dm.id, previous.id)?.genui).toEqual(larger);
        expect(
          fixture.core.channels
            .readMessages(fixture.dm.id)
            .filter((message) => message.genui?.version === 2),
        ).toHaveLength(2);
      });
    } finally {
      await fixture.close();
    }
  });
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
