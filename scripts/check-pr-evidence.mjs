import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MEDIA =
  /\.(?:png|jpe?g|gif|webp|avif|svg|bmp|heic|mp4|mov|webm|m4v|mkv|pdf|html?|zip|gz|tgz|har|trace)$/i;
const EVIDENCE =
  /^(?:\.github\/(?:pr-screenshots|pr-assets)\/|docs\/(?:assets\/pr|research\/evidence|evidence|qa)\/)/;

export function evidenceViolations(paths) {
  return [...new Set(paths)].filter(
    (path) => path.startsWith('.humanlayer/') || (EVIDENCE.test(path) && MEDIA.test(path)),
  );
}

export function changedPaths(root, base = 'HEAD') {
  const git = (args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' });
  const commit = git(['rev-parse', '--verify', `${base}^{commit}`]).trim();
  return [
    ...git(['diff', '--name-only', '-z', '--diff-filter=ACMRTUXB', commit, '--']).split('\0'),
    ...git(['ls-files', '--others', '--exclude-standard', '-z']).split('\0'),
  ].filter(Boolean);
}

export function checkEvidence(root, base) {
  return evidenceViolations(changedPaths(root, base));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    const args = process.argv.slice(2);
    if (args.length && (args.length !== 2 || args[0] !== '--base' || !args[1]))
      throw new Error('Usage: node scripts/check-pr-evidence.mjs [--base <commit>]');
    const violations = checkEvidence(ROOT, args[1]);
    if (violations.length)
      throw new Error(
        `Publish PR evidence to Cloudflare R2, not Git:\n${violations.join('\n')}\nSee docs/agents/pr-ui-visual-evidence.md`,
      );
    process.stdout.write('PR evidence policy: no new or modified Git evidence artifacts\n');
  } catch (error) {
    process.stderr.write(`pr-evidence-policy: ${error.message}\n`);
    process.exitCode = 1;
  }
}
