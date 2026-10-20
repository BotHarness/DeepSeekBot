import type { ResolvedSharePayload } from 'expo-sharing';
import { describe, expect, it, vi } from 'vitest';

const drafts = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    sourceDrafts: {
      ready: Promise.resolve(),
      get: (key: string) => values.get(key) ?? '',
      set: (key: string, value: string) => void values.set(key, value),
    },
  };
});

vi.mock('expo-document-picker', () => ({}));
vi.mock('expo-image-picker', () => ({}));
vi.mock('../src/host/native-source-drafts', () => ({ sourceDrafts: drafts.sourceDrafts }));

const { appendShared, deliverShare, incomingShare, takeSharedFiles } =
  await import('../src/ui/share/incoming-share');
const { isSharePath } = await import('../src/ui/share/share-path');

function payload(overrides: Partial<ResolvedSharePayload>): ResolvedSharePayload {
  return {
    value: '',
    shareType: 'text',
    mimeType: 'text/plain',
    contentUri: null,
    contentType: 'text',
    contentMimeType: null,
    originalName: null,
    contentSize: null,
    ...overrides,
  } as ResolvedSharePayload;
}

describe('share to Bot', () => {
  it('turns shared text and links into draft text and files into attachments', () => {
    const share = incomingShare([
      payload({ value: '  Read this  ' }),
      payload({
        value: 'https://example.com/post',
        shareType: 'url',
        contentUri: 'https://example.com/post',
        contentType: 'website',
      }),
      payload({
        value: 'file:///shared/photo.jpg',
        shareType: 'image',
        contentUri: 'file:///shared/photo.jpg',
        contentType: 'image',
        contentMimeType: 'image/jpeg',
        originalName: 'photo.jpg',
      }),
      payload({
        value: 'file:///shared/notes.pdf',
        shareType: 'file',
        contentUri: 'file:///shared/notes.pdf',
        contentType: 'file',
        contentMimeType: 'application/pdf',
      }),
    ]);
    expect(share.text).toBe('Read this\nhttps://example.com/post');
    expect(share.files.map(({ kind, name, uri }) => ({ kind, name, uri }))).toEqual([
      { kind: 'image', name: 'photo.jpg', uri: 'file:///shared/photo.jpg' },
      {
        kind: 'file',
        name: expect.stringMatching(/^shared-\d+\.pdf$/u),
        uri: 'file:///shared/notes.pdf',
      },
    ]);
  });

  it('names a shared file after its type when the gallery gives only a media id', () => {
    const share = incomingShare([
      payload({
        value: 'content://media/1000044168',
        shareType: 'image',
        contentUri: 'content://media/1000044168',
        contentType: 'image',
        contentMimeType: 'image/jpeg',
        originalName: '1000044168',
      }),
    ]);
    expect(share.files[0]?.name).toMatch(/^shared-\d+\.jpe?g$/u);
  });

  it('caps attachments at the composer limit', () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      payload({
        value: `file:///shared/${index}.png`,
        shareType: 'image',
        contentUri: `file:///shared/${index}.png`,
        contentType: 'image',
        contentMimeType: 'image/png',
      }),
    );
    expect(incomingShare(many).files).toHaveLength(10);
  });

  it('adds shared text below an unsent draft', () => {
    expect(appendShared('', 'link')).toBe('link');
    expect(appendShared('my note  \n', 'link')).toBe('my note\nlink');
    expect(appendShared('my note', '')).toBe('my note');
  });

  it('hands the text to the chat draft and the files to the next chat screen once', async () => {
    drafts.values.set('dm', 'hello');
    const share = incomingShare([
      payload({ value: 'shared' }),
      payload({
        value: 'file:///a.png',
        shareType: 'image',
        contentUri: 'file:///a.png',
        contentType: 'image',
        contentMimeType: 'image/png',
      }),
    ]);
    await deliverShare('dm', share);
    expect(drafts.values.get('dm')).toBe('hello\nshared');
    expect(takeSharedFiles('dm').map((file) => file.uri)).toEqual(['file:///a.png']);
    expect(takeSharedFiles('dm')).toEqual([]);
  });

  it('recognizes the share deep link in every form the system hands over', () => {
    expect(isSharePath('deepseekbot-dev://expo-sharing')).toBe(true);
    expect(isSharePath('deepseekbot://expo-sharing?x=1')).toBe(true);
    expect(isSharePath('/expo-sharing')).toBe(true);
    expect(isSharePath('expo-sharing')).toBe(true);
    expect(isSharePath('/dm/expo-sharing')).toBe(false);
    expect(isSharePath('deepseekbot://expo-sharing-other')).toBe(false);
  });
});
