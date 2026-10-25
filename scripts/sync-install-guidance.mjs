import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const guidanceFiles = [
  'README.md',
  'README.en.md',
  'docs/installation.md',
  'docs/installation.zh.md',
];

export function installSpec(version, packageName = 'deepseekbot') {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) {
    throw new Error('Install guidance requires a published stable version');
  }
  if (!['deepseekbot', '@botharness/tobs'].includes(packageName))
    throw new Error('Install guidance requires a supported product package');
  return `${packageName}@${version}`;
}

export function renderInstallGuidance(text, version, packageName = 'deepseekbot') {
  const spec = installSpec(version, packageName);
  return text
    .replace(
      /(\badd |\bnpm pack |输入 `|enter `|package \*\*`|正式包 \*\*`|安装的是 |exact )(?:deepseekbot|@botharness\/tobs)(?:@[0-9A-Za-z.*^~+-]+)?(?=[\s`",.)*。]|$)/gm,
      `$1${spec}`,
    )
    .replace(/^(?:deepseekbot|@botharness\/tobs)(?:@[^\s]+)?$/gm, spec);
}

export function syncInstallGuidance(root, check = false) {
  const { version, packageName = 'deepseekbot' } = JSON.parse(
    readFileSync(resolve(root, 'scripts/install-release.json'), 'utf8'),
  );
  installSpec(version, packageName);
  for (const path of guidanceFiles) {
    const file = resolve(root, path);
    const text = readFileSync(file, 'utf8');
    const rendered = renderInstallGuidance(text, version, packageName);
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
