import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { createBotMessageTool } from '../src/runtime/bot-message-tool.js';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, expect, it } from 'vitest';
import { type BotHarnessCore } from '../src/plugin.js';
import { event, fixture, cleanup } from './messaging-inbound-fixtures.js';

afterEach(cleanup);

it.each([undefined, 'unified-setup-message', 'setup-with-whitespace'])(
  'derives setup receipt from an admitted topic, own reply and authenticated echo; revocation removes completion (%s)',
  async (messageKey) => {
    const fx = await fixture({ receipts: true, secondIdentity: true });
    await fx.enable();
    await fx.receive(event({ text: '[BH-LARK-SETUP] Reply LARK-SETUP-OK' }));
    await fx.idle();
    const sources = fx.query(
      "SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'",
    ) as { source_event_id: string }[];
    const id = sources[0]!.source_event_id;
    expect((await fx.core.externalMessaging.snapshot('ada')).setup).toMatchObject({
      providerReady: true,
      receipts: [{ sourceEventId: id, echoObserved: false, threadId: 'omt-topic' }],
    });
    const setupText =
      messageKey === 'setup-with-whitespace' ? '\tLARK-SETUP-OK\n' : 'LARK-SETUP-OK';
    await fx.core.externalMessaging.reply('ada', id, setupText, messageKey);
    expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]).toMatchObject({
      replyState: 'provider-accepted',
      echoObserved: false,
    });
    await fx.echo('lark-app-reply', 'Wrong text');
    expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]?.echoObserved).toBe(
      false,
    );
    await fx.echo('lark-app-reply', setupText);
    expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts[0]?.echoObserved).toBe(
      true,
    );
    for (let index = 0; index < 31; index++)
      await fx.core.externalMessaging.send(
        'ada',
        fx.grant.id,
        `setup-later-${index}`,
        `later ${index}`,
      );
    const afterLaterSends = await fx.core.externalMessaging.snapshot('ada');
    expect(afterLaterSends.intents.some((intent) => intent.sourceEventId === id)).toBe(false);
    expect(afterLaterSends.setup?.receipts[0]).toMatchObject({
      replyState: 'provider-accepted',
      replyMessageId: 'lark-app-reply',
    });
    fx.setReady(false);
    expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts).toEqual([]);
    fx.setReady(true);
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    expect((await fx.core.externalMessaging.snapshot('ada')).setup?.receipts).toEqual([]);
  },
);

function watchMessagingViews(core: BotHarnessCore) {
  const reader = core.live
    .open(OWNER_HUMAN_CONTEXT, new Request('http://localhost/api/botharness/stream?scope=roster'))
    .body!.getReader();
  const frames: string[] = [];
  const draining = (async () => {
    for (;;) {
      const part = await reader.read();
      if (part.done) return;
      frames.push(new TextDecoder().decode(part.value));
    }
  })();
  return {
    notices: () => frames.filter((frame) => frame.includes('event: roster/changed')).length,
    async close() {
      await reader.cancel();
      await draining;
    },
  };
}

it('invalidates mounted messaging views after identity and Grant commits and after reception settles', async () => {
  const fx = await fixture();
  const views = watchMessagingViews(fx.core);
  const { notices } = views;
  try {
    const initial = notices();
    await fx.enable();
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(initial);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'receiving',
    );
    const identity = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
    const beforePause = notices();
    await fx.core.externalMessaging.identity('ada', {
      kind: 'update',
      id: identity.id,
      expectedRevision: identity.revision,
      name: identity.name,
      enabled: false,
    });
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforePause);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'unavailable',
    );
    const paused = (await fx.core.externalMessaging.snapshot('ada')).identities![0]!;
    const beforeResume = notices();
    await fx.core.externalMessaging.identity('ada', {
      kind: 'update',
      id: paused.id,
      expectedRevision: paused.revision,
      name: paused.name,
      enabled: true,
    });
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforeResume);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
      'receiving',
    );
    const beforeRevoke = notices();
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    await expect.poll(notices, { timeout: 500 }).toBeGreaterThan(beforeRevoke);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]).toMatchObject({
      availability: 'unavailable',
      reception: 'off',
    });
  } finally {
    await views.close();
  }
});

it('invalidates mounted messaging views when revoking a Grant without a reception lease', async () => {
  const fx = await fixture();
  const views = watchMessagingViews(fx.core);
  try {
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe('off');
    const before = views.notices();
    fx.core.externalMessaging.revoke('ada', fx.grant.id);
    await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(before);
    expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.availability).toBe(
      'unavailable',
    );
  } finally {
    await views.close();
  }
});

it.each(['receiving', 'unavailable'] as const)(
  'invalidates connecting views when an asynchronous consumer settles to %s',
  async (reception) => {
    const fx = await fixture();
    let resolve!: (dispose: () => void) => void;
    let reject!: (error: Error) => void;
    const pending = new Promise<() => void>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    fx.publicService.consumeInbound = async () => pending;
    const views = watchMessagingViews(fx.core);
    const enabling = fx.enable();
    try {
      await expect
        .poll(async () => (await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception)
        .toBe('connecting');
      await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(0);
      await tick();
      const beforeSettlement = views.notices();
      if (reception === 'receiving') resolve(() => undefined);
      else reject(new Error('Consumer failed'));
      await enabling;
      await expect.poll(views.notices, { timeout: 500 }).toBeGreaterThan(beforeSettlement);
      expect((await fx.core.externalMessaging.snapshot('ada')).grants[0]?.reception).toBe(
        reception,
      );
    } finally {
      resolve(() => undefined);
      await enabling;
      await views.close();
    }
  },
);

it.each([true, false])(
  'unified external reply concludes only with a receipt (receipts=%s)',
  async (receipts) => {
    let conclusions = 0;
    let result: unknown;
    let sourceId = '';
    const fx = await fixture({
      receipts,
      secondIdentity: receipts,
      onRun: async (run) => {
        sourceId = run.triage!.current()[0]!;
        const tool = createBotMessageTool(() => run);
        result = JSON.parse(
          String(
            await tool.execute(
              {
                source_event_id: sourceId,
                body: 'Completed',
                resolve_inbox_ids: [sourceId],
                end_turn: true,
              },
              {
                callId: ToolCallId('unified-external'),
                signal: new AbortController().signal,
                concludeTurn: () => {
                  conclusions += 1;
                },
              } as ToolRunContext,
            ),
          ),
        );
      },
    });
    await fx.enable();
    await fx.receive();
    await fx.idle();
    expect(fx.replies).toHaveLength(1);
    expect(result).toMatchObject({ status: receipts ? 'committed' : 'provider-accepted' });
    expect(conclusions).toBe(receipts ? 1 : 0);
    expect(
      fx.core.attention.list({ botSlug: 'ada' }).items.find((item) => item.id === sourceId)?.state,
    ).toBe(receipts ? 'handled' : 'open');
  },
);
