// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  attachmentReferenceText,
  attachmentReferenceRuns,
  insertAttachmentReferences,
  removeAttachmentReferences,
  deleteAttachmentReference,
  attachmentReferenceLabels,
} from '../src/client/attachment-refs.js';

const first = { id: 'first', file: new File(['image'], 'image.png'), status: 'uploading' as const };
const second = { ...first, id: 'second' };

describe('attachment-backed inline references', () => {
  it('inserts at the selected caret and distinguishes identical filenames', () => {
    const inserted = insertAttachmentReferences('before after', [first, second], {
      start: 7,
      end: 7,
    });
    expect(inserted.value).toBe(
      `before ${attachmentReferenceText(first)} ${attachmentReferenceText(second)} after`,
    );
    expect(inserted.value.slice(inserted.caret)).toBe('after');
    expect(
      attachmentReferenceRuns(inserted.value, [first, second])
        .filter((run) => run.attachment)
        .map((run) => run.attachment?.id),
    ).toEqual(['first', 'second']);
  });

  it('retains the same identity after upload and when restoring a failed message', () => {
    const ready = {
      ...first,
      status: 'ready' as const,
      ref: { fileId: 'file:first', name: 'image.png', mime: 'image/png', size: 5 },
    };
    expect(attachmentReferenceText(ready)).toBe(attachmentReferenceText(first));
    expect(attachmentReferenceText({ ...ready, id: 'restored' })).toBe(
      attachmentReferenceText(first),
    );
  });

  it('does not activate unattached IDs or a bare filename', () => {
    const value = `image.png ${attachmentReferenceText(second)}`;
    expect(attachmentReferenceRuns(value, [first])).toEqual([
      { text: value, start: 0, end: value.length },
    ]);
  });

  it('uses the canonical file name after rename and keeps malformed or foreign references inert', () => {
    const ref = { fileId: 'file:first', name: 'renamed.txt', mime: 'text/plain', size: 5 };
    const value = `${attachmentReferenceText(first)} [invalid](attachment:%ZZ) ${attachmentReferenceText(second)}`;
    expect(attachmentReferenceLabels(value, [ref])).toBe(
      `renamed.txt [invalid](attachment:%ZZ) ${attachmentReferenceText(second)}`,
    );
    expect(
      attachmentReferenceRuns(value, [
        { ...first, file: { name: ref.name, size: ref.size }, ref },
      ]).filter((run) => run.attachment),
    ).toHaveLength(1);
  });

  it('escapes markdown delimiters and removes every reference only to the selected attachment', () => {
    const unusual = { ...first, file: new File(['text'], '[report]\\draft\n.txt') };
    expect(attachmentReferenceText(unusual)).toBe(
      '[\\[report\\]\\\\draft .txt](attachment:file%3Afirst)',
    );
    const value = [first, second, first].map(attachmentReferenceText).join(' ');
    expect(removeAttachmentReferences(value, first).value).toBe(
      ` ${attachmentReferenceText(second)} `,
    );
  });

  it('retains mentions between repeated references when removing the file', () => {
    const token = attachmentReferenceText(first);
    const value = `${token} @Ada ${token} #Planning`;
    const start = token.length + 1;
    const groupStart = value.indexOf('#Planning');
    const next = removeAttachmentReferences(
      value,
      first,
      [{ botSlug: 'ada', label: 'Ada', start, end: start + 4 }],
      [{ channelId: 'planning', label: 'Planning', start: groupStart, end: value.length }],
    );
    expect(next).toEqual({
      value: ' @Ada  #Planning',
      mentions: [{ botSlug: 'ada', label: 'Ada', start: 1, end: 5 }],
      channelRefs: [{ channelId: 'planning', label: 'Planning', start: 7, end: 16 }],
    });
  });

  it.each(['Backspace', 'Delete'] as const)(
    'deletes a chip atomically with %s without removing its file',
    (key) => {
      const text = attachmentReferenceText(first);
      const value = `use ${text} now`;
      const caret = key === 'Backspace' ? 4 + text.length : 4;
      expect(deleteAttachmentReference(value, [first], { start: caret, end: caret }, key)).toEqual({
        value: 'use now',
        caret: 4,
      });
      expect(deleteAttachmentReference(value, [first], { start: 0, end: 0 }, key)).toBeUndefined();
    },
  );
});
