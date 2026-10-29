import { existsSync, mkdirSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createAttachmentStore } from '../src/attachments/store.js';
import {
  STAGED_UPLOAD_GRACE_MS,
  UNREFERENCED_ATTACHMENT_GRACE_MS,
  sweepAttachments,
} from '../src/attachments/sweep.js';
import { mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot } from './helpers.js';

const cleanup: Array<() => void> = [];
afterEach(() => {
  for (const close of cleanup.splice(0)) close();
});

async function fixture() {
  const home = realpathSync(createTempRoot('bh-attachment-sweep-'));
  const database = mountOperationalDatabase({
    dshHome: home,
    schemaPlan: BOT_HARNESS_SCHEMA_PLAN,
  });
  cleanup.push(() => {
    database.close();
    rmSync(home, { recursive: true, force: true });
  });
  const rootDir = join(home, 'attachments');
  const attachments = createAttachmentStore({ rootDir });
  const upload = (name: string) =>
    attachments.upload({
      data: (async function* () {
        yield Buffer.from(name);
      })(),
      name,
    });
  const kept = await upload('kept.png');
  const orphan = await upload('orphan.png');
  const dir = (fileId: string) => join(rootDir, 'files', fileId.slice(5));
  return { database, attachments, rootDir, kept, orphan, dir };
}

describe('attachment sweep', () => {
  it('removes only unreferenced files past the grace period', async () => {
    const f = await fixture();
    const options = {
      attachments: f.attachments,
      database: f.database,
      channelReferences: () => [f.kept.fileId!],
      memoryReferences: () => [],
    };

    expect(await sweepAttachments(options)).toEqual({
      staged: 0,
      unreferenced: 0,
    });
    expect(existsSync(f.dir(f.orphan.fileId!))).toBe(true);

    const later = new Date(Date.now() + UNREFERENCED_ATTACHMENT_GRACE_MS + 60_000);
    expect(await sweepAttachments({ ...options, now: later })).toEqual({
      staged: 0,
      unreferenced: 1,
    });
    expect(existsSync(f.dir(f.kept.fileId!))).toBe(true);
    expect(existsSync(f.dir(f.orphan.fileId!))).toBe(false);
  });

  it('keeps files Memory still names', async () => {
    const f = await fixture();
    const later = new Date(Date.now() + UNREFERENCED_ATTACHMENT_GRACE_MS + 60_000);
    await sweepAttachments({
      attachments: f.attachments,
      database: f.database,
      channelReferences: () => [f.kept.fileId!],
      memoryReferences: () => [f.orphan.fileId!],
      now: later,
    });
    expect(existsSync(f.dir(f.orphan.fileId!))).toBe(true);
  });

  it('deletes nothing when the reference set cannot be read', async () => {
    const f = await fixture();
    const later = new Date(Date.now() + UNREFERENCED_ATTACHMENT_GRACE_MS + 60_000);
    await expect(
      sweepAttachments({
        attachments: f.attachments,
        database: f.database,
        channelReferences: () => [],
        memoryReferences: () => {
          throw new Error('Memory erasure is incomplete');
        },
        now: later,
      }),
    ).rejects.toThrow('Memory erasure is incomplete');
    expect(existsSync(f.dir(f.kept.fileId!))).toBe(true);
    expect(existsSync(f.dir(f.orphan.fileId!))).toBe(true);
  });

  it('removes interrupted uploads after a day', async () => {
    const f = await fixture();
    const staging = join(f.rootDir, 'staging');
    mkdirSync(staging, { recursive: true });
    const part = join(staging, '00000000-0000-4000-8000-000000000000.part');
    writeFileSync(part, 'partial');
    const old = new Date(Date.now() - STAGED_UPLOAD_GRACE_MS - 60_000);
    utimesSync(part, old, old);
    const result = await sweepAttachments({
      attachments: f.attachments,
      database: f.database,
      channelReferences: () => [f.kept.fileId!, f.orphan.fileId!],
      memoryReferences: () => [],
    });
    expect(result.staged).toBe(1);
    expect(existsSync(part)).toBe(false);
  });
});
