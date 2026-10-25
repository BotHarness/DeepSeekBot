import { expect, it, vi } from 'vitest';
vi.mock('../src/cloud/available', () => ({ cloudAvailable: false }));
import { creationMenuItems } from '../src/ui/shell/creation-menu-items';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
const targets = creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((t) => ({
  ...t,
  channelCreation: false,
}));
it('offers exactly four sources without pairing and keeps All destination-free', () => {
  for (const ts of [[], targets]) {
    const items = creationMenuItems({ scope: 'all', targets: ts });
    expect(items.map((i) => i.action)).toEqual(['bot', 'zip', 'marketplace', 'git']);
    expect(items.every((i) => i.target === undefined && i.children === undefined)).toBe(true);
  }
});
it('carries the explicitly selected Computer for every source', () => {
  expect(
    creationMenuItems({ scope: computerEnvironmentKey('mac'), targets }).every(
      (i) => i.target?.kind === 'computer' && i.target.hostId === 'mac',
    ),
  ).toBe(true);
});
it('preserves explicit target selection for legacy channel actions', () => {
  const choices = creationMenuItems({
    scope: 'all',
    targets: creationTargets({ hostId: 'mac', name: 'Mac' }, []),
  });
  expect(choices.find((i) => i.action === 'channel')?.children).toEqual([
    expect.objectContaining({
      action: 'channel',
      target: expect.objectContaining({ hostId: 'mac' }),
    }),
  ]);
});

it('opens the native channel form from All before choosing a Host, including without pairing', () => {
  for (const ts of [[], targets]) {
    const item = creationMenuItems({ scope: 'all', targets: ts, nativeChannelForm: true }).find(
      (item) => item.action === 'channel',
    );
    expect(item?.action).toBe('channel');
    expect(item?.children).toBeUndefined();
    expect(item?.target).toBeUndefined();
  }
});
