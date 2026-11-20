import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { basename, extname, resolve } from 'node:path';

const [first, ...rest] = process.argv.slice(2);
const games = first === '--games';
const sources = (games ? rest : process.argv.slice(2)).toSorted();
const expectedCount = games ? 108 : 36;
const byteBudget = games ? 1600 * 1024 : 640 * 1024;
const output = games ? 'tilties-games.json' : 'tilties.json';
if (sources.length !== expectedCount) {
  throw new Error(`Expected ${expectedCount} portraits, got ${sources.length}.`);
}
const portraits = {};
let totalBytes = 0;
for (const source of sources) {
  const id = basename(source, extname(source));
  if (!/^[a-z][a-z0-9-]+$/u.test(id) || Object.hasOwn(portraits, id)) {
    throw new Error(`Expected a unique kebab-case filename, got ${source}.`);
  }
  const image = execFileSync(
    'cwebp',
    [
      '-quiet',
      '-sharp_yuv',
      '-resize',
      '512',
      '512',
      '-q',
      '80',
      '-m',
      '6',
      '-metadata',
      'none',
      resolve(source),
      '-o',
      '-',
    ],
    { shell: false, windowsHide: true },
  );
  if (image.length > 24 * 1024) throw new Error(`${id} exceeds the 24 KiB image budget.`);
  totalBytes += image.length;
  portraits[id] = image.toString('base64');
}

if (totalBytes > byteBudget) {
  throw new Error(
    `Expected ${expectedCount} portraits within ${byteBudget} bytes, got ${totalBytes} bytes.`,
  );
}
const ordered = Object.fromEntries(
  Object.entries(portraits).toSorted(([left], [right]) => left.localeCompare(right, 'en')),
);
await writeFile(
  new URL(`../packages/host-client/assets/${output}`, import.meta.url),
  `${JSON.stringify(ordered, null, 2)}\n`,
);
process.stdout.write(
  `Wrote ${expectedCount} Tilties portraits (512 × 512, ${totalBytes} bytes total).\n`,
);
