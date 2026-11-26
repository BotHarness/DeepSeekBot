import { expect, it, vi } from 'vitest';

vi.mock('../src/host/host-store', () => ({
  hostStore: vi.fn(),
  hostStoreAvailable: () => false,
}));

import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import {
  localSessionRows,
  localTitleMatches,
  mergeSearchRows,
  type LocalSessionLists,
} from '../src/features/sessions/session-list-local';

const row = (sessionId: string, extra: Partial<HostSessionRow> = {}): HostSessionRow => ({
  sessionId,
  title: sessionId,
  source: { kind: 'native' },
  running: false,
  lastPromptAt: null,
  updatedAt: 1,
  ...extra,
});

const bot = (slug: string, displayName: string) =>
  ({ kind: 'bot', botSlug: slug, displayName }) as const;

const hosts = [{ hostId: 'studio', hostName: 'Studio' }];

function lists(
  sessions: HostSessionRow[],
  sources: LocalSessionLists['reads'][0]['list']['sources'],
) {
  return { reads: [{ hostId: 'studio', list: { sessions, sources } }], failed: 0 };
}

it('sorts the stored rows by last Human turn, creation or last activity without asking the Host', () => {
  const stored = lists(
    [
      row('old-prompt', { lastPromptAt: 10, createdAt: 1, updatedAt: 50 }),
      row('new-prompt', { lastPromptAt: 30, createdAt: 2, updatedAt: 20 }),
      row('newest', { lastPromptAt: 20, createdAt: 9, updatedAt: 5 }),
    ],
    [{ kind: 'native' }],
  );
  const order = (sort: 'last-human-turn' | 'created' | 'last-activity') =>
    localSessionRows(stored, hosts, 'all', sort)?.map((r) => [r.sessionId, r.sortedAt]);
  expect(order('last-human-turn')).toEqual([
    ['new-prompt', 30],
    ['newest', 20],
    ['old-prompt', 10],
  ]);
  expect(order('created')).toEqual([
    ['newest', 9],
    ['new-prompt', 2],
    ['old-prompt', 1],
  ]);
  expect(order('last-activity')).toEqual([
    ['old-prompt', 50],
    ['new-prompt', 20],
    ['newest', 5],
  ]);
});

it('shows a Bot by its current name from the latest sources and hides Bots that are no longer listed', () => {
  const stored = lists(
    [
      row('ada-1', { source: bot('ada', 'Old Ada') }),
      row('gone-1', { source: bot('gone', 'Gone') }),
      row('native-1'),
      row('archived', { archived: true }),
    ],
    [{ kind: 'native' }, bot('ada', 'Ada Lovelace')],
  );
  const rows = localSessionRows(stored, hosts, 'all');
  expect(
    rows?.map((r) => [r.sessionId, r.source.kind === 'bot' ? r.source.displayName : 'native']),
  ).toEqual([
    ['ada-1', 'Ada Lovelace'],
    ['native-1', 'native'],
  ]);
  expect(localSessionRows(stored, hosts, 'bot:ada')?.map((r) => r.sessionId)).toEqual(['ada-1']);
  expect(localSessionRows(stored, hosts, 'native')?.map((r) => r.sessionId)).toEqual(['native-1']);
});

it('matches titles locally while the Host adds message matches, without duplicates', () => {
  const stored = localSessionRows(
    lists(
      [
        row('a', { title: 'Deploy  checklist', lastPromptAt: 3 }),
        row('b', { title: 'Lunch', lastPromptAt: 2 }),
      ],
      [{ kind: 'native' }],
    ),
    hosts,
    'all',
  );
  const local = localTitleMatches(stored, ' deploy checklist ');
  expect(local?.map((r) => r.sessionId)).toEqual(['a']);
  const fromHost = [
    { ...row('a', { lastPromptAt: 3, sortedAt: 3 }), hostId: 'studio', hostName: 'Studio' },
    { ...row('c', { lastPromptAt: 9, sortedAt: 9 }), hostId: 'studio', hostName: 'Studio' },
  ];
  expect(mergeSearchRows(local, fromHost)?.map((r) => r.sessionId)).toEqual(['c', 'a']);
  expect(mergeSearchRows(undefined, undefined)).toBeUndefined();
});
