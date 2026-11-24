import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { expect, it } from 'vitest';
import {
  folderColorIndex,
  folderMonogram,
  mergeSessionRows,
  mergeSessionSources,
} from '../src/features/sessions/session-query-model';

const row = (sessionId: string, sortedAt: number) =>
  ({
    sessionId,
    source: { kind: 'native' },
    running: false,
    lastPromptAt: sortedAt,
    updatedAt: sortedAt,
    sortedAt,
  }) satisfies HostSessionRow;

it('abbreviates a workspace folder as two Latin letters or one character of another script', () => {
  expect(folderMonogram('BotHarness')).toBe('BH');
  expect(folderMonogram('deepseek-bot')).toBe('DB');
  expect(folderMonogram('app')).toBe('AP');
  expect(folderMonogram('笔记')).toBe('笔');
  expect(folderMonogram(undefined)).toBe('·');
  expect(folderColorIndex('app', 10)).toBe(folderColorIndex('app', 10));
  expect(folderColorIndex('app', 10)).toBeLessThan(10);
});

it('merges rows from several Computers by their sort time and tags each with its Computer', () => {
  const merged = mergeSessionRows([
    { hostId: 'studio', hostName: 'Studio', rows: [row('a', 30), row('c', 10)] },
    { hostId: 'laptop', hostName: 'Laptop', rows: [row('b', 20)] },
  ]);
  expect(merged.map((item) => `${item.hostName}:${item.sessionId}`)).toEqual([
    'Studio:a',
    'Laptop:b',
    'Studio:c',
  ]);
  expect(
    mergeSessionSources([
      [{ kind: 'bot', botSlug: 'zed', displayName: 'Zed' }, { kind: 'native' }],
      [{ kind: 'bot', botSlug: 'ada', displayName: 'Ada' }, { kind: 'native' }],
    ]).map((source) => (source.kind === 'native' ? 'native' : source.botSlug)),
  ).toEqual(['native', 'ada', 'zed']);
});
