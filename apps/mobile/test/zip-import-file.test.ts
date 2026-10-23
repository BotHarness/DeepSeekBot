import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  hashZipFile,
  verifyZipFile,
  zipFile,
  ZIP_CHUNK_BYTES,
  ZIP_MAX_BYTES,
} from '../src/host/zip-import-file';

const file = {
  fileId: '12345678-1234-1234-1234-123456789abc',
  fileName: 'bot.zip',
  sha256: 'a'.repeat(64),
  sizeBytes: 30,
};

describe('retained Zip file identity', () => {
  it('hashes bounded reads with the same digest as a whole file', async () => {
    const bytes = new Uint8Array(ZIP_CHUNK_BYTES * 2 + 37).fill(123);
    const read = vi.fn(async (offset: number, length: number) =>
      bytes.slice(offset, offset + length),
    );
    expect(await hashZipFile({ sizeBytes: bytes.length, read, close() {} })).toBe(
      createHash('sha256').update(bytes).digest('hex'),
    );
    expect(read.mock.calls).toEqual([
      [0, ZIP_CHUNK_BYTES],
      [ZIP_CHUNK_BYTES, ZIP_CHUNK_BYTES],
      [ZIP_CHUNK_BYTES * 2, 37],
    ]);
  });

  it('rejects an oversized file before reading', async () => {
    const read = vi.fn();
    await expect(
      hashZipFile({ sizeBytes: ZIP_MAX_BYTES + 1, read, close() {} }),
    ).rejects.toMatchObject({ code: 'zip-file-too-large' });
    expect(read).not.toHaveBeenCalled();
  });

  it('rejects a changed retained file and closes its handle', async () => {
    const close = vi.fn();
    await expect(
      verifyZipFile(
        {
          pick: async () => null,
          open: async () => ({ sizeBytes: 30, read: async () => new Uint8Array(30), close }),
        },
        file,
      ),
    ).rejects.toMatchObject({ code: 'zip-file-changed' });
    expect(close).toHaveBeenCalledOnce();
  });

  it('rejects truncated reads without hashing a different source', async () => {
    await expect(
      hashZipFile({ sizeBytes: 30, read: async () => new Uint8Array(20), close() {} }),
    ).rejects.toMatchObject({ code: 'zip-file-changed' });
  });

  it('accepts opaque retained IDs and rejects paths and invalid hashes', () => {
    expect(zipFile(file)).toEqual(file);
    expect(() => zipFile({ ...file, fileId: '../secret' })).toThrow();
    expect(() => zipFile({ ...file, sha256: 'bad' })).toThrow();
  });
});
