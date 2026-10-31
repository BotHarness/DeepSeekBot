import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import type { NetworkBotMessage } from '../src/runtime/bot-network.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';

it('requires an owned admitted Source Event for a model-free remote Bot send', async () => {
  const host = new FakeAgentHost({ kind: 'completed' });
  const sent: NetworkBotMessage[] = [];
  let online = true;
  const core = createCore({
    dshHome: createTempRoot('network-direct-tool-'),
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: () => '/memory',
      ensureWorkspace: () => undefined,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
    botNetwork: {
      contacts: () =>
        online
          ? [
              {
                hostId: 'remote',
                botSlug: 'ios',
                displayName: 'iOS',
                device: { model: null, platform: 'darwin' },
                capabilities: [],
              },
            ]
          : [],
      async send(_host, message) {
        sent.push(message);
      },
    },
  });
  try {
    for (const slug of ['caller', 'foreign']) {
      core.registry.create({ slug, displayName: slug });
      const dm = core.channels.getOrCreateDm(slug, slug)!;
      await core.channels.appendMessage(dm.id, {
        id: 'human-start',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Check iOS',
      });
    }
    const owned = core.channels.humanSendStatus!('dm-caller', 'human-start')!.sourceEventId;
    const foreign = core.channels.humanSendStatus!('dm-foreign', 'human-start')!.sourceEventId;
    const run = (source?: string) =>
      core.runtime.runDirectBotTool!(
        'caller',
        'bot_send_message',
        { bot_id: 'remote:remote:ios', body: 'Check iOS' },
        new AbortController().signal,
        undefined,
        source,
      );
    await expect(run()).rejects.toThrow('trusted Source Event');
    await expect(run(foreign)).rejects.toMatchObject({ code: 'source-unavailable' });
    expect(sent).toEqual([]);
    const result = (await run(owned)).result;
    expect(result).toMatchObject({ status: 'committed' });
    expect(result).not.toHaveProperty('notWoken');
    expect(result).not.toHaveProperty('notice');
    expect(sent).toHaveLength(1);
    expect(sent[0]?.causation).toEqual({
      rootSourceEventId: owned,
      parentSourceEventId: owned,
      hop: 1,
    });
    online = false;
    await expect(run(owned)).rejects.toMatchObject({ code: 'unable-to-deliver' });
    expect(sent).toHaveLength(1);
    expect(core.runtime.botContacts?.('caller', { botId: 'remote:remote:ios' }).contacts).toEqual(
      [],
    );
    expect(host.sessions).toHaveLength(0);
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}, 60_000);
