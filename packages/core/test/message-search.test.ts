import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { searchSnippet } from '../src/channels/sqlite-store.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { createFakeRosterDomain } from './roster-fixture.js';

async function fixture() {
  const core = createCore({ dshHome: createTempRoot('botharness-message-search-') });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  core.registry.create({ slug: 'bob', displayName: 'Bob' });
  const ada = core.channels.getOrCreateDm('ada', 'Ada')!;
  const bob = core.channels.getOrCreateDm('bob', 'Bob')!;
  await core.channels.appendMessage(ada.id, {
    id: 'ada-one',
    at: '2026-10-14T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'Where is the launch checklist? 搜索功能要上线',
  });
  await core.channels.appendMessage(bob.id, {
    id: 'bob-one',
    at: '2026-10-14T00:00:05.000Z',
    author: { kind: 'bot', slug: 'bob' },
    body: 'The LAUNCH moved to Friday',
  });
  await core.channels.appendMessage(bob.id, {
    id: 'bob-memory',
    at: '2026-10-14T00:00:06.000Z',
    author: { kind: 'bot', slug: 'bob' },
    body: 'launch notes saved',
    memoryCommit: { subject: 'launch', authorName: 'Bob', files: 'notes.md', sha: 'abc' },
  } as never);
  await core.roster.attach(createFakeRosterDomain().facility);
  const methods = createBridgeMethods({ ...core });
  const close = async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  return { core, ada, bob, methods, close };
}

describe('Global message search', () => {
  it('finds visible messages across Channels, newest first, and pages them', async () => {
    const { ada, bob, methods, close } = await fixture();
    try {
      const first = methods.messageSearch({ text: 'launch', limit: 1 });
      expect(first.ok && first.value.hits.map((hit) => [hit.channelId, hit.message.id])).toEqual([
        [bob.id, 'bob-one'],
      ]);
      const cursor = first.ok ? first.value.nextCursor : undefined;
      const second = methods.messageSearch({ text: 'LAUNCH', cursor, limit: 5 });
      expect(second.ok && second.value.hits.map((hit) => hit.message.id)).toEqual(['ada-one']);
      expect(second.ok && second.value.hits[0]!.channelId).toBe(ada.id);
      expect(second.ok && second.value.nextCursor).toBeUndefined();
    } finally {
      await close();
    }
  });

  it('matches two-character Chinese text without the trigram index', async () => {
    const { methods, close } = await fixture();
    try {
      const found = methods.messageSearch({ text: '搜索' });
      expect(found.ok && found.value.hits.map((hit) => hit.message.id)).toEqual(['ada-one']);
      expect(found.ok && found.value.hits[0]!.snippet).toContain('搜索功能');
    } finally {
      await close();
    }
  });

  it('stops paging a short query at its scan cap', async () => {
    const { core, ada, methods, close } = await fixture();
    try {
      for (let index = 0; index < 205; index += 1)
        await core.channels.appendMessage(ada.id, {
          id: `cap-${index}`,
          at: new Date(Date.UTC(2026, 9, 15, 0, 0, index)).toISOString(),
          author: { kind: 'human' },
          body: `qz ${index}`,
        });
      let cursor: string | undefined;
      const pages: number[] = [];
      for (let page = 0; page < 10; page += 1) {
        const found = methods.messageSearch({ text: 'qz', cursor, limit: 50 });
        if (!found.ok) throw new Error('search failed');
        pages.push(found.value.hits.length);
        cursor = found.value.nextCursor;
        if (cursor === undefined) break;
      }
      expect(pages).toEqual([50, 50, 50, 50]);
    } finally {
      await close();
    }
  });

  it('leaves out hidden Channels, earlier group history and refuses bad input', async () => {
    const { core, bob, methods, close } = await fixture();
    try {
      await core.roster.hiddenSet([bob.id]);
      const found = methods.messageSearch({ text: 'launch' });
      expect(found.ok && found.value.hits.map((hit) => hit.message.id)).toEqual(['ada-one']);
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessage(group.id, {
        id: 'group-one',
        at: '2026-10-14T00:01:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'launch party tonight',
      });
      const withGroup = methods.messageSearch({ text: 'launch' });
      expect(withGroup.ok && withGroup.value.hits.map((hit) => hit.message.id)).toEqual([
        'group-one',
        'ada-one',
      ]);
      expect(methods.messageSearch({ text: '  ' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(methods.messageSearch({ text: 'launch', cursor: 'bogus' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input', message: 'invalid cursor' },
      });
    } finally {
      await close();
    }
  });

  it('finds a message by its attachment file name', async () => {
    const { core, ada, methods, close } = await fixture();
    try {
      await core.channels.appendMessage(ada.id, {
        id: 'ada-file',
        at: '2026-10-14T00:02:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'here you go',
        attachments: [
          await core.attachments.upload({
            data: (async function* () {
              yield new TextEncoder().encode('plan');
            })(),
            name: 'quarterly-roadmap.txt',
          }),
        ],
      });
      const found = methods.messageSearch({ text: 'roadmap' });
      expect(found.ok && found.value.hits.map((hit) => hit.message.id)).toEqual(['ada-file']);
    } finally {
      await close();
    }
  });
});

describe('searchSnippet', () => {
  it('starts shortly before the match on one line', () => {
    const text = `${'x'.repeat(100)} needle\n${'y'.repeat(200)}`;
    const snippet = searchSnippet(text, 'needle');
    expect(snippet.startsWith('…')).toBe(true);
    expect(snippet.endsWith('…')).toBe(true);
    expect(snippet).toContain('needle y');
    expect(Array.from(snippet).length).toBeLessThanOrEqual(122);
  });
});
