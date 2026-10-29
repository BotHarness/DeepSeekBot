import { expect, it, vi } from 'vitest';
import { interfacePreferences } from '../src/ui/interface-preferences';
vi.mock('../src/cloud/available', () => ({ cloudAvailable: false }));
import { creationMenuItems } from '../src/ui/shell/creation-menu-items';
import { creationTargets } from '../src/host/creation-targets';
import { computerEnvironmentKey } from '../src/host/conversation-environments';
const targets = creationTargets({ hostId: 'mac', name: 'Mac' }, []).map((t) => ({
  ...t,
  channelCreation: false,
}));
it('groups imports without pairing and keeps All destination-free', () => {
  for (const ts of [[], targets]) {
    const items = creationMenuItems({ scope: 'all', targets: ts });
    expect(items.map((i) => i.action)).toEqual(['bot', 'import', 'marketplace']);
    expect(items.find((i) => i.action === 'import')?.children?.map((i) => i.action)).toEqual([
      'zip',
      'git',
    ]);
    expect(items.every((i) => i.target === undefined)).toBe(true);
    expect(items.flatMap((i) => i.children ?? [i]).every((i) => i.target === undefined)).toBe(true);
  }
});
it('carries the explicitly selected Computer for every source', () => {
  expect(
    creationMenuItems({ scope: computerEnvironmentKey('mac'), targets })
      .flatMap((i) => i.children ?? [i])
      .every((i) => i.target?.kind === 'computer' && i.target.hostId === 'mac'),
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

it('uses the approved top-level labels and order in both languages', () => {
  const original = interfacePreferences.getSnapshot().language;
  try {
    interfacePreferences.setLanguage('en');
    expect(
      creationMenuItems({ scope: 'all', targets: [], nativeChannelForm: true }).map(
        (item) => item.label,
      ),
    ).toEqual(['Create Bot', 'Import Bot', 'Create Channel', 'Bot Marketplace']);
    interfacePreferences.setLanguage('zh');
    expect(
      creationMenuItems({ scope: 'all', targets: [], nativeChannelForm: true }).map(
        (item) => item.label,
      ),
    ).toEqual(['创建 Bot', '导入 Bot', '创建频道', 'Bot市场']);
  } finally {
    interfacePreferences.setLanguage(original);
  }
});
