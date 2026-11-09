import { describe, expect, it } from 'vitest';

import type { ChannelAttachmentRef } from '../src/attachments/ref.js';
import { isChannelMessage, type ChannelMessage } from '../src/channels/channel.js';
import {
  isChannelReplyPreviewMedia,
  replyPreviewMedia,
  replyPreviewOf,
} from '../src/channels/reply-preview.js';

const fileId = (n: number) => `file:00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const image = (n: number, extra: Partial<ChannelAttachmentRef> = {}): ChannelAttachmentRef =>
  ({
    fileId: fileId(n),
    name: `photo-${n}.jpg`,
    mime: 'image/jpeg',
    size: 1000 + n,
    ...extra,
  }) as ChannelAttachmentRef;
const pdf: ChannelAttachmentRef = {
  fileId: fileId(90),
  name: 'Q3 report.pdf',
  mime: 'application/pdf',
  size: 2048,
};
const sheet: ChannelAttachmentRef = {
  fileId: fileId(91),
  name: 'budget.xlsx',
  mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  size: 4096,
};
const audio: ChannelAttachmentRef = {
  fileId: fileId(92),
  name: 'voice.mp3',
  mime: 'audio/mpeg',
  size: 9000,
};

const message = (fields: Partial<ChannelMessage> = {}): ChannelMessage => ({
  id: 'target',
  at: '2026-11-09T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Look at this',
  ...fields,
});

describe('reply preview media hint', () => {
  it('leaves a text-only message without a media hint', () => {
    expect(replyPreviewMedia(message())).toBeUndefined();
    expect(replyPreviewOf(message({ body: '  Plain\n\ntext  ' }))).toEqual({
      author: { kind: 'bot', slug: 'ada' },
      body: 'Plain text',
    });
  });

  it('describes images with their count and the first image as the thumbnail', () => {
    const first = image(1, { width: 1200, height: 900, thumbhash: 'abc', version: 'v1' });
    const preview = replyPreviewOf(
      message({ body: '', attachments: [first, image(2), image(3), pdf] }),
    );
    expect(preview).toEqual({
      author: { kind: 'bot', slug: 'ada' },
      body: '',
      media: { kind: 'image', count: 3, thumbnail: first },
    });
  });

  it('describes a ready voice message with its duration even when it carries a transcript', () => {
    const voiceFile = { ...audio, name: 'voice.ogg', mime: 'audio/ogg' };
    expect(
      replyPreviewOf(
        message({
          body: 'Spoken transcript',
          attachments: [voiceFile],
          voice: { state: 'ready', attachment: voiceFile.fileId!, durationMs: 7200 },
        }),
      ),
    ).toEqual({
      author: { kind: 'bot', slug: 'ada' },
      body: 'Spoken transcript',
      media: { kind: 'voice', durationMs: 7200 },
    });
  });

  it('ignores a voice that is still pending or failed', () => {
    expect(replyPreviewMedia(message({ voice: { state: 'pending' } }))).toBeUndefined();
    expect(
      replyPreviewMedia(message({ voice: { state: 'failed', code: 'nothing-to-say' } })),
    ).toBeUndefined();
  });

  it('describes files with the first file name and the file count', () => {
    expect(replyPreviewMedia(message({ attachments: [pdf, sheet, audio] }))).toEqual({
      kind: 'file',
      name: 'Q3 report.pdf',
      count: 3,
    });
  });

  it('describes bridged media without a Host thumbnail', () => {
    const bridged = (fields: Partial<ChannelMessage>) =>
      message({ author: { kind: 'bridged', source: 'lark' }, body: '', ...fields });
    expect(
      replyPreviewMedia(
        bridged({
          bridgeMedia: {
            items: [
              { id: 'a', kind: 'image', name: 'a.png' },
              { id: 'b', kind: 'image', name: 'b.png' },
            ],
          },
        }),
      ),
    ).toEqual({ kind: 'image', count: 2 });
    expect(
      replyPreviewMedia(
        bridged({
          bridgeMedia: {
            voice: { transcript: 'unavailable', durationMs: 3000 },
            items: [{ id: 'v', kind: 'audio', name: 'voice.opus' }],
          },
        }),
      ),
    ).toEqual({ kind: 'voice', durationMs: 3000 });
    expect(
      replyPreviewMedia(
        bridged({ bridgeMedia: { items: [{ id: 'f', kind: 'file', name: 'notes.docx' }] } }),
      ),
    ).toEqual({ kind: 'file', name: 'notes.docx', count: 1 });
  });

  it('lets the store project the thumbnail to its current file version', () => {
    const preview = replyPreviewOf(message({ attachments: [image(1)] }), (ref) => ({
      ...ref,
      version: 'current',
    }));
    expect(preview.media).toEqual({
      kind: 'image',
      count: 1,
      thumbnail: { ...image(1), version: 'current' },
    });
  });

  it('accepts only well-formed media hints', () => {
    expect(isChannelReplyPreviewMedia({ kind: 'image', count: 2, thumbnail: image(1) })).toBe(true);
    expect(isChannelReplyPreviewMedia({ kind: 'image', count: 1 })).toBe(true);
    expect(isChannelReplyPreviewMedia({ kind: 'voice' })).toBe(true);
    expect(isChannelReplyPreviewMedia({ kind: 'voice', durationMs: 7000 })).toBe(true);
    expect(isChannelReplyPreviewMedia({ kind: 'file', name: 'a.pdf', count: 1 })).toBe(true);
    for (const bad of [
      null,
      'image',
      { kind: 'video' },
      { kind: 'image', count: 0 },
      { kind: 'image', count: 1, thumbnail: { name: 'x' } },
      { kind: 'voice', durationMs: -1 },
      { kind: 'file', name: '', count: 1 },
      { kind: 'file', name: 'a.pdf' },
    ])
      expect(isChannelReplyPreviewMedia(bad)).toBe(false);
  });

  it('keeps messages valid whatever media hint a newer Host sends', () => {
    const reply = (media: unknown) =>
      ({
        ...message({ id: 'reply', replyTo: 'target' }),
        replyToPreview: { author: { kind: 'human' }, body: '', media },
      }) as unknown;
    expect(isChannelMessage(reply({ kind: 'voice', durationMs: 7000 }))).toBe(true);
    expect(isChannelMessage(reply({ kind: 'video' }))).toBe(true);
  });
});
