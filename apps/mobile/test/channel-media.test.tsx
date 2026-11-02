import { expect, it, vi } from 'vitest';

vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('expo-image', () => ({ Image: () => null }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import type { ChannelFile } from '../src/host/channel-files';
import { fileTypeLabel, isMedia, mediaRows } from '../src/ui/chat/channel-media';

const file = (key: string, kind: 'image' | 'file' | 'audio' = 'image'): ChannelFile => ({
  key,
  messageId: key,
  at: '2026-10-27T00:00:00.000Z',
  author: { kind: 'human' },
  attachment: { key, kind, name: key, local: false },
});

it('labels file types from the extension, then the MIME subtype', () => {
  expect(fileTypeLabel({ name: 'report.pdf' })).toBe('PDF');
  expect(fileTypeLabel({ name: 'Plan.DOCX' })).toBe('DOCX');
  expect(fileTypeLabel({ name: 'notes', mime: 'text/plain' })).toBe('');
  expect(fileTypeLabel({ name: 'notes', mime: 'application/zip' })).toBe('ZIP');
  expect(fileTypeLabel({ name: 'archive.tar.gz' })).toBe('GZ');
  expect(fileTypeLabel({ name: 'dump.sqlite3' })).toBe('');
});

it('puts only images in the three-column media grid', () => {
  const files = ['a', 'b', 'c', 'd'].map((key) => file(key));
  expect(mediaRows(files).map((row) => row.map((entry) => entry.key))).toEqual([
    ['a', 'b', 'c'],
    ['d'],
  ]);
  expect(isMedia(file('voice', 'audio'))).toBe(false);
  expect(isMedia(file('doc', 'file'))).toBe(false);
});
