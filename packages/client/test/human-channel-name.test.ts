import { expect, it } from 'vitest';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';
import type { BridgeCall } from '../src/client/bridge.js';
import { humanAuthorName } from '../src/client/actor-names.js';
it('updates only the source Channel and preserves the current conversation when a nickname saves', async () => {
  const source = {
    id: 'group-a',
    type: 'group' as const,
    name: 'A',
    members: ['ada'],
    createdAt: '',
    updatedAt: '',
    humanNickname: null,
    humanMembers: [{ humanId: 'local-human', displayName: 'Little Bear' }],
  };
  const other = {
    ...source,
    id: 'dm-ada',
    type: 'dm' as const,
    name: 'Ada',
    botSlug: 'ada',
    humanNickname: 'Captain',
    humanMembers: [{ humanId: 'local-human', displayName: 'Captain' }],
  };
  const clientStore = createStore();
  clientStore.upsertChannel(source);
  clientStore.upsertChannel(other);
  clientStore.setConversation({ channel: other });
  const call: BridgeCall = async (endpoint, payload) => {
    expect(endpoint).toBe('channelHumanNameSet');
    expect(payload).toEqual({ channelId: source.id, nickname: 'Professor' });
    return {
      ok: true,
      value: {
        channel: {
          ...source,
          humanNickname: 'Professor',
          humanMembers: [{ humanId: 'local-human', displayName: 'Professor' }],
        },
      },
    };
  };
  expect(await createActions(call, clientStore).setHumanNickname(source.id, 'Professor')).toBe(
    true,
  );
  expect(clientStore.getSnapshot().channels.find((c) => c.id === source.id)?.humanNickname).toBe(
    'Professor',
  );
  expect(clientStore.getSnapshot().conversation.channel?.humanMembers?.[0]?.displayName).toBe(
    'Captain',
  );
});

it('names a Human author by their current Group nickname, falling back to the stored name', () => {
  const t = ((key: string) => (key === 'channelActivity.human' ? 'You' : key)) as never;
  const group = {
    humanMembers: [
      { humanId: 'local-human', displayName: 'Professor' },
      { humanId: 'mia', displayName: 'Mia in this group' },
    ],
  };
  expect(humanAuthorName({ kind: 'human', humanId: 'mia', displayName: 'Mia' }, group, t)).toBe(
    'Mia in this group',
  );
  expect(humanAuthorName({ kind: 'human' }, group, t)).toBe('Professor');
  expect(humanAuthorName({ kind: 'human', humanId: 'leo', displayName: 'Leo' }, group, t)).toBe(
    'Leo',
  );
  expect(humanAuthorName({ kind: 'human', humanId: 'mia', deleted: true }, group, t)).toBe(
    'team.deletedMember',
  );
  expect(humanAuthorName({ kind: 'human', displayName: 'Human' }, undefined, t)).toBe('You');
});
