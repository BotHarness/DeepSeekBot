import type { HostSessionRow } from '@botharness/host-protocol/host-sessions';
import { expect, it } from 'vitest';
import {
  assignFolderColors,
  folderColor,
  folderColorKey,
  FOLDER_COLOR_IDS,
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
  expect(folderColor('app')).toBe(folderColor('app'));
  expect(FOLDER_COLOR_IDS).toContain(folderColor('app'));
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

it('gives every folder on a Host its own colour until the palette runs out, whatever the row order', () => {
  const names = ['api', 'web', 'docs', 'infra', 'scripts', 'notes', 'mobile', 'site', 'data'];
  const rows = names.map((folderName) => ({ hostId: 'a', folderName }));
  const colors = assignFolderColors(rows);
  const used = names.map((name) => colors.get(folderColorKey('a', name)));
  expect(new Set(used).size).toBe(FOLDER_COLOR_IDS.length);
  expect(used).not.toContain('graphite');
  const shuffled = assignFolderColors([...rows].reverse());
  for (const name of names)
    expect(shuffled.get(folderColorKey('a', name))).toBe(colors.get(folderColorKey('a', name)));
  const tenth = assignFolderColors([...rows, { hostId: 'a', folderName: 'extra' }]);
  expect(tenth.get(folderColorKey('a', 'extra'))).toBeDefined();
});

it('keeps a lone folder on its preferred colour and assigns each Host separately', () => {
  const colors = assignFolderColors([
    { hostId: 'a', folderName: 'web' },
    { hostId: 'b', folderName: 'web' },
    { hostId: 'b', folderName: '' },
    { hostId: 'b' },
  ]);
  expect(colors.get(folderColorKey('a', 'web'))).toBe(folderColor('web'));
  expect(colors.get(folderColorKey('b', 'web'))).toBe(folderColor('web'));
  expect(colors.size).toBe(2);
});
