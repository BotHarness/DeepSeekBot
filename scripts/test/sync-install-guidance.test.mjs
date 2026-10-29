import { expect, it } from 'vitest';
import { installSpec, renderInstallGuidance } from '../sync-install-guidance.mjs';

it('retains the legacy published identity when no package is selected', () => {
  expect(installSpec('1.4.1')).toBe('deepseekbot@1.4.1');
});

it('updates bilingual package install instructions without renaming CLI commands', () => {
  const source = [
    'dsh plugin add deepseekbot@1.4.1',
    'npm pack deepseekbot@1.4.1',
    '输入 `deepseekbot@1.4.1`',
    'enter `deepseekbot@1.4.1`',
    '@botharness/tobs@1.5.0',
    'deepseekbot list --json',
    'exact `@botharness/tobs@1.5.0` package',
    '安装的是 `@botharness/tobs@1.5.0`。',
  ].join('\n');
  const result = renderInstallGuidance(source, '1.5.1', '@botharness/tobs');
  expect(result).toBe(
    [
      'dsh plugin add @botharness/tobs@1.5.1',
      'npm pack @botharness/tobs@1.5.1',
      '输入 `@botharness/tobs@1.5.1`',
      'enter `@botharness/tobs@1.5.1`',
      '@botharness/tobs@1.5.1',
      'deepseekbot list --json',
      'exact `@botharness/tobs@1.5.1` package',
      '安装的是 `@botharness/tobs@1.5.1`。',
    ].join('\n'),
  );
  expect(renderInstallGuidance(result, '1.5.1', '@botharness/tobs')).toBe(result);
});

it('refuses unapproved package names and non-stable versions', () => {
  expect(() => installSpec('1.5.1', 'tobs')).toThrow('supported product package');
  expect(() => installSpec('1.5.1-rc.1', '@botharness/tobs')).toThrow('stable version');
});
