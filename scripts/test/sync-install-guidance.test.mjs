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

it('keeps packed archive names and local import commands on the stable identity', () => {
  const source = [
    'npm pack @botharness/tobs@1.6.1',
    '下载 `botharness-tobs-<version>.tgz`。',
    'The archive is `botharness-tobs-1.6.1.tgz`.',
    '`dsh plugin --profile web add ./botharness-tobs-<version>.tgz`',
    'dsh plugin --profile web add ./botharness-tobs-1.6.1.tgz',
    'Unrelated `snapshot-1.6.1.tgz`; historical `deepseekbot@1.4.1`.',
  ].join('\n');
  const result = renderInstallGuidance(source, '1.7.0', '@botharness/tobs');
  expect(result).toContain('npm pack @botharness/tobs@1.7.0');
  expect(result).not.toMatch(/<version>|botharness-tobs-1\.6\.1\.tgz/u);
  expect(result).toContain('下载 `botharness-tobs-1.7.0.tgz`。');
  expect(result).toContain('The archive is `botharness-tobs-1.7.0.tgz`.');
  expect(result).toContain('add ./botharness-tobs-1.7.0.tgz');
  expect(result).toContain('Unrelated `snapshot-1.6.1.tgz`; historical `deepseekbot@1.4.1`.');
  expect(renderInstallGuidance(result, '1.7.0', '@botharness/tobs')).toBe(result);
  const next = renderInstallGuidance(result, '1.8.0', '@botharness/tobs');
  expect(next).toContain('npm pack @botharness/tobs@1.8.0');
  expect(next).toContain('add ./botharness-tobs-1.8.0.tgz');
  expect(next).not.toContain('botharness-tobs-1.7.0.tgz');
  expect(renderInstallGuidance(next, '1.8.0', 'deepseekbot')).toContain(
    'add ./deepseekbot-1.8.0.tgz',
  );
});
