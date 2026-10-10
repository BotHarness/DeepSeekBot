import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { imTestAppsPath, listImTestApps, loadImTestApp } from '../dev-im-test-apps.mjs';

const directories = [];
function fixture(text) {
  const directory = mkdtempSync(join(tmpdir(), 'bh-shared-im-'));
  directories.push(directory);
  const path = join(directory, 'im-test-apps.env');
  writeFileSync(path, text, { mode: 0o600 });
  return { path };
}

afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

const configuration = [
  'BH_IM_QA_SLOT=QA1',
  'BH_LARK_QA1_NAME=BotHarness reusable QA 1',
  'BH_LARK_QA1_DOMAIN=lark',
  'BH_LARK_QA1_APP_ID=cli_test_one',
  'BH_LARK_QA1_APP_SECRET=test-secret-one',
  'BH_LARK_QA1_CONSOLE_READY=yes',
  'BH_LARK_QA1_RECEIVER_CHECKED_AT=2026-10-10T10:00:00Z',
  'BH_LARK_QA2_NAME=BotHarness reusable QA 2',
  'BH_LARK_QA2_DOMAIN=lark',
  'BH_LARK_QA2_APP_ID=cli_test_two',
  'BH_LARK_QA2_APP_SECRET=test-secret-two',
].join('\n');

describe('machine-local reusable IM test Apps', () => {
  it('uses a fixed user path independent of the repository and allows an explicit cross-OS file', () => {
    expect(imTestAppsPath({})).toMatch(/[\\/]\.config[\\/]botharness[\\/]im-test-apps\.env$/u);
    const file = fixture(configuration).path;
    expect(imTestAppsPath({ BOTHARNESS_IM_TEST_APPS_ENV: file })).toBe(file);
  });

  it('loads the selected slot without mixing two Apps and preserves names with spaces', () => {
    const options = fixture(configuration);
    expect(loadImTestApp(undefined, options)).toMatchObject({
      slot: 'QA1',
      name: 'BotHarness reusable QA 1',
      appId: 'cli_test_one',
      appSecret: 'test-secret-one',
      consoleReady: true,
    });
    expect(loadImTestApp('QA2', options)).toMatchObject({
      appId: 'cli_test_two',
      appSecret: 'test-secret-two',
      consoleReady: false,
    });
    expect(() => loadImTestApp('QA3', options)).toThrow('incomplete');
  });

  it('lists only non-secret metadata and never treats a prior window as an idle receiver', () => {
    const listed = listImTestApps(fixture(configuration));
    const serialized = JSON.stringify(listed);
    expect(serialized).not.toContain('test-secret');
    expect(serialized).not.toContain('cli_test');
    expect(listed[0]).toMatchObject({
      credentialsConfigured: true,
      receiverAvailability: 'requires-current-window-confirmation',
    });
    expect(listed[2]).toMatchObject({ name: null, credentialsConfigured: false });
  });

  it('parses literal values rather than executing shell text or substituting variables', () => {
    const options = fixture(
      configuration.replace('BotHarness reusable QA 1', '$(exit 99) ${HOME}'),
    );
    expect(loadImTestApp('QA1', options).name).toBe('$(exit 99) ${HOME}');
    expect(() =>
      loadImTestApp('QA1', fixture(configuration.replace('test-secret-one', '$(exit 99)'))),
    ).toThrow('incomplete');
    expect(() => listImTestApps(fixture(`${configuration}\nBH_IM_QA_SLOT=QA2`))).toThrow(
      'Duplicate',
    );
  });
});
