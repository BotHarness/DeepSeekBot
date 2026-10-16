import { expect, it } from 'vitest';
import { createGeneratedFilesHistory } from '../src/client/generated-files-history.js';
import type { ChannelMessage } from '../src/client/store.js';

it('retains live files across timeline windows and keeps redactions ahead of stale history', () => {
  const message = (id: string, at: string): ChannelMessage => ({
    id,
    at,
    author: { kind: 'bot', slug: 'ada' },
    body: '',
    attachments: [{ fileId: id, name: `${id}.txt`, mime: 'text/plain', size: 1 }],
  });
  const older = message('older', '2026-10-01T00:00:00Z');
  const newer = message('newer', '2026-10-02T00:00:00Z');
  const cache = createGeneratedFilesHistory('ada');
  const ids = () => cache.files().map((file) => file.messageId);
  cache.accept([older], 'history');
  cache.accept([newer], 'live');
  cache.accept([older], 'live');
  expect(ids()).toEqual(['newer', 'older']);
  cache.purge([newer.id]);
  cache.accept([newer], 'history');
  cache.accept([newer], 'live');
  expect(ids()).toEqual(['older']);
  cache.accept([{ ...older, attachments: [], contentPurged: true }], 'live');
  cache.accept([older], 'history');
  expect(ids()).toEqual([]);
  const pending = message('pending', '2026-09-30T00:00:00Z');
  cache.purge([pending.id]);
  cache.accept([pending], 'history');
  expect(ids()).toEqual([]);
});
