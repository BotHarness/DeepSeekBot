import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { join, resolve, relative, sep, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { zstdDecompressSync } from 'node:zlib';

const home = resolve(process.argv[2] ?? '');
if (process.argv.length !== 3)
  throw new Error('Usage: node scripts/scan-private-input-evidence.mjs <isolated-DSH_HOME>');
const canaries = process.env.BOTHARNESS_PRIVATE_CANARY_FILE
  ? JSON.parse(readFileSync(process.env.BOTHARNESS_PRIVATE_CANARY_FILE, 'utf8'))
  : [
      'SYNTHETIC-1380-key-A',
      'SYNTHETIC-1380-secret-A',
      'SYNTHETIC-1380-url-A',
      'http://127.0.0.1:31381/status?marker=SYNTHETIC-1380-url-A',
    ];
if (
  !Array.isArray(canaries) ||
  canaries.length === 0 ||
  canaries.length > 32 ||
  !canaries.every((value) => typeof value === 'string' && value.length > 0 && value.length <= 16384)
)
  throw new Error('Invalid synthetic canary list');
const patterns = [
  ...new Set(
    canaries.flatMap((value) => [
      value,
      Buffer.from(value).toString('base64'),
      encodeURIComponent(value),
    ]),
  ),
];
let files = 0;
let sessionEvents = 0;
let requestHeaders = 0;
let toolResults = 0;
const violations = [];
const spillPaths = new Set();
function collectSpills(text) {
  const matches = [
    ...text.matchAll(/Full formatted result stored at: (.+?)\. Use read/g),
    ...text.matchAll(/\[output truncated; full output: (.+?)\]/g),
  ];
  for (const match of matches) {
    const path = resolve(match[1]);
    const tail = relative(realpathSync(tmpdir()), path);
    if (
      isAbsolute(match[1]) &&
      !isAbsolute(tail) &&
      /^dsh-(?:spill|subprocess)-[A-Za-z0-9_-]+$/.test(tail.split(sep)[0])
    )
      spillPaths.add(path);
  }
}
for (const entry of readdirSync(home, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = join(entry.parentPath, entry.name);
  if (file === join(home, '.credentials.yaml') || file === join(home, 'wire-canary-probe.mjs'))
    continue;
  let data = readFileSync(file);
  if (file.endsWith('.zstd')) {
    let offset = 0;
    const frames = [];
    while (offset < data.length) {
      const frame = zstdDecompressSync(data.subarray(offset), { info: true });
      if (frame.engine.bytesWritten === 0) throw new Error('Native Session frame did not advance');
      offset += frame.engine.bytesWritten;
      frames.push(frame.buffer);
    }
    data = Buffer.concat(frames);
    for (const line of data.toString().trim().split('\n')) {
      const event = JSON.parse(line);
      if (event.type !== 'session') sessionEvents++;
      if (event.type === 'request/header') requestHeaders++;
      if (event.type === 'tool/result') toolResults++;
      if (event.type === 'tool/result')
        for (const block of event.data?.message?.content ?? [])
          if (block.type === 'text' && typeof block.text === 'string') collectSpills(block.text);
    }
  }
  files++;
  const texts = [data.toString('utf8'), data.toString('utf16le')];
  if (patterns.some((pattern) => texts.some((text) => text.includes(pattern))))
    violations.push(file.slice(home.length + 1));
}
let spillFiles = 0;
for (const file of spillPaths) {
  spillFiles++;
  try {
    const canonical = realpathSync(file);
    if (canonical !== file) throw new Error('Spill path changed');
    const data = readFileSync(file);
    const texts = [data.toString('utf8'), data.toString('utf16le')];
    collectSpills(texts[0]);
    if (patterns.some((pattern) => texts.some((text) => text.includes(pattern))))
      violations.push('native-spill-' + spillFiles);
  } catch {
    violations.push('native-spill-unavailable-' + spillFiles);
  }
}
const store = readFileSync(join(home, '.credentials.yaml'), 'utf8');
const result = {
  files,
  sessionEvents,
  requestHeaders,
  toolResults,
  spillFiles,
  nativeStoreContainsSyntheticValues: canaries.every((value) => store.includes(value)),
  violations,
};
process.stdout.write(JSON.stringify(result, null, 2) + '\n');
if (violations.length > 0) process.exitCode = 1;
