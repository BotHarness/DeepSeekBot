import { beforeEach, expect, it, vi } from 'vitest';
import { shareAttachment } from '../src/host/share-attachment';
import type { MessageAttachment } from '../src/host/conversation';

const native = vi.hoisted(() => ({ download: vi.fn(), share: vi.fn(), write: vi.fn() }));
vi.mock('expo-sharing', () => ({ shareAsync: native.share }));
vi.mock('expo-file-system', () => ({
  Paths: { cache: 'file:///cache/' },
  Directory: class {
    create() {}
  },
  File: class {
    uri = 'file:///cache/report.pdf';
    write = native.write;
    static downloadFileAsync = native.download;
  },
}));

const attachment: MessageAttachment = {
  key: 'computer:channel:message:0',
  kind: 'file',
  name: 'report.pdf',
  mime: 'application/pdf',
  local: false,
  source: {
    uri: 'https://computer.test/attachment?fileId=original',
    headers: { authorization: 'Device test-only' },
  },
};
beforeEach(() => {
  vi.clearAllMocks();
  native.download.mockResolvedValue({ uri: 'file:///cache/report.pdf' });
});

it('shares only the downloaded exact attachment, retaining its authenticated source', async () => {
  await shareAttachment(attachment);
  expect(native.download).toHaveBeenCalledWith(attachment.source!.uri, expect.anything(), {
    headers: attachment.source!.headers,
    idempotent: true,
  });
  expect(native.share).toHaveBeenCalledWith('file:///cache/report.pdf', {
    dialogTitle: 'report.pdf',
    mimeType: 'application/pdf',
  });
});

it('never opens the native share sheet after access is revoked during download', async () => {
  let available = true;
  native.download.mockImplementation(async () => {
    available = false;
    return { uri: 'file:///cache/report.pdf' };
  });
  await expect(shareAttachment(attachment, () => available)).rejects.toThrow(
    'attachment-unavailable',
  );
  expect(native.share).not.toHaveBeenCalled();
});

it('uses the encrypted carrier resource reader and refuses a file with no source', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  await shareAttachment({
    ...attachment,
    source: {
      uri: 'private-resource',
      headers: {},
      read: async () => ({ bytes, mime: 'application/pdf' }),
    },
  });
  expect(native.write).toHaveBeenCalledWith(bytes);
  expect(native.download).not.toHaveBeenCalled();
  const { source: _source, ...missing } = attachment;
  await expect(shareAttachment(missing)).rejects.toThrow('attachment-unavailable');
});
