import { describe, expect, it } from 'vitest';
import { ComposerDraftStore } from '../src/client/composer-draft-store.js';

function storage() {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    key(index: number) {
      return [...values.keys()][index] ?? null;
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
  };
}

describe('browser-local composer drafts', () => {
  it('does not create new durable versions when tabs validate unchanged recovered text', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', { text: 'shared draft' });
    const originalKey = local.key(0);
    const second = new ComposerDraftStore(local, 'second');
    second.read('channel');
    second.validated('channel', { mentions: [], channelRefs: [], uploads: [] }, false);
    expect(second.read('channel').needsValidation).toBe(false);
    expect(local.key(0)).toBe(originalKey);
    first.sync('channel');
    expect(first.read('channel').needsValidation).toBe(false);
    expect(first.read('channel').draft.text).toBe('shared draft');
    expect(local.length).toBe(1);
  });
  it('persists removed references once without making the other tab rewrite the normalized draft', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', {
      text: '@Gone',
      mentions: [{ botSlug: 'gone', label: 'Gone', start: 0, end: 5 }],
    });
    const second = new ComposerDraftStore(local, 'second');
    second.read('channel');
    second.validated('channel', { mentions: [] }, true);
    const normalizedKey = local.key(0);
    first.sync('channel');
    expect(first.read('channel').needsValidation).toBe(true);
    first.validated('channel', { mentions: [] }, false);
    expect(local.key(0)).toBe(normalizedKey);
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.mentions).toEqual([]);
    expect(first.read('channel').draft.text).toBe('@Gone');
  });
  it('keeps quote chips across a reload', () => {
    const local = storage();
    const quotes = [
      { messageId: 'a', author: 'Ada', excerpt: 'whole message' },
      { messageId: 'b', text: 'part', author: 'You', excerpt: 'part' },
    ];
    new ComposerDraftStore(local, 'first').update('channel', { text: 'both?', quotes });
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.quotes).toEqual(quotes);
  });
  it('recovers an unsent draft in a new browser owner without leaking across trusted scopes', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first-tab');
    first.update('host/profile/human/channel', { text: 'unsent input' });
    const reopened = new ComposerDraftStore(local, 'reopened-tab');
    expect(reopened.read('host/profile/human/channel').draft.text).toBe('unsent input');
    expect(reopened.read('other-host/profile/human/channel').draft.text).toBe('');
    expect(reopened.read('host/other-profile/human/channel').draft.text).toBe('');
    expect(reopened.read('host/profile/other-human/channel').draft.text).toBe('');
    expect(reopened.read('host/profile/human/other-channel').draft.text).toBe('');
  });
  it('retains concurrent tab versions until the Human explicitly chooses one', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    const second = new ComposerDraftStore(local, 'second');
    first.read('channel');
    second.read('channel');
    first.update('channel', { text: 'first draft' });
    second.update('channel', { text: 'second draft' });
    first.setEditing('channel', true);
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('first draft');
    expect(first.read('channel').versions.map((version) => version.draft.text)).toEqual([
      'first draft',
      'second draft',
    ]);
    first.choose('channel', 'second');
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.text).toBe(
      'second draft',
    );
    expect(new ComposerDraftStore(local, 'reopened').read('channel').versions).toHaveLength(1);
  });
  it('raises no conflict when another tab resolves to the draft this tab is already editing', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    const second = new ComposerDraftStore(local, 'second');
    first.read('channel');
    second.read('channel');
    first.update('channel', { text: 'first draft' });
    second.update('channel', { text: 'second draft' });
    first.setEditing('channel', true);
    second.setEditing('channel', true);
    first.sync('channel');
    first.choose('channel', 'first');
    second.sync('channel');
    expect(second.read('channel').versions).toHaveLength(2);
    second.choose('channel', 'first');
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('first draft');
    expect(first.read('channel').versions).toHaveLength(1);
    second.update('channel', { text: 'second edit' });
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('first draft');
    expect(first.read('channel').versions.map((version) => version.draft.text)).toEqual([
      'first draft',
      'second edit',
    ]);
  });
  it('treats concurrent versions with the same draft as one and supersedes them on the next edit', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    const second = new ComposerDraftStore(local, 'second');
    first.read('channel');
    second.read('channel');
    first.update('channel', { text: 'same draft' });
    second.update('channel', { text: 'same draft' });
    expect(local.length).toBe(2);
    const reopened = new ComposerDraftStore(local, 'reopened');
    expect(reopened.read('channel').draft.text).toBe('same draft');
    expect(reopened.read('channel').versions).toHaveLength(1);
    reopened.update('channel', { text: 'same draft, edited' });
    expect(local.length).toBe(1);
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('same draft, edited');
    expect(first.read('channel').versions).toHaveLength(1);
  });
  it('never overwrites active input with a causally newer remote draft, but synchronizes an idle view', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', { text: 'original' });
    first.setEditing('channel', true);
    const second = new ComposerDraftStore(local, 'second');
    second.update('channel', { text: 'remote edit' });
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('original');
    expect(first.read('channel').versions).toHaveLength(2);
    first.setEditing('channel', false);
    first.sync('channel');
    expect(first.read('channel').draft.text).toBe('remote edit');
  });
  it('retains the last durable draft when saving fails and exposes the failure', () => {
    const local = storage();
    const manager = new ComposerDraftStore(local, 'first');
    manager.update('channel', { text: 'saved draft' });
    local.setItem = () => {
      throw new Error('quota');
    };
    manager.update('channel', { text: 'not saved' });
    expect(manager.read('channel').draft.text).toBe('not saved');
    expect(manager.read('channel').error).toBe('quota');
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.text).toBe(
      'saved draft',
    );
  });
  it('keeps corrupt persisted bytes untouched rather than replacing them with an empty draft', () => {
    const local = storage();
    const key = 'botharness.composer.v1:channel:first';
    local.setItem(key, 'broken');
    const manager = new ComposerDraftStore(local, 'second');
    expect(manager.read('channel').error).toBe('corrupt');
    manager.update('channel', { text: 'new input' });
    expect(local.getItem(key)).toBe('broken');
    expect(local.length).toBe(1);
  });
  it('rejects records outside reader limits before replacing the durable draft', () => {
    const local = storage();
    const manager = new ComposerDraftStore(local, 'first');
    manager.update('channel', { text: 'valid draft' });
    manager.update('channel', {
      text: '@A '.repeat(1001),
      mentions: Array.from({ length: 1001 }, (_, index) => ({
        botSlug: 'ada',
        label: 'A',
        start: index * 3,
        end: index * 3 + 2,
      })),
    });
    expect(manager.read('channel').error).toBe('quota');
    const reopened = new ComposerDraftStore(local, 'reopened').read('channel');
    expect(reopened.error).toBeUndefined();
    expect(reopened.draft.text).toBe('valid draft');
  });
  it('reports the live-version budget when skipping a write', () => {
    const local = storage();
    const writers = Array.from(
      { length: 98 },
      (_, index) => new ComposerDraftStore(local, `writer-${index}`),
    );
    for (const manager of writers) manager.read('channel');
    const manager = new ComposerDraftStore(local, 'last');
    manager.update('channel', { text: 'saved' });
    new ComposerDraftStore(local, 'successor').update('channel', { text: 'superseded' });
    for (const manager of writers) manager.update('channel', { text: 'concurrent' });
    manager.setEditing('channel', true);
    manager.sync('channel');
    expect(manager.read('channel').versions).toHaveLength(100);
    expect(manager.read('channel').error).toBeUndefined();
    manager.update('channel', { text: 'unsaved' });
    expect(manager.read('channel').error).toBe('quota');
  });
  it('keeps unsaved input through idle sync and retries persistence after quota recovery', () => {
    const local = storage();
    const write = local.setItem;
    const manager = new ComposerDraftStore(local, 'first');
    manager.update('channel', { text: 'durable' });
    local.setItem = () => {
      throw new Error('quota');
    };
    manager.update('channel', { text: 'unsaved' });
    manager.sync('channel');
    expect(manager.read('channel').draft.text).toBe('unsaved');
    expect(manager.read('channel').error).toBe('quota');
    expect(manager.read('channel').versions).toHaveLength(1);
    local.setItem = write;
    manager.update('channel', { text: 'retry' });
    expect(manager.read('channel').error).toBeUndefined();
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.text).toBe('retry');
  });
  it('clears a draft with a durable tombstone so an older tab cannot resurrect it silently', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', { text: 'old input' });
    const second = new ComposerDraftStore(local, 'second');
    second.update('channel', { text: '' });
    expect(new ComposerDraftStore(local, 'reopened').read('channel').draft.text).toBe('');
    first.update('channel', { text: 'stale edit' });
    expect(new ComposerDraftStore(local, 'reopened').read('channel').versions).toHaveLength(2);
  });
  it('persists explicit reference identities but never file bytes or a forged ready state after reload', () => {
    const local = storage();
    const first = new ComposerDraftStore(local, 'first');
    first.update('channel', {
      text: '@Ada #Group',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 0, end: 4 }],
      channelRefs: [{ channelId: 'group', label: 'Group', start: 5, end: 11 }],
      reply: {
        id: 'original-message',
        at: '',
        author: { kind: 'human' },
        body: 'original reply body',
      },
      uploads: [
        {
          id: 'upload',
          file: new File(['private file bytes'], 'note.txt', { type: 'text/plain' }),
          status: 'ready',
          ref: { hash: 'sha256:' + '0'.repeat(64), name: 'note.txt', mime: 'text/plain', size: 18 },
        },
      ],
    });
    const restored = new ComposerDraftStore(local, 'reopened').read('channel');
    expect(restored.needsValidation).toBe(true);
    expect(restored.draft.mentions[0]?.botSlug).toBe('ada');
    expect(restored.draft.channelRefs[0]?.channelId).toBe('group');
    expect(restored.draft.reply?.id).toBe('original-message');
    expect(restored.draft.uploads[0]).toMatchObject({ status: 'error', fileAvailable: false });
    expect(restored.draft.uploads[0]?.file.size).toBe(0);
    expect(local.getItem(local.key(0)!)).not.toContain('private file bytes');
    expect(local.getItem(local.key(0)!)).not.toContain('original reply body');
  });
});
