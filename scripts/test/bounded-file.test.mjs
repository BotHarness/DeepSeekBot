import nativeFs, { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { readBoundedFileSync } from '../bounded-file.mjs';
const homes = [];
afterEach(() => {
  for (const home of homes.splice(0)) rmSync(home, { recursive: true, force: true });
});
function fixture(bytes) {
  const home = mkdtempSync(join(tmpdir(), 'bh-bounded-capture-'));
  homes.push(home);
  const filename = join(home, 'capture');
  writeFileSync(filename, bytes);
  return filename;
}
it('preserves bytes at the capture limit', () => {
  const bytes = Buffer.from('bounded');
  expect(readBoundedFileSync(fixture(bytes), bytes.length)).toEqual(bytes);
});
it('refuses oversized input before reading and closes its descriptor', () => {
  const filename = fixture(Buffer.alloc(100));
  const read = vi.spyOn(nativeFs, 'readSync'),
    close = vi.spyOn(nativeFs, 'closeSync');
  syncBuiltinESMExports();
  try {
    expect(() => readBoundedFileSync(filename, 8)).toThrow('capture bound');
    expect(read).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  } finally {
    read.mockRestore();
    close.mockRestore();
    syncBuiltinESMExports();
  }
});
it('caps actual I/O at limit plus one when the file grows after descriptor inspection', () => {
  const filename = fixture(Buffer.from('ok'));
  const actualStat = nativeFs.fstatSync;
  let auditedDescriptor;
  const stat = vi.spyOn(nativeFs, 'fstatSync').mockImplementation((descriptor) => {
    auditedDescriptor = descriptor;
    const result = actualStat(descriptor);
    appendFileSync(filename, Buffer.alloc(100));
    return result;
  });
  const read = vi.spyOn(nativeFs, 'readSync'),
    close = vi.spyOn(nativeFs, 'closeSync');
  syncBuiltinESMExports();
  try {
    expect(() => readBoundedFileSync(filename, 8)).toThrow('capture bound');
    expect(read.mock.results.reduce((bytes, result) => bytes + Number(result.value), 0)).toBe(9);
    expect(
      close.mock.calls.filter(([descriptor]) => descriptor === auditedDescriptor),
    ).toHaveLength(1);
  } finally {
    stat.mockRestore();
    read.mockRestore();
    close.mockRestore();
    syncBuiltinESMExports();
  }
});
