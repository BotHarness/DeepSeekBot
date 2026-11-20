import { describe, expect, it, vi } from 'vitest';

import {
  channelAttachmentUrl,
  loadFilesPage,
  parseChannelAttachment,
} from '../src/client/bridge.js';

const fileId = 'file:6a1f3c2e-1b2c-4d3e-8f40-123456789abc';
const owner = { channelId: 'dm-ada', messageId: 'm1' };

describe('versioned media on desktop', () => {
  it('keeps the version, size and placeholder the Host sends', () => {
    expect(
      parseChannelAttachment({
        fileId,
        name: 'p.png',
        mime: 'image/png',
        size: 10,
        version: '0123456789abcdef0123456789abcdef',
        width: 1200,
        height: 800,
        thumbhash: 'abc=',
      }),
    ).toEqual({
      fileId,
      name: 'p.png',
      mime: 'image/png',
      size: 10,
      version: '0123456789abcdef0123456789abcdef',
      width: 1200,
      height: 800,
      thumbhash: 'abc=',
    });
    expect(
      parseChannelAttachment({ fileId, name: 'p.png', mime: 'image/png', size: 10, version: 'x' }),
    ).toEqual({ fileId, name: 'p.png', mime: 'image/png', size: 10 });
  });

  it('asks for the versioned preview and original, and the old URL without a version', () => {
    const ref = { fileId, name: 'p.png', mime: 'image/png', size: 10, version: 'v1' };
    const preview = new URL(channelAttachmentUrl(ref, owner, '800'), 'http://host/');
    expect(preview.searchParams.get('v')).toBe('v1');
    expect(preview.searchParams.get('variant')).toBe('800');
    const original = new URL(channelAttachmentUrl(ref, owner), 'http://host/');
    expect(original.searchParams.get('v')).toBe('v1');
    expect(original.searchParams.has('variant')).toBe(false);
    const legacy = new URL(
      channelAttachmentUrl({ fileId, name: 'p.png', mime: 'image/png', size: 10 }, owner, '800'),
      'http://host/',
    );
    expect(legacy.searchParams.has('v')).toBe(false);
    expect(legacy.searchParams.has('variant')).toBe(false);
  });

  it('reads one bounded page of files with a cursor for older ones', async () => {
    const call = vi.fn(async () => ({
      ok: true,
      value: {
        entries: [
          {
            channelId: 'dm-ada',
            revision: 7,
            message: {
              id: 'm7',
              at: '2026-11-05T00:00:00.000Z',
              author: { kind: 'bot', slug: 'ada' },
              body: '',
              attachments: [{ fileId, name: 'p.png', mime: 'image/png', size: 10 }],
            },
          },
        ],
        nextBefore: 7,
      },
    }));
    const page = await loadFilesPage(call as never, 'dm-ada', { limit: 50 });
    expect(page.nextBefore).toBe(7);
    expect(page.entries[0]!.message.id).toBe('m7');
  });
});
