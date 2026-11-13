import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

it('reconciles committed Registry identity while open and detached without replay after reactivation', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-lifecycle-') });
  const readers: ReadableStreamDefaultReader<Uint8Array>[] = [];
  const open = (resume?: string) => {
    const reader = core.companions
      .open(
        new Request('http://localhost/api/botharness/companion?subscribe=1', {
          headers: resume ? { 'Last-Event-ID': resume } : {},
        }),
      )
      .body!.getReader();
    readers.push(reader);
    return reader;
  };
  const read = async (reader: ReadableStreamDefaultReader<Uint8Array>) => {
    const text = new TextDecoder().decode((await reader.read()).value);
    return JSON.parse(/data: ([^\n]+)/u.exec(text)![1]!);
  };
  const select = (consumerId: string) =>
    core.companions.update(
      new Request('http://localhost/api/botharness/companion', {
        method: 'POST',
        body: JSON.stringify({
          consumerId,
          capacity: 3,
          revision: 1,
          selections: [
            {
              botId: 'ada',
              dm: true,
              epochs: { 'own-dm': 0, 'bot-dm': 0, 'shared-group': 0, 'bot-group': 0 },
            },
          ],
        }),
      }),
    );
  try {
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    core.ownership.claim({
      sessionId: 'ada',
      botSlug: 'ada',
      rootRole: 'orchestrator',
      at: FIXED_NOW().toISOString(),
    });
    const dm = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!;
    const commit = (id: string) =>
      core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        dm.id,
        {
          id,
          at: FIXED_NOW().toISOString(),
          author: { kind: 'bot', slug: 'ada' },
          body: id,
        },
        { sessionId: 'ada' },
      );
    const first = open();
    const baseline = await read(first);
    await select(baseline.consumerId);
    const active = await read(first);
    expect(typeof active.bots[0].lifecycle).toBe('string');
    await first.cancel();
    await commit('before-archive');
    core.registry.setPaused('ada', true);
    core.registry.setPaused('ada', false);
    const resumed = open(baseline.consumerId);
    const reconnect = await read(resumed);
    await select(reconnect.consumerId);
    const reactivated = await read(resumed);
    expect(reactivated.bots[0].lifecycle).not.toBe(active.bots[0].lifecycle);
    await commit('after-reactivation');
    expect((await read(resumed)).messageId).toBe('after-reactivation');
    core.registry.setPaused('ada', true);
    expect((await read(resumed)).bots).toMatchObject([{ slug: 'ada', paused: true }]);
    const deletion = core.deletions.preview('ada');
    expect(await core.deletions.confirm('ada', deletion.token, false)).toMatchObject({
      phase: 'complete',
      memory: 'retained',
    });
    const removed = await read(resumed);
    expect(removed.bots).toEqual([]);
    expect(removed.removedBotIds).toEqual(['ada']);
    expect(core.channels.readPosition(OWNER_HUMAN_CONTEXT, dm.id)).toBeUndefined();
  } finally {
    for (const reader of readers) await reader.cancel();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});
