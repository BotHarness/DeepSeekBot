import { createHash, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  createBotZipUploads,
  BOT_ZIP_UPLOAD_CHUNK_BYTES,
  BOT_ZIP_UPLOAD_TTL_MS,
} from '../src/bots/zip-upload.js';
import { writeZip } from '../src/bots/zip-archive.js';
import { createTempRoot } from './helpers.js';

function source(archive: Buffer, uploadKey = 'upload-recovery-001') {
  return {
    uploadKey,
    sha256: createHash('sha256').update(archive).digest('hex'),
    sizeBytes: archive.length,
  };
}

describe('Bot Zip upload', () => {
  it('recovers an acknowledged chunk after restart and returns exactly the uploaded archive', () => {
    const rootDir = createTempRoot();
    const archive = writeZip([{ path: 'notes.bin', data: randomBytes(300_000) }]);
    const input = source(archive);
    const first = createBotZipUploads({ rootDir });
    expect(first.begin(input).offset).toBe(0);
    const chunk = {
      ...input,
      offset: 0,
      dataBase64: archive.subarray(0, BOT_ZIP_UPLOAD_CHUNK_BYTES).toString('base64'),
    };
    first.chunk(chunk);
    const restarted = createBotZipUploads({ rootDir });
    expect(restarted.begin(input).offset).toBe(262_144);
    expect(restarted.chunk(chunk).offset).toBe(262_144);
    expect(() => restarted.read(input)).toThrow('upload-incomplete');
    restarted.chunk({
      ...input,
      offset: 262_144,
      dataBase64: archive.subarray(262_144).toString('base64'),
    });
    expect(restarted.read(input)).toEqual(archive);
  });

  it('refuses a changed source, reordered chunks and conflicting retries', () => {
    const archive = writeZip([{ path: 'notes.bin', data: randomBytes(300_000) }]);
    const input = source(archive);
    const uploads = createBotZipUploads({ rootDir: createTempRoot() });
    uploads.begin(input);
    expect(() => uploads.begin({ ...input, sha256: '0'.repeat(64) })).toThrow(
      'upload-key-conflict',
    );
    expect(() =>
      uploads.chunk({
        ...input,
        offset: 262_144,
        dataBase64: archive.subarray(262_144).toString('base64'),
      }),
    ).toThrow('upload-offset-conflict');
    uploads.chunk({
      ...input,
      offset: 0,
      dataBase64: archive.subarray(0, 262_144).toString('base64'),
    });
    expect(() =>
      uploads.chunk({ ...input, offset: 0, dataBase64: Buffer.alloc(262_144).toString('base64') }),
    ).toThrow('upload-chunk-conflict');
    expect(() => uploads.chunk({ ...input, offset: 1, dataBase64: 'YQ==' })).toThrow(
      'invalid-upload-chunk',
    );
    expect(() =>
      uploads.chunk({ ...input, offset: 262_144, dataBase64: 'a'.repeat(349_529) }),
    ).toThrow('invalid-upload-chunk');
  });

  it('checks the complete digest before releasing archive bytes', () => {
    const archive = writeZip([{ path: 'SOUL.md', data: Buffer.from('Ada') }]);
    const input = { ...source(archive), sha256: '0'.repeat(64) };
    const uploads = createBotZipUploads({ rootDir: createTempRoot() });
    uploads.begin(input);
    uploads.chunk({ ...input, offset: 0, dataBase64: archive.toString('base64') });
    expect(() => uploads.read(input)).toThrow('upload-hash-mismatch');
  });

  it('bounds reservations across restart and releases expired transfers for an explicit restart', () => {
    const rootDir = createTempRoot();
    let time = 1_000;
    const makeUploads = () => createBotZipUploads({ rootDir, now: () => time });
    const input = {
      uploadKey: 'large-upload-001',
      sha256: '0'.repeat(64),
      sizeBytes: 100 * 1024 * 1024,
    };
    const uploads = makeUploads();
    for (let index = 0; index < 4; index += 1)
      uploads.begin({ ...input, uploadKey: `large-upload-${index}` });
    expect(() => makeUploads().begin(input)).toThrow('upload-capacity');
    time += BOT_ZIP_UPLOAD_TTL_MS;
    expect(() => makeUploads().read({ ...input, uploadKey: 'large-upload-0' })).toThrow(
      'upload-expired',
    );
    expect(makeUploads().begin({ ...input, uploadKey: 'large-upload-0' }).offset).toBe(0);
    for (let index = 1; index < 8; index += 1)
      makeUploads().begin({ ...input, sizeBytes: 22, uploadKey: `small-upload-${index}` });
    expect(() => makeUploads().begin({ ...input, sizeBytes: 22 })).toThrow('upload-capacity');
    expect(() => makeUploads().begin({ ...input, uploadKey: '../outside' })).toThrow(
      'invalid-upload',
    );
  });
});
