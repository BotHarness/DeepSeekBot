import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { expect, it, vi } from 'vitest';
import type { SessionQueryRow } from '../src/features/sessions/session-query-model';

vi.mock('react-native', () => import('./react-native-shim'));

import {
  preselectedComputer,
  sessionDrawerSections,
  sessionDrawerWidth,
  sessionRowIdentity,
  settleSessionDrawer,
} from '../src/features/sessions/session-drawer-model';

const now = new Date(2026, 10, 24, 15, 0).getTime();
const hour = 3_600_000;
const row = (sessionId: string, lastPromptAt: number | null, updatedAt = lastPromptAt ?? 0) =>
  ({
    sessionId,
    source: { kind: 'native' },
    running: false,
    lastPromptAt,
    updatedAt,
  }) satisfies HostSessionRow;

it('groups Sessions into Today, Yesterday and Earlier in list order', () => {
  const rows = [
    row('a', now - hour),
    row('b', now - 20 * hour),
    row('c', now - 40 * hour),
    row('d', null, now - 2 * hour),
  ];
  expect(
    sessionDrawerSections(rows, 'last-human-turn', now).map((section) => [
      section.group,
      section.data.map((item) => item.sessionId),
    ]),
  ).toEqual([
    ['today', ['a']],
    ['yesterday', ['b']],
    ['earlier', ['c', 'd']],
  ]);
  expect(sessionDrawerSections(rows, 'last-activity', now).map((section) => section.group)).toEqual(
    ['today', 'yesterday', 'earlier'],
  );
  expect(sessionDrawerSections([], 'created', now)).toEqual([]);
});

it('keeps a thin closing strip and settles on distance or a fling', () => {
  expect(sessionDrawerWidth(390)).toBe(334);
  expect(sessionDrawerWidth(20)).toBe(0);
  expect(settleSessionDrawer(0.5, 0)).toBe(true);
  expect(settleSessionDrawer(0.2, 0)).toBe(false);
  expect(settleSessionDrawer(0.1, 800)).toBe(true);
  expect(settleSessionDrawer(0.9, -800)).toBe(false);
});

it('preselects the scope’s Computer, then the most recent one', () => {
  const computers = [
    { hostId: 'studio', key: '["computer","studio"]' },
    { hostId: 'laptop', key: '["computer","laptop"]' },
  ];
  expect(preselectedComputer('["computer","laptop"]', computers, 'studio')).toBe('laptop');
  expect(preselectedComputer('all', computers, 'laptop')).toBe('laptop');
  expect(preselectedComputer('all', computers, 'gone')).toBe('studio');
  expect(preselectedComputer('all', [], 'studio')).toBeUndefined();
});

const listed = (extra: Partial<SessionQueryRow>): SessionQueryRow => ({
  sessionId: 's',
  hostId: 'laptop',
  hostName: 'Laptop',
  source: { kind: 'native' },
  running: false,
  lastPromptAt: null,
  updatedAt: 0,
  ...extra,
});
const ada = {
  kind: 'bot',
  botSlug: 'ada',
  displayName: 'Ada',
  avatar: '/avatars/ada.png',
} as const;

it('names the Host only under All and the Bot only on Bot-created Sessions', () => {
  const host = { hostId: 'laptop', hostName: 'Laptop' };
  expect(sessionRowIdentity(listed({ source: ada }), true, 8)).toMatchObject({ host, bot: ada });
  const own = sessionRowIdentity(listed({}), true, 8);
  expect(own.host).toEqual(host);
  expect(own.bot).toBeUndefined();
  const scopedBot = sessionRowIdentity(listed({ source: ada }), false, 8);
  expect(scopedBot.host).toBeUndefined();
  expect(scopedBot.bot).toEqual(ada);
  expect(sessionRowIdentity(listed({}), false, 8)).toEqual({});
});

it('carries the folder monogram, colour and path, and the model brand when known', () => {
  const identity = sessionRowIdentity(
    listed({
      folderName: 'deploy-tools',
      cwd: '/work/deploy-tools',
      model: { provider: 'opencode-go', model: 'deepseek-v4.1-flash' },
    }),
    false,
    8,
  );
  expect(identity.folder).toEqual({
    name: 'deploy-tools',
    monogram: 'DT',
    colorIndex: identity.folder!.colorIndex,
    path: '/work/deploy-tools',
  });
  expect(identity.folder!.colorIndex).toBeGreaterThanOrEqual(0);
  expect(identity.folder!.colorIndex).toBeLessThan(8);
  expect(identity.model).toEqual({
    provider: 'opencode-go',
    model: 'deepseek-v4.1-flash',
    brand: 'deepseek',
  });
  const member = sessionRowIdentity(listed({ folderName: '笔记' }), false, 8);
  expect(member.folder).toEqual({
    name: '笔记',
    monogram: '笔',
    colorIndex: member.folder!.colorIndex,
  });
  expect(sessionRowIdentity(listed({ folderName: '' }), false, 8).folder).toBeUndefined();
});
