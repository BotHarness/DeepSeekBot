#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIAGRAMS = join(ROOT, 'docs', 'architecture', 'diagrams');
const RENDERED = join(DIAGRAMS, 'rendered');
const CONFIG = join(DIAGRAMS, 'mermaid.config.json');
const PUPPETEER_CONFIG = join(DIAGRAMS, 'puppeteer.json');
const MMDC = join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'mmdc.cmd' : 'mmdc');

const SETS = [
  { source: DIAGRAMS, output: RENDERED, prefix: '' },
  { source: join(DIAGRAMS, 'en'), output: join(RENDERED, 'en'), prefix: 'en/' },
];

const VARIANTS = [
  { suffix: '', theme: 'default' },
  { suffix: '.dark', theme: 'dark' },
];

function pinIntrinsicSize(output) {
  const source = readFileSync(output, 'utf8');
  const box = source
    .match(/viewBox="([^"]+)"/)?.[1]
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  if (!box || box.length !== 4 || !(box[2] > 0) || !(box[3] > 0)) return;

  const pinned = source.replace(/<svg\b[^>]*>/, (tag) => {
    if (!/\swidth="[^"]*"/.test(tag)) return tag;
    return tag.replace(/\swidth="[^"]*"/, ` width="${box[2]}" height="${box[3]}"`);
  });
  if (pinned !== source) writeFileSync(output, pinned, 'utf8');
}

function renderDiagram(source, output, theme) {
  execFileSync(
    MMDC,
    [
      '-i',
      source,
      '-o',
      output,
      '-t',
      theme,
      '-b',
      'transparent',
      '-c',
      CONFIG,
      '-p',
      PUPPETEER_CONFIG,
    ],
    { cwd: ROOT, stdio: 'inherit', shell: false, windowsHide: true },
  );
  pinIntrinsicSize(output);
}

export function renderDiagrams() {
  if (!existsSync(MMDC)) {
    throw new Error(`mmdc not found at ${MMDC} — run "corepack pnpm install" first`);
  }

  let total = 0;
  for (const { source, output, prefix } of SETS) {
    if (!existsSync(source)) {
      process.stderr.write(`diagram: ${relative(ROOT, source)} is missing — skipped\n`);
      continue;
    }
    const sources = readdirSync(source)
      .filter((name) => name.endsWith('.mmd'))
      .sort();
    mkdirSync(output, { recursive: true });

    for (const file of sources) {
      const base = file.replace(/\.mmd$/, '');
      for (const { suffix, theme } of VARIANTS) {
        const target = join(output, `${base}${suffix}.svg`);
        renderDiagram(join(source, file), target, theme);
        process.stdout.write(
          `diagram: ${prefix}${file} (${theme}) -> ${relative(ROOT, target)} (${statSync(target).size} bytes)\n`,
        );
      }
      total += VARIANTS.length;
    }
  }

  process.stdout.write(`diagram render complete: ${total} SVGs\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  renderDiagrams();
}
