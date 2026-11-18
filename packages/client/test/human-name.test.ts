import { describe, expect, it } from 'vitest';
import { loadHumanIdentity, setHumanDefaultName, type BridgeCall } from '../src/client/bridge.js';
import { createActions } from '../src/client/actions.js';
import { createStore } from '../src/client/store.js';

describe('current local Human identity Bridge', () => {
  it('saves and clears a label without supplying a Human ID', async () => {
    const calls: Array<{ endpoint: string; payload: Record<string, unknown> }> = [];
    const call: BridgeCall = async (endpoint, payload) => {
      calls.push({ endpoint, payload });
      const name = endpoint === 'humanNameSet' ? payload['displayName'] : null;
      return {
        ok: true,
        value: { humanId: 'local-human', defaultDisplayName: name, displayName: name ?? 'Human' },
      };
    };
    expect(await loadHumanIdentity(call)).toEqual({
      humanId: 'local-human',
      defaultDisplayName: null,
      displayName: 'Human',
    });
    expect((await setHumanDefaultName(call, '小熊')).displayName).toBe('小熊');
    expect((await setHumanDefaultName(call, null)).displayName).toBe('Human');
    expect(calls).toEqual([
      { endpoint: 'humanIdentity', payload: {} },
      { endpoint: 'humanNameSet', payload: { displayName: '小熊' } },
      { endpoint: 'humanNameSet', payload: { displayName: null } },
    ]);
    for (const value of [
      { humanId: '', defaultDisplayName: null, displayName: 'Human' },
      { humanId: 'local-human', displayName: 'Spoof' },
    ]) {
      await expect(loadHumanIdentity(async () => ({ ok: true, value }))).rejects.toThrow(
        'invalid Human identity',
      );
    }
  });
  it('roster refresh replaces current Bot labels and Human Channel names together', async () => {
    const clientStore = createStore();
    const call: BridgeCall = async (endpoint) => ({
      ok: true,
      value:
        endpoint === 'list'
          ? {
              bots: [
                {
                  slug: 'ada',
                  displayName: '教授',
                  roles: [],
                  aggregateState: 'idle',
                  workspaces: [],
                  createdAt: '',
                },
              ],
            }
          : endpoint === 'channels'
            ? {
                channels: [
                  {
                    id: 'group-team',
                    type: 'group',
                    name: 'Team',
                    members: ['ada'],
                    humanMembers: [{ humanId: 'local-human', displayName: '教授' }],
                  },
                ],
              }
            : { pins: [], sections: [] },
    });
    await createActions(call, clientStore).refreshRoster();
    expect(clientStore.getSnapshot().bots[0]?.displayName).toBe('教授');
    expect(clientStore.getSnapshot().channels[0]?.humanMembers).toEqual([
      { humanId: 'local-human', displayName: '教授' },
    ]);
  });
});
