import { expect, it, vi } from 'vitest';
import { loadTimelinePage, parseJournalPage, type BridgeCall } from '../src/client/bridge.js';

const readable = {
  id: 'm1',
  at: '2026-10-15T08:00:00.000Z',
  author: { kind: 'human' },
  body: 'hello',
  channelRevision: 1,
};
const unreadable = {
  id: 'm2',
  at: '2026-10-15T08:01:00.000Z',
  author: { kind: 'system' },
  body: 'Auto approval paused for this Session.',
  futureNotice: { botSlug: 'nexus' },
  channelRevision: 2,
};

it('keeps the Channel timeline readable when one committed message has an unknown shape', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const call: BridgeCall = async () => ({
    ok: true,
    value: {
      revision: 2,
      page: {
        entries: [readable, unreadable],
        olderCursor: 'older',
        newerCursor: 'newer',
        hasOlder: false,
        hasNewer: false,
      },
    },
  });

  const { page, revision } = await loadTimelinePage(call, 'dm-nexus');

  expect(revision).toBe(2);
  expect(page.entries.map((entry) => entry.id)).toEqual(['m1', 'm2']);
  expect(page.entries[1]).toEqual({
    id: 'm2',
    at: unreadable.at,
    author: { kind: 'system' },
    body: unreadable.body,
    format: 'text',
    channelRevision: 2,
  });
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});

it('keeps the journal revision sequence when one entry has an unknown shape', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const page = parseJournalPage({
    entries: [
      { channelId: 'dm-nexus', revision: 1, message: readable },
      { channelId: 'dm-nexus', revision: 2, message: unreadable },
    ],
    olderCursor: null,
    hasOlder: false,
  });
  expect(page?.entries.map((entry) => entry.revision)).toEqual([1, 2]);
  warn.mockRestore();
});

it('still rejects a timeline page whose entries are not messages at all', async () => {
  const call: BridgeCall = async () => ({
    ok: true,
    value: {
      revision: 1,
      page: {
        entries: [{ body: 'no id' }],
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
      },
    },
  });
  await expect(loadTimelinePage(call, 'dm-nexus')).rejects.toThrow(
    'invalid channelTimeline response',
  );
});
