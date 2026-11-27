import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { expect, it, vi } from 'vitest';
import type { EngineToolContext } from '../src/engines/engine-host.js';
import { createDshBotAgentAdapter } from '../src/agent-adapter.js';
import { type DshBotAgentAdapterOptions } from '../src/runtime/dsh-bot-agent-adapter.js';
import { deferred } from './deferred.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { reportRun } from './support/dsh-bot-agent-adapter.js';

function setup(options: Partial<DshBotAgentAdapterOptions> = {}) {
  return createDshBotAgentAdapter({
    agents: new FakeAgentHost(),
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    engines: {
      engineFor: () => 'codex',
      isLive: () => false,
      release: async () => undefined,
      runTurn: async () => undefined,
    },
    ...options,
  });
}

it('keeps built-in engine tools when the tool contribution throws synchronously', async () => {
  const adapter = setup({
    engineTools: () => {
      throw new Error('contribution unavailable');
    },
  });
  try {
    expect((await adapter.engineToolCatalog(BOT.slug)).map(({ name }) => name)).toContain(
      'bot_send_message',
    );
  } finally {
    await adapter.close();
  }
});

it('finishes a stopped engine turn even when the tool lookup is still pending', async () => {
  const lookup = deferred<[]>();
  const adapter = setup({ engineTools: () => lookup.promise });
  const finished = vi.fn();
  const running = adapter
    .runOrchestrator({
      ...reportRun,
      acceptNativeInput: () => {
        adapter.stopOrchestratorTurn?.(BOT.slug);
        return true;
      },
    })
    .then(finished);
  try {
    await vi.waitFor(() => expect(finished).toHaveBeenCalledOnce(), { timeout: 300 });
  } finally {
    lookup.resolve([]);
    await running;
    await adapter.close();
  }
});

it('refuses an overlapping reply to the same Source Event and leaves later updates available', async () => {
  const gateEntered = deferred<void>();
  const allow = deferred<void>();
  const send = vi.fn(reportRun.channels.send);
  const priorReplies = new Set<string>();
  const adapter = setup({
    engineToolGate: async () => {
      gateEntered.resolve();
      await allow.promise;
      return undefined;
    },
    engines: {
      engineFor: () => 'codex',
      isLive: () => false,
      release: async () => undefined,
      runTurn: async (request) => {
        const context: EngineToolContext = {
          session: Session.create(SessionId(request.sessionId)),
          priorReplies,
          ask: async () => 'allowed-once',
        };
        const reply = (body: string) =>
          request.execute(
            'bot_send_message',
            { source_event_id: 'source-1', body },
            request.signal,
            context,
          );
        const first = reply('I received the task.');
        await gateEntered.promise;
        const duplicate = reply('I received the task.');
        allow.resolve();
        const outcomes = await Promise.allSettled([first, duplicate]);
        expect(outcomes[0]?.status).toBe('fulfilled');
        expect(outcomes[1]).toMatchObject({
          status: 'rejected',
          reason: { message: 'refused: a reply to this Source Event was already sent' },
        });
        await reply('The task is complete.');
      },
    },
  });
  try {
    await adapter.runOrchestrator({
      ...reportRun,
      replyDestination: () => ({
        kind: 'channel',
        channelId: 'dm-test',
        messageId: 'message-1',
      }),
      channels: {
        ...reportRun.channels,
        list: () => ({
          channels: [
            {
              id: 'dm-test',
              type: 'dm',
              kind: 'human-dm',
              name: 'Ada',
              members: [],
              humanMembers: [],
            },
          ],
        }),
        send,
      },
    });
    expect(send.mock.calls.map(([input]) => input.body)).toEqual([
      'I received the task.',
      'The task is complete.',
    ]);
  } finally {
    allow.resolve();
    await adapter.close();
  }
});
