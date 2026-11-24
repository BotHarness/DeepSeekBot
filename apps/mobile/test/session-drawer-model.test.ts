import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));

import {
  preselectedComputer,
  sessionDrawerSections,
  sessionDrawerWidth,
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
