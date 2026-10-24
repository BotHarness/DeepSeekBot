import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { attachOperationalModule } from '../src/database/owner.js';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { describe, expect, it } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { inboxFixture, type TurnHook } from './inbox-fixture.js';

function receipt(value: unknown) {
  if (typeof value !== 'string') throw new Error('Expected a JSON tool receipt');
  return JSON.parse(value);
}

function tools() {
  return createDshBotAgentAdapter({
    agents: new FakeAgentHost(),
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => '/memory',
  });
}

async function fixture() {
  const f = await inboxFixture();
  let sequence = 0;
  return {
    ...f,
    send: async (body: string, ...turns: TurnHook[]) => {
      sequence += 1;
      await f.core.channels.appendMessage(f.dm.id, {
        id: `human-${sequence}`,
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body,
      });
      return f.send(body, ...turns);
    },
  };
}
describe('explicit local Bot messages', { timeout: 60_000 }, () => {
  it('concludes only after committed delivery and explicit Inbox cleanup', async () => {
    const f = await fixture();
    let conclusions = 0;
    try {
      const source = await f.send('Finish the check', async (run) => {
        expect(run.message).toContain(`Source Event ID: ${run.triage!.current()[0]}`);
        const tool = createBotMessageTool(() => run);
        const context = {
          callId: ToolCallId('final'),
          signal: new AbortController().signal,
          concludeTurn: () => {
            conclusions += 1;
          },
        } as ToolRunContext;
        const args = {
          source_event_id: run.triage!.current()[0],
          body: 'The check passed.',
          resolve_inbox_ids: run.triage!.current(),
          end_turn: true,
        };
        const result = receipt(await tool.execute(args, context));
        expect(result).toMatchObject({
          status: 'committed',
          inboxResolution: { outcome: 'resolved' },
        });
        expect(f.core.channels.readMessages(f.dm.id).some((m) => m.id === result.messageId)).toBe(
          true,
        );
      });
      expect(conclusions).toBe(1);
      expect(f.state(source)).toBe('handled');
    } finally {
      await f.close();
    }
  });

  it('keeps the delivered receipt and continues when Inbox storage refuses cleanup', async () => {
    const f = await fixture();
    const database = attachOperationalModule(f.core.operationalDatabase, 'message-storage-fault');
    let conclusions = 0;
    try {
      const source = await f.send('Finish the check', async (run) => {
        database.transaction((db) =>
          db.exec(
            "CREATE TEMP TRIGGER refuse_message_cleanup BEFORE UPDATE OF resolved_at ON inbox_admissions BEGIN SELECT RAISE(ABORT, 'injected cleanup fault'); END",
          ),
        );
        try {
          const tool = createBotMessageTool(() => run);
          const context = {
            callId: ToolCallId('final'),
            signal: new AbortController().signal,
            concludeTurn: () => {
              conclusions += 1;
            },
          } as ToolRunContext;
          const args = {
            source_event_id: run.triage!.current()[0],
            body: 'The check passed.',
            resolve_inbox_ids: run.triage!.current(),
            end_turn: true,
          };
          const result = receipt(await tool.execute(args, context));
          expect(result).toMatchObject({
            status: 'committed',
            inboxResolution: { outcome: 'failed' },
          });
          expect(
            f.core.channels.readMessages(f.dm.id).filter((m) => m.author.kind === 'bot'),
          ).toHaveLength(1);
          expect(receipt(await tool.execute(args, context))).toEqual(result);
        } finally {
          database.transaction((db) => db.exec('DROP TRIGGER refuse_message_cleanup'));
        }
      });
      expect(conclusions).toBe(0);
      expect(f.state(source)).toBe('open');
    } finally {
      await f.close();
    }
  });

  it('replays the same delivery identity without duplicating a committed message', async () => {
    const f = await fixture();
    const adapter = tools();
    try {
      await f.send('Please report progress', async (run) => {
        const args = { source_event_id: run.triage!.current()[0], body: 'The first check passed.' };
        const first = await adapter.runDirectTool!(
          run,
          'bot_send_message',
          args,
          new AbortController().signal,
        );
        const replay = await adapter.runDirectTool!(
          run,
          'bot_send_message',
          args,
          new AbortController().signal,
        );
        expect(replay).toEqual(first);
        expect(
          f.core.channels.readMessages(f.dm.id).filter((m) => m.author.kind === 'bot'),
        ).toHaveLength(1);
        await expect(
          adapter.runDirectTool!(
            run,
            'bot_send_message',
            { ...args, body: 'A different payload' },
            new AbortController().signal,
          ),
        ).rejects.toThrow(/different content/);
      });
    } finally {
      await adapter.close();
      await f.close();
    }
  });

  it('replies to its trusted source and resolves only that obligation after delivery', async () => {
    const f = await fixture();
    const adapter = tools();
    try {
      const earlier = await f.send('A separate unfinished request');
      const source = await f.send('Please check this result', (run) =>
        adapter.runDirectTool!(
          run,
          'bot_send_message',
          {
            source_event_id: run.triage!.current()[0],
            body: 'Checked: the result is correct.',
            resolve_inbox_ids: [run.triage!.current()[0]],
            end_turn: true,
          },
          new AbortController().signal,
        ),
      );
      expect(f.results[0]).toMatchObject({
        status: 'committed',
        channelId: f.dm.id,
        inboxResolution: { outcome: 'resolved', resolved: [source] },
      });
      expect(f.core.channels.readMessages(f.dm.id)).toContainEqual(
        expect.objectContaining({ body: 'Checked: the result is correct.', replyTo: 'human-2' }),
      );
      expect(f.state(source)).toBe('handled');
      expect(f.state(earlier)).toBe('open');
    } finally {
      await adapter.close();
      await f.close();
    }
  });

  it('sends a question without resolving the task and accepts a later answer', async () => {
    const f = await fixture();
    const adapter = tools();
    try {
      const source = await f.send('Prepare the report', (run) =>
        adapter.runDirectTool!(
          run,
          'bot_send_message',
          {
            source_event_id: run.triage!.current()[0],
            body: 'Should West be included?',
            end_turn: true,
          },
          new AbortController().signal,
        ),
      );
      expect(f.results[0]).toMatchObject({
        status: 'committed',
        inboxResolution: { outcome: 'not-requested' },
      });
      expect(f.state(source)).toBe('open');
      await f.send('Include West', (run) =>
        adapter.runDirectTool!(
          { ...run, sessionId: `${run.sessionId}:answer` },
          'bot_send_message',
          {
            source_event_id: run.triage!.current()[0],
            body: 'The revised report includes West.',
            end_turn: true,
          },
          new AbortController().signal,
        ),
      );
      expect(
        f.core.channels
          .readMessages(f.dm.id)
          .filter((m) => m.author.kind === 'bot')
          .map((m) => m.body),
      ).toEqual(['The revised report includes West.', 'Should West be included?']);
    } finally {
      await adapter.close();
      await f.close();
    }
  });

  it('does not send when the command attempts to resolve an unrelated source', async () => {
    const f = await fixture();
    const adapter = tools();
    try {
      const earlier = await f.send('Keep this task open');
      await f.send('A different task', async (run) => {
        await expect(
          adapter.runDirectTool!(
            run,
            'bot_send_message',
            {
              source_event_id: run.triage!.current()[0],
              body: 'Do not publish',
              resolve_inbox_ids: [earlier],
            },
            new AbortController().signal,
          ),
        ).rejects.toMatchObject({ code: 'invalid-resolution' });
      });
      expect(f.state(earlier)).toBe('open');
      expect(f.core.channels.readMessages(f.dm.id).some((m) => m.body === 'Do not publish')).toBe(
        false,
      );
    } finally {
      await adapter.close();
      await f.close();
    }
  });
});
