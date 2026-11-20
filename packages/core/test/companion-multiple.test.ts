import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createTempRoot, FIXED_NOW } from './helpers.js';

it('keeps one future-only stream while independently selecting two owned DM authors', async () => {
  const core = createCore({ dshHome: createTempRoot('companion-multiple-') });
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  try {
    for (const slug of ['ada', 'grace']) {
      core.registry.create({ slug, displayName: slug });
      core.ownership.claim({
        sessionId: slug,
        botSlug: slug,
        rootRole: 'orchestrator',
        at: FIXED_NOW().toISOString(),
      });
      core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, slug);
    }
    const response = core.companions.open(
      new Request('http://localhost/api/botharness/companion?subscribe=1'),
    );
    reader = response.body!.getReader();
    const read = async (): Promise<{ name: string; data: Record<string, unknown> }> => {
      const frame = /event: ([^\n]+)\ndata: ([^\n]+)/u.exec(
        new TextDecoder().decode((await reader!.read()).value),
      );
      if (!frame) throw new Error('Missing multiplexed Host frame');
      return { name: frame[1]!, data: JSON.parse(frame[2]!) };
    };
    const baseline = await read();
    expect(baseline.name).toBe('companion/baseline');
    expect(baseline.data['bots']).toEqual([]);
    const update = async (selections: { botId: string; dm: boolean }[]) =>
      core.companions.update(
        new Request('http://localhost/api/botharness/companion', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            consumerId: baseline.data['consumerId'],
            selections,
            capacity: 20,
          }),
        }),
      );
    expect(
      (
        await update([
          { botId: 'ada', dm: true },
          { botId: 'grace', dm: true },
        ])
      ).status,
    ).toBe(200);
    const selected = await read();
    expect(selected.name).toBe('companion/selection');
    expect(selected.data['bots']).toMatchObject([{ slug: 'ada' }, { slug: 'grace' }]);
    const commit = async (slug: string, id: string) => {
      const channel = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, slug, slug)!;
      await core.channels.appendMessage(
        OWNER_HUMAN_CONTEXT,
        channel.id,
        { id, at: FIXED_NOW().toISOString(), author: { kind: 'bot', slug }, body: id },
        { sessionId: slug },
      );
    };
    await commit('ada', 'ada-one');
    await commit('grace', 'grace-one');
    expect((await read()).data).toMatchObject({ botId: 'ada', messageId: 'ada-one' });
    expect((await read()).data).toMatchObject({ botId: 'grace', messageId: 'grace-one' });
    await commit('grace', 'queued-before-change');
    expect((await update([{ botId: 'grace', dm: true }])).status).toBe(200);
    core.states.setSessionState('grace', 'grace', 'thinking');
    expect((await read()).data).toMatchObject({ messageId: 'queued-before-change' });
    expect((await read()).name).toBe('companion/selection');
    expect((await read()).name).toBe('companion/activity');
    await commit('ada', 'removed-hidden');
    await commit('grace', 'grace-two');
    expect((await read()).data).toMatchObject({ botId: 'grace', messageId: 'grace-two' });
    expect((await update([{ botId: 'unknown', dm: true }])).status).toBe(404);
    await commit('grace', 'grace-three');
    expect((await read()).data).toMatchObject({ botId: 'grace', messageId: 'grace-three' });
    await reader.cancel();
    reader = undefined;
    expect((await update([{ botId: 'grace', dm: true }])).status).toBe(404);
  } finally {
    await reader?.cancel();
    core.companions.close();
    await core.runtime.close();
    core.externalMessaging.close();
    core.live.close();
    core.operationalDatabase.close();
  }
});
