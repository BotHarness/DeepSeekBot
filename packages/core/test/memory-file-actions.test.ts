import { createTestRegistry } from './registry-fixture.js';
import { mkdirSync, realpathSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { createMemoryService } from '../src/memory/service.js';
import { createMemoryFileHttp, MEMORY_FILE_DOWNLOAD_PATH } from '../src/memory/file-http.js';
import { createTempRoot, createTestOwnership } from './helpers.js';

function setup() {
  const root = createTempRoot();
  const registry = createTestRegistry({ rootDir: join(root, 'bots') });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  expect(registry.create({ slug: 'other', displayName: 'Other' }).ok).toBe(true);
  const memory = createMemoryService({ registry, ownership: createTestOwnership() });
  const dir = realpathSync(registry.memoryDirFor('ada')!);
  mkdirSync(join(dir, 'Project notes'), { recursive: true });
  writeFileSync(join(dir, 'Project notes', '你好 world.txt'), 'original bytes');
  const http = createMemoryFileHttp(memory);
  const get = (path: string, slug = 'ada') =>
    http(
      new Request(
        'http://host' + MEMORY_FILE_DOWNLOAD_PATH + '?' + new URLSearchParams({ slug, path }),
      ),
    );
  return { root, registry, memory, dir, get, http };
}

describe('current Memory files', () => {
  it('resolves root, nested directory and Unicode file only within the selected owner', () => {
    const { memory, dir, registry } = setup();
    expect(memory.fileTarget('ada', '')).toEqual({
      path: dir,
      relativePath: '',
      kind: 'directory',
    });
    expect(memory.fileTarget('ada', 'Project notes').kind).toBe('directory');
    expect(memory.fileTarget('ada', 'Project notes/你好 world.txt').path).toBe(
      join(dir, 'Project notes/你好 world.txt'),
    );
    expect(() => memory.fileTarget('other', 'Project notes/你好 world.txt')).toThrow('missing');
    expect(() => memory.fileTarget('ada', registry.memoryDirFor('other')!)).toThrow('relative');
    expect(() => memory.fileTarget('absent', '')).toThrow('Unknown');
  });
  it('refuses traversal, reserved paths, escaping links and links into .git', async () => {
    const { dir, root, get } = setup();
    mkdirSync(join(dir, '.git'), { recursive: true });
    writeFileSync(join(dir, '.git', 'config'), 'private');
    writeFileSync(join(root, 'outside.txt'), 'outside');
    symlinkSync(join(root, 'outside.txt'), join(dir, 'escape.txt'));
    symlinkSync(join(dir, '.git'), join(dir, 'git-link'));
    for (const path of [
      '../outside.txt',
      '.git/config',
      'a/../x',
      'escape.txt',
      'git-link/config',
      '/etc/passwd',
      'a\0b',
    ]) {
      expect((await get(path)).status, path).toBe(400);
    }
  });
  it('streams binary and oversized current bytes with a safe Unicode filename', async () => {
    const { dir, get } = setup();
    // Windows rejects `"` in file names; keep the Unicode + spaces coverage with a legal name.
    const fileName = process.platform === 'win32' ? '你好 large.bin' : '你好 "large".bin';
    const name = `Project notes/${fileName}`;
    const bytes = Buffer.alloc(5 * 1024 * 1024 + 7, 0xa5);
    bytes[0] = 0;
    bytes[1] = 255;
    writeFileSync(join(dir, name), bytes);
    const response = await get(name);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-length')).toBe(String(bytes.length));
    expect(response.headers.get('content-type')).toBe('application/octet-stream');
    expect(response.headers.get('content-disposition')).toContain(
      "filename*=UTF-8''" + encodeURIComponent(fileName),
    );
    expect(response.headers.get('content-disposition')).not.toContain('Project notes/');
    const received = Buffer.from(await response.arrayBuffer());
    expect(received.length).toBe(bytes.length);
    expect(received.equals(bytes)).toBe(true);
    writeFileSync(join(dir, name), 'external save');
    expect(await (await get(name)).text()).toBe('external save');
  });
  it('rejects directories, missing files and missing owners, and releases cancelled transfers', async () => {
    const { get, memory, dir } = setup();
    expect((await get('')).status).toBe(400);
    expect((await get('Project notes')).status).toBe(400);
    expect((await get('missing')).status).toBe(404);
    expect((await get('', 'absent')).status).toBe(404);
    const source = memory.downloadFile('ada', 'Project notes/你好 world.txt');
    await source.body.cancel();
    rmSync(join(dir, 'Project notes/你好 world.txt'));
    expect((await get('Project notes/你好 world.txt')).status).toBe(404);
  });
});
