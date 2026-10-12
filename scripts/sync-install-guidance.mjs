import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const guidanceFiles = [
  'README.md',
  'README.en.md',
  'docs/installation.md',
  'docs/installation.zh.md',
];

export function installSpec(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Install guidance requires a published stable version');
  }
  return `deepseekbot@${version}`;
}

export function renderInstallGuidance(text, version) {
  const spec = installSpec(version);
  return text
    .replace(
      /(\badd |\bnpm pack |输入 `|enter `)deepseekbot(?:@[0-9A-Za-z.*^~+-]+)?(?=[\s`",.)]|$)/gm,
      `$1${spec}`,
    )
    .replace(/^deepseekbot(?:@[^\s]+)?$/gm, spec);
}

export function syncInstallGuidance(root, check = false) {
  const { version } = JSON.parse(
    readFileSync(resolve(root, 'scripts/install-release.json'), 'utf8'),
  );
  installSpec(version);
  for (const path of guidanceFiles) {
    const file = resolve(root, path);
    const text = readFileSync(file, 'utf8');
    const rendered = renderInstallGuidance(text, version);
    if (text === rendered) continue;
    if (check)
      throw new Error(`${path} install instructions drift from ${version}; run pnpm install:sync`);
    writeFileSync(file, rendered);
  }
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  syncInstallGuidance(
    resolve(fileURLToPath(new URL('..', import.meta.url))),
    process.argv.includes('--check'),
  );
}
