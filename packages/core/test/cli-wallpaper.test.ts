import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import { runWallpaperCommand } from '../src/bots/cli-wallpaper.js';
const io = { env: {}, stdout: () => {}, stderr: () => {} };
describe('directed wallpaper CLI', () => {
  it('requires a Client and revision before reading or connecting', async () => {
    const connect = vi.fn();
    await expect(
      runWallpaperCommand(
        'wallpaper-import',
        [],
        { 'client-id': 'one', file: 'missing' },
        io,
        connect,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(runWallpaperCommand('wallpaper-get', [], {}, io, connect)).rejects.toMatchObject({
      code: 'usage',
    });
    expect(connect).not.toHaveBeenCalled();
  });
  it('reads CLI-local bytes and sends ordered bounded chunks, returning only the Client acknowledgment', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'wallpaper-cli-'));
    try {
      const bytes = Buffer.alloc(450000, 7);
      writeFileSync(join(dir, 'image.data'), bytes);
      let offset = 0;
      const received: Buffer[] = [];
      const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => {
        expect(body!.clientId).toBe('one');
        expect(body!.expectedRevision).toBe('empty');
        const op = body!.wallpaper as Record<string, unknown>;
        let reply: unknown = { wallpaper: { revision: 'saved' } };
        if (op.action === 'begin') reply = { uploadId: 'receipt', offset: 0 };
        if (op.action === 'append') {
          expect(op.offset).toBe(offset);
          const part = Buffer.from(String(op.data), 'base64');
          expect(part.length).toBeLessThanOrEqual(192 * 1024);
          received.push(part);
          offset += part.length;
          reply = { offset };
        }
        return { bytes: new TextEncoder().encode(JSON.stringify(reply)) };
      });
      const result = await runWallpaperCommand(
        'wallpaper-import',
        [],
        { 'client-id': 'one', 'expected-revision': 'empty', file: join(dir, 'image.data') },
        io,
        async () => ({ http }),
      );
      expect(Buffer.concat(received)).toEqual(bytes);
      expect(result).toEqual({ wallpaper: { revision: 'saved' } });
      expect(JSON.stringify(http.mock.calls)).not.toContain(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('selects, deletes and rotates library items with bounded options', async () => {
    const bodies: Record<string, unknown>[] = [];
    const http = vi.fn(async (_path: string, body?: Record<string, unknown>) => {
      bodies.push(body!.wallpaper as Record<string, unknown>);
      return { bytes: new TextEncoder().encode('{"wallpaper":{}}') };
    });
    const connect = async () => ({ http });
    const base = { 'client-id': 'one', 'expected-revision': 'r1' };
    await runWallpaperCommand(
      'wallpaper-select',
      [],
      { ...base, 'wallpaper-item': 'a' },
      io,
      connect,
    );
    await runWallpaperCommand(
      'wallpaper-select',
      [],
      { ...base, 'wallpaper-item': 'none' },
      io,
      connect,
    );
    await runWallpaperCommand(
      'wallpaper-remove',
      [],
      { ...base, 'wallpaper-item': 'b' },
      io,
      connect,
    );
    await runWallpaperCommand(
      'wallpaper-rotation',
      [],
      { ...base, 'patch-stdin': true },
      { ...io, readStdin: async () => '{"interval":300000,"shuffle":true}' },
      connect,
    );
    expect(bodies).toEqual([
      { action: 'select', item: 'a' },
      { action: 'select' },
      { action: 'remove', item: 'b' },
      { action: 'rotation', interval: 300000, shuffle: true },
    ]);
    const refused = vi.fn();
    await expect(
      runWallpaperCommand('wallpaper-select', [], base, io, refused),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      runWallpaperCommand(
        'wallpaper-get',
        [],
        { 'client-id': 'one', 'wallpaper-item': 'a' },
        io,
        refused,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    await expect(
      runWallpaperCommand(
        'wallpaper-rotation',
        [],
        { ...base, 'patch-stdin': true },
        { ...io, readStdin: async () => '{"speed":1}' },
        refused,
      ),
    ).rejects.toMatchObject({ code: 'usage' });
    expect(refused).not.toHaveBeenCalled();
  });
});
