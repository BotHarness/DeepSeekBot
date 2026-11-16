import { openSync, fstatSync, readSync, closeSync } from 'node:fs';

export function readBoundedFileSync(filename, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new RangeError('Invalid file bound');
  const descriptor = openSync(filename, 'r');
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > maxBytes) throw new Error('File exceeds capture bound');
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxBytes + 1));
    const parts = [];
    let total = 0;
    while (total <= maxBytes) {
      const count = readSync(
        descriptor,
        chunk,
        0,
        Math.min(chunk.length, maxBytes + 1 - total),
        null,
      );
      if (count === 0) return Buffer.concat(parts, total);
      total += count;
      if (total > maxBytes) throw new Error('File exceeds capture bound');
      parts.push(Buffer.from(chunk.subarray(0, count)));
    }
    throw new Error('File exceeds capture bound');
  } finally {
    closeSync(descriptor);
  }
}
