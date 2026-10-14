// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  IconChevronLeftOutlineRegular: () => null,
  IconChevronRightOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
}));

import { foldableMessage, messageFolds } from '../src/client/message-fold.js';
import { galleryImageKey, galleryStep } from '../src/client/message-image-gallery.js';
import { groupChannelMessages } from '../src/client/message-groups.js';
import type { ChannelMessage } from '../src/client/store.js';
import {
  forgetTimelineScrolls,
  rememberTimelineScroll,
  rememberedTimelineScroll,
  restoreTimelineScroll,
  timelineScrollAnchor,
  unreadAfterAnchor,
} from '../src/client/timeline-position.js';

const at = '2026-10-14T10:00:00.000Z';
const bot = (id: string, extra: Partial<ChannelMessage> = {}): ChannelMessage => ({
  id,
  at,
  author: { kind: 'bot', slug: 'ada' },
  body: id,
  ...extra,
});
const human = (id: string): ChannelMessage => ({ id, at, author: { kind: 'human' }, body: id });

describe('new-messages divider', () => {
  it('follows the read anchor only when someone else wrote after it', () => {
    expect(unreadAfterAnchor([bot('m1'), bot('m2')], 'm1', false)).toBe('m1');
    expect(unreadAfterAnchor([bot('m1'), human('m2')], 'm1', false)).toBeUndefined();
    expect(unreadAfterAnchor([bot('m1'), bot('m2')], 'm2', false)).toBeUndefined();
    expect(unreadAfterAnchor([bot('m1')], undefined, false)).toBeUndefined();
    expect(unreadAfterAnchor([bot('m1')], 'gone', true)).toBeUndefined();
  });

  it('treats a later unloaded page as unread and ignores live or failed output', () => {
    expect(unreadAfterAnchor([bot('m1')], 'm1', true)).toBe('m1');
    expect(
      unreadAfterAnchor(
        [bot('m1'), bot('d1', { streaming: true }), bot('f1', { failed: 'x' })],
        'm1',
        false,
      ),
    ).toBeUndefined();
  });

  it('starts a new display group after the anchor', () => {
    const messages = [bot('m1'), bot('m2'), bot('m3')];
    expect(groupChannelMessages(messages).map((group) => group.messages.length)).toEqual([3]);
    expect(groupChannelMessages(messages, 'm1').map((group) => group.key)).toEqual(['m1', 'm2']);
  });
});

describe('per-Channel scroll memory', () => {
  afterEach(() => forgetTimelineScrolls());

  function viewport(tops: Record<string, number>): HTMLElement {
    const element = document.createElement('div');
    element.getBoundingClientRect = () => ({ top: 100 }) as DOMRect;
    for (const [id, top] of Object.entries(tops)) {
      const row = document.createElement('div');
      row.dataset['messageId'] = id;
      row.getBoundingClientRect = () =>
        ({ top: top - element.scrollTop, bottom: top - element.scrollTop + 40 }) as DOMRect;
      element.append(row);
    }
    return element;
  }

  it('records the topmost visible message and puts it back at the same offset', () => {
    const before = viewport({ a: 20, b: 80, c: 130 });
    const saved = timelineScrollAnchor(before, false)!;
    expect(saved).toEqual({ messageId: 'b', offset: -20, atLatest: false });
    rememberTimelineScroll('ch', saved);
    const after = viewport({ z: 0, a: 300, b: 360, c: 410 });
    expect(restoreTimelineScroll(after, rememberedTimelineScroll('ch')!)).toBe(true);
    expect(after.scrollTop).toBe(360 - 100 + 20);
  });

  it('reports a remembered message that is not loaded', () => {
    expect(
      restoreTimelineScroll(viewport({ a: 0 }), { messageId: 'b', offset: 0, atLatest: false }),
    ).toBe(false);
  });

  it('keeps one position per Channel', () => {
    rememberTimelineScroll('one', { messageId: 'a', offset: 0, atLatest: false });
    rememberTimelineScroll('two', { messageId: 'b', offset: 4, atLatest: true });
    expect(rememberedTimelineScroll('one')?.messageId).toBe('a');
    expect(rememberedTimelineScroll('two')?.atLatest).toBe(true);
    expect(rememberedTimelineScroll('three')).toBeUndefined();
  });
});

describe('long message folding', () => {
  it('folds only bodies well past the fold height', () => {
    expect(messageFolds(300)).toBe(false);
    expect(messageFolds(480)).toBe(false);
    expect(messageFolds(481)).toBe(true);
  });

  it('never folds live output or interactive cards', () => {
    expect(foldableMessage(bot('m1'))).toBe(true);
    expect(foldableMessage(human('m1'))).toBe(true);
    expect(foldableMessage(bot('m1', { streaming: true }))).toBe(false);
    expect(foldableMessage(bot('m1', { pending: true }))).toBe(false);
    expect(foldableMessage(bot('m1', { grantRequest: true }))).toBe(false);
  });
});

describe('image gallery', () => {
  it('steps without wrapping around', () => {
    expect(galleryStep(3, 0, -1)).toBeUndefined();
    expect(galleryStep(3, 0, 1)).toBe(1);
    expect(galleryStep(3, 2, 1)).toBeUndefined();
    expect(galleryStep(1, 0, 1)).toBeUndefined();
  });

  it('keys an image by its message and file', () => {
    expect(galleryImageKey('m1', { fileId: 'file:1' })).toBe('m1:file:1');
    expect(galleryImageKey('m1', { hash: 'abc' })).toBe('m1:abc');
  });
});
