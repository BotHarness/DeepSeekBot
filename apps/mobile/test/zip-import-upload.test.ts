import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { uploadZip, type ZipImportSource } from '../src/host/zip-import-upload';
import { ZIP_CHUNK_BYTES, type ZipFilePort } from '../src/host/zip-import-file';

function fixture() {
  const bytes = new Uint8Array(ZIP_CHUNK_BYTES + 29).fill(4);
  const source: ZipImportSource = {
    kind: 'zip',
    uploadKey: 'upload:key-123',
    fileId: '12345678-1234-1234-1234-123456789abc',
    fileName: 'bot.zip',
    sha256: createHash('sha256').update(bytes).digest('hex'),
    sizeBytes: bytes.length,
  };
  const close = vi.fn();
  const files: ZipFilePort = {
    pick: async () => source,
    open: async () => ({
      sizeBytes: bytes.length,
      read: async (offset, length) => bytes.slice(offset, offset + length),
      close,
    }),
  };
  const status = (offset: number) => ({
    uploadKey: source.uploadKey,
    sha256: source.sha256,
    sizeBytes: source.sizeBytes,
    offset,
    chunkBytes: ZIP_CHUNK_BYTES,
    expiresAt: Date.now() + 10000,
  });
  return { bytes, source, files, status, close };
}

describe('bounded resumable Zip transport', () => {
  it('resumes at the Host acknowledged offset after a response was lost', async () => {
    const f = fixture();
    const request = vi.fn(async (method: string, args: Record<string, unknown>) => {
      if (method === 'zipUploadBegin') return f.status(ZIP_CHUNK_BYTES);
      expect(args.offset).toBe(ZIP_CHUNK_BYTES);
      expect(Buffer.from(String(args.dataBase64), 'base64')).toEqual(
        Buffer.from(f.bytes.slice(ZIP_CHUNK_BYTES)),
      );
      return f.status(f.bytes.length);
    });
    const progress = vi.fn();
    await uploadZip(f.source, f.files, request, progress);
    expect(request).toHaveBeenCalledTimes(2);
    expect(progress.mock.calls).toEqual([
      [ZIP_CHUNK_BYTES, f.bytes.length],
      [f.bytes.length, f.bytes.length],
    ]);
    expect(f.close).toHaveBeenCalledOnce();
  });

  it('reuploads the same bytes when staging expired', async () => {
    const f = fixture();
    const chunks: Buffer[] = [];
    const request = vi.fn(async (method: string, args: Record<string, unknown>) => {
      if (method === 'zipUploadBegin') return f.status(0);
      const chunk = Buffer.from(String(args.dataBase64), 'base64');
      chunks.push(chunk);
      return f.status(Number(args.offset) + chunk.length);
    });
    await uploadZip(f.source, f.files, request);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(f.bytes));
    expect(chunks.map((chunk) => chunk.length)).toEqual([ZIP_CHUNK_BYTES, 29]);
  });

  it('fails closed on corrupt offsets and releases the file', async () => {
    const f = fixture();
    await expect(uploadZip(f.source, f.files, async () => f.status(1))).rejects.toMatchObject({
      code: 'zip-upload-invalid',
    });
    expect(f.close).toHaveBeenCalledOnce();
  });

  it('does not send a changed local file', async () => {
    const f = fixture();
    const request = vi.fn();
    await expect(
      uploadZip({ ...f.source, sha256: 'a'.repeat(64) }, f.files, request),
    ).rejects.toMatchObject({ code: 'zip-file-changed' });
    expect(request).not.toHaveBeenCalled();
  });
});
