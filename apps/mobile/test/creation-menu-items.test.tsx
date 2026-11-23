import { expect, it, vi } from 'vitest';
import { interfacePreferences } from '../src/ui/interface-preferences';
import { cloudEnvironmentKey, computerEnvironmentKey } from '../src/host/conversation-environments';
import { creationTargets } from '../src/host/creation-targets';
import { creationMenuGroups } from '../src/ui/shell/creation-menu-items';

const feature = vi.hoisted(() => ({ cloud: true }));
vi.mock('../src/cloud/available', () => ({
  get cloudAvailable() {
    return feature.cloud;
  },
}));

const computer = { hostId: 'mac', name: 'Mac' };
const scope = cloudEnvironmentKey('owner', 'org');
const cloudWorkspace = {
  instanceId: 'tobs',
  organizationId: 'org',
  organizationName: 'Team',
  scope: 'owner',
  server: 'https://tobs.example.test',
  guest: false,
  role: 'owner' as const,
};
const actionGroups = (groups: ReturnType<typeof creationMenuGroups>) =>
  groups.map((group) => group.map((item) => item.action));

it('groups All creation actions and keeps cloud Invite in its own environment', () => {
  const targets = creationTargets(computer, [cloudWorkspace]);
  const all = creationMenuGroups({ scope: 'all', targets });
  expect(actionGroups(all)).toEqual([['channel', 'join'], ['create-bot']]);
  const [newGroup] = all[0] ?? [];
  expect(newGroup?.children?.map((item) => item.target?.kind)).toEqual([undefined, 'cloud']);
  const [createBot] = all[1] ?? [];
  expect(createBot?.children?.map((item) => item.action)).toEqual([
    'bot',
    'marketplace',
    'zip',
    'git',
  ]);
  expect(createBot?.children?.every((item) => item.target === undefined)).toBe(true);
  expect(actionGroups(creationMenuGroups({ scope, targets }))).toEqual([['channel'], ['invite']]);
  expect(actionGroups(creationMenuGroups({ scope, targets: [] }))).toEqual([]);
});

it('hides Bot creation for Team members without Bot creation permission', () => {
  const targets = creationTargets(computer, []).map((target) => ({
    ...target,
    botCreation: false,
  }));
  expect(actionGroups(creationMenuGroups({ scope: 'all', targets }))).toEqual([
    ['channel', 'join'],
  ]);
  expect(
    actionGroups(creationMenuGroups({ scope: computerEnvironmentKey('mac'), targets })),
  ).toEqual([['channel']]);
});

it('carries the selected Computer for every action in its environment', () => {
  const groups = creationMenuGroups({
    scope: computerEnvironmentKey('mac'),
    targets: creationTargets(computer, []),
  });
  const leaves = groups.flat().flatMap((item) => item.children ?? [item]);
  expect(leaves.map((item) => item.action)).toEqual([
    'channel',
    'bot',
    'marketplace',
    'zip',
    'git',
  ]);
  expect(
    leaves.every((item) => item.target?.kind === 'computer' && item.target.hostId === 'mac'),
  ).toBe(true);
});

it('hides both Join and Invite when cloud support is off', () => {
  feature.cloud = false;
  try {
    const targets = creationTargets(computer, [cloudWorkspace]);
    expect(actionGroups(creationMenuGroups({ scope: 'all', targets }))).toEqual([
      ['channel'],
      ['create-bot'],
    ]);
    expect(actionGroups(creationMenuGroups({ scope, targets }))).toEqual([['channel']]);
  } finally {
    feature.cloud = true;
  }
});

it('localizes the entry and submenu labels', () => {
  const original = interfacePreferences.getSnapshot().language;
  const labels = () => {
    const groups = creationMenuGroups({ scope: 'all', targets: [] });
    return groups
      .flat()
      .flatMap((item) => [item.label, ...(item.children ?? []).map((child) => child.label)]);
  };
  try {
    interfacePreferences.setLanguage('en');
    expect(labels()).toEqual([
      'New Group',
      'Join',
      'Create Bot',
      'Blank',
      'Marketplace',
      'ZIP',
      'Git',
    ]);
    interfacePreferences.setLanguage('zh');
    expect(labels()).toEqual(['新建群聊', '加入', '创建 Bot', '空白 Bot', '市场', 'ZIP', 'Git']);
  } finally {
    interfacePreferences.setLanguage(original);
  }
});
