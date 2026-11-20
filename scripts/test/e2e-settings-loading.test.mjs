import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { rpc } from '../verify-app.mjs';

vi.mock('../verify-app.mjs', () => ({ rpc: vi.fn() }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

it('reports both RPC failures and writes measurements when onboarding and settings fail', async ({
  onTestFinished,
}) => {
  const directory = mkdtempSync(join(tmpdir(), 'settings-loading-test-'));
  onTestFinished(() => rmSync(directory, { recursive: true, force: true }));
  const instance = join(directory, 'instance.json');
  const result = join(directory, 'result.json');
  writeFileSync(instance, '{}');
  vi.stubEnv('BH_E2E_INSTANCE', instance);
  vi.stubEnv('BH_E2E_RESULT', result);
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const settings = new Error('approval templates unavailable');
  const onboarding = new Error('onboarding unavailable');
  vi.mocked(rpc).mockImplementation(async (_instance, endpoint) => {
    if (endpoint === 'botharness/list') return { bots: [] };
    if (endpoint === 'botharness/approvalTemplates') throw settings;
    if (endpoint === 'botharness/onboarding') throw onboarding;
  });

  await expect(import('../e2e-settings-loading.mjs')).rejects.toMatchObject({
    errors: [settings, onboarding],
  });
  const { measurements } = JSON.parse(readFileSync(result, 'utf8'));
  expect(measurements.map(({ method }) => method).sort()).toEqual([
    'approvalTemplates',
    'onboarding',
    'promptPresets',
    'voiceProviders',
  ]);
});
