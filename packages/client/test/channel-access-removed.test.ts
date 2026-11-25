import { describe, expect, it } from 'vitest';
import { DM, GROUP, setup } from './bridge-helpers.js';

function revocable(state: 'removed' | 'unavailable') {
  let channels: unknown[] = [GROUP, DM];
  const asked: unknown[] = [];
  const harness = setup({
    channels: () => ({ channels }),
    channelAccessState: (payload) => {
      asked.push(payload);
      return { channelId: payload['channelId'], state };
    },
  });
  return {
    ...harness,
    asked,
    remove: () => {
      channels = [DM];
    },
  };
}

async function openThenLose(state: 'removed' | 'unavailable') {
  const harness = revocable(state);
  await harness.actions.load();
  const group = harness.clientStore.getSnapshot().channels.find((item) => item.id === GROUP.id);
  harness.clientStore.select({ kind: 'channel', channelId: GROUP.id });
  harness.clientStore.setConversation({ channel: group });
  harness.remove();
  await harness.actions.refreshRoster();
  await new Promise((resolve) => setTimeout(resolve, 0));
  return harness;
}

describe('an open Channel that leaves the roster', () => {
  it('says access was removed when the Host reports a revoke', async () => {
    const { clientStore, asked } = await openThenLose('removed');
    expect(asked).toEqual([{ channelId: GROUP.id }]);
    expect(clientStore.getSnapshot().selection).toBeUndefined();
    expect(clientStore.getSnapshot().closedChannel).toMatchObject({
      id: GROUP.id,
      name: GROUP.name,
    });
  });

  it('shows the ordinary welcome when the Channel was deleted', async () => {
    const { clientStore } = await openThenLose('unavailable');
    expect(clientStore.getSnapshot().selection).toBeUndefined();
    expect(clientStore.getSnapshot().closedChannel).toBeUndefined();
  });

  it('forgets the notice once another conversation opens', async () => {
    const { clientStore } = await openThenLose('removed');
    clientStore.select({ kind: 'channel', channelId: DM.id });
    expect(clientStore.getSnapshot().closedChannel).toBeUndefined();
  });
});
