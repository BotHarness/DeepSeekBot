#!/usr/bin/env node

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import subsetFont from 'subset-font';
import { syncDocs } from './sync-docs.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CONTENT = join(ROOT, 'apps', 'docs', 'src', 'content');
const CONTENT_DIRS = ['docs', 'docs-zh', 'changelog', 'changelog-zh'].map((name) =>
  join(CONTENT, name),
);
const OUTPUT = join(ROOT, 'apps', 'docs', 'public', 'fonts', 'NotoSansSC-Bold.og-subset.otf');
const CACHED_SOURCE = join(ROOT, 'node_modules', '.cache', 'og-font', 'NotoSansSC-Bold.otf');
const SOURCE_URL =
  'https://raw.githubusercontent.com/notofonts/noto-cjk/165c01b46ea533872e002e0785ff17e44f6d97d8/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf';

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(0x20 + i)).join(
  '',
);
const FRONT_MATTER = /^---\r?\n([\s\S]*?)\r?\n---/;

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (/\.mdx?$/.test(entry.name)) yield path;
  }
}

function corpusChars() {
  const chars = new Set(PRINTABLE_ASCII);
  for (const dir of CONTENT_DIRS) {
    if (!existsSync(dir)) continue;
    for (const file of walk(dir)) {
      const match = FRONT_MATTER.exec(readFileSync(file, 'utf8'));
      if (!match) continue;
      for (const char of match[1]) chars.add(char);
    }
  }
  return [...chars].sort().join('');
}

async function sourceFont() {
  if (existsSync(CACHED_SOURCE)) return readFileSync(CACHED_SOURCE);
  console.log(`Downloading ${SOURCE_URL}`);
  const response = await fetch(SOURCE_URL);
  if (!response.ok) {
    throw new Error(`Font download failed: ${response.status} ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  mkdirSync(dirname(CACHED_SOURCE), { recursive: true });
  writeFileSync(CACHED_SOURCE, buffer);
  return buffer;
}

syncDocs();
const text = corpusChars();
const han = [...text].filter((char) => /\p{Script=Han}/u.test(char));
const subset = await subsetFont(await sourceFont(), text, { targetFormat: 'sfnt' });

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, subset);

const sourceBytes = statSync(CACHED_SOURCE).size;
console.log(
  `Wrote ${OUTPUT}: ${subset.length} bytes ` +
    `(${text.length} glyphs, ${han.length} Han; source ${sourceBytes} bytes)`,
);
