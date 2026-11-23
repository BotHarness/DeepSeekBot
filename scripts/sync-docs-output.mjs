import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isWithin = (parent, candidate) => {
  const path = relative(parent, candidate);
  return path === '' || (!isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`));
};
const configuredTestRoot = process.env.BOTHARNESS_DOCS_TEST_OUTPUT_ROOT?.trim();
let testOutputRoot = null;
if (configuredTestRoot) {
  if (!isAbsolute(configuredTestRoot)) {
    throw new Error('BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must be an absolute path');
  }
  const realTempRoot = realpathSync(tmpdir());
  const realRepoRoot = realpathSync(ROOT);
  const realConfiguredRoot = realpathSync(configuredTestRoot);
  const overlapsRepo =
    isWithin(realRepoRoot, realConfiguredRoot) || isWithin(realConfiguredRoot, realRepoRoot);
  if (overlapsRepo) {
    throw new Error('BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must not overlap the repository');
  }
  const relativeToTemp = relative(realTempRoot, realConfiguredRoot);
  if (!relativeToTemp || !isWithin(realTempRoot, realConfiguredRoot)) {
    throw new Error(
      'BOTHARNESS_DOCS_TEST_OUTPUT_ROOT must be below the system temporary directory',
    );
  }
  testOutputRoot = realConfiguredRoot;
}
const CONTENT = testOutputRoot
  ? join(testOutputRoot, 'content')
  : join(ROOT, 'apps', 'docs', 'src', 'content');
const DIAGRAMS_RENDERED = join(ROOT, 'docs', 'architecture', 'diagrams', 'rendered');
const DIAGRAMS_PUBLIC = testOutputRoot
  ? join(testOutputRoot, 'diagrams')
  : join(ROOT, 'apps', 'docs', 'public', 'diagrams');

export { CONTENT, DIAGRAMS_PUBLIC, DIAGRAMS_RENDERED, ROOT, testOutputRoot };
