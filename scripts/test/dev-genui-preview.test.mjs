import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { genuiPreviewPatch } from '../dev-genui-preview.mjs';
import { parseArgs } from '../dev-instance.mjs';
import { parseVerifyArgs } from '../verify-app.mjs';
import {
  previewBrowserAppArmorProfile,
  collectPreviewDiagnostics,
  probeBrowserVersion,
} from '../perf-genui-browser-diagnostics.mjs';

const source = `- id: group
  config:
    - id: botharness-core
      name: '@botharness/core'
      config: { agentPreset: deepseekbot, telemetry: false }
    - id: unrelated
      config: !!js 'throw new Error("must not execute")'
`;

describe('explicit GenUI preview Profile configuration', () => {
  it.each([false, undefined])(
    'reports local truncation when owner truncation is %s',
    (truncated) => {
      const result = collectPreviewDiagnostics({
        entries: Array.from({ length: 200 }, () => ({
          source: 'genui-preview',
          code: 'ready',
          fields: { durationMs: 1 },
        })),
        completeness: { primary: 'available', truncated },
      });
      expect(result.events).toHaveLength(128);
      expect(result.completeness.truncated).toBe(true);
    },
  );
  it.each([false, true, undefined])(
    'preserves owner completeness without local truncation: %s',
    (truncated) => {
      expect(
        collectPreviewDiagnostics({ completeness: { truncated } }).completeness.truncated,
      ).toBe(truncated ?? null);
    },
  );
  it('allows user namespaces for exactly the controlled executable', () => {
    const profile = previewBrowserAppArmorProfile('/home/runner/cache/chrome');
    expect(profile).toContain('"/home/runner/cache/chrome"');
    expect(profile).toContain('userns,');
    expect(profile).not.toContain('**');
  });
  it.each([
    'relative',
    '/cache/*/chrome',
    '/cache/[ab]/chrome',
    '/cache/"chrome',
    '/cache/\nchrome',
  ])('refuses AppArmor paths that could widen the permission: %j', (binary) => {
    expect(() => previewBrowserAppArmorProfile(binary)).toThrow('literal absolute');
  });
  it('keeps the newest bounded owner events in the API returned order', () => {
    const { events } = collectPreviewDiagnostics({
      entries: Array.from({ length: 200 }, (_, index) => ({
        source: 'genui-preview',
        code: 'ready-detail',
        fields: { durationMs: 1, index, text: 'observed' },
      })),
    });
    expect(events).toHaveLength(128);
    expect(events[0].index).toBe(0);
    expect(events.at(-1).index).toBe(127);
  });
  it('retains a failed version probe as coded process evidence rather than a successful version', () => {
    const failure = Object.assign(new Error('timed out'), {
      code: 'ETIMEDOUT',
      pid: 1234,
      status: null,
      signal: 'SIGTERM',
      stderr: 'sandbox initialization token=private-value https://private.example/?token=hidden',
      stdout: 'partial version',
    });
    const result = probeBrowserVersion({ path: '/opt/chrome', realpath: '/opt/chrome' }, () => {
      throw failure;
    });
    expect(result).toMatchObject({
      probe: {
        outcome: 'failed',
        code: 'ETIMEDOUT',
        pid: 1234,
        signal: 'SIGTERM',
        stdout: 'partial version',
      },
    });
    expect(result).not.toHaveProperty('version');
    expect(JSON.stringify(result)).not.toMatch(/private-value|hidden/);
  });
  it('patches only the selected core while preserving its existing configuration', () => {
    expect(parse(genuiPreviewPatch(source, '/opt/chrome'))).toEqual([
      {
        id: 'botharness-core',
        config: {
          agentPreset: 'deepseekbot',
          telemetry: false,
          genuiPreviewBrowserPath: '/opt/chrome',
        },
      },
    ]);
    expect(source).not.toContain('genuiPreviewBrowserPath');
    expect(() => genuiPreviewPatch(source + '\n- id: botharness-core\n', '/opt/chrome')).toThrow(
      'one enabled',
    );
    expect(() =>
      genuiPreviewPatch(source.replace("name: '@botharness/core'", 'name: other'), '/opt/chrome'),
    ).toThrow('one enabled');
  });
  it('forwards an explicit path without changing the default selection', () => {
    expect(parseArgs([]).genuiPreviewBrowser).toBeUndefined();
    expect(parseArgs(['--genui-preview-browser', process.execPath]).genuiPreviewBrowser).toBe(
      process.execPath,
    );
    expect(() => parseArgs(['--genui-preview-browser', 'relative'])).toThrow('absolute');
    expect(
      parseVerifyArgs(['launch', '--genui-preview-browser', process.execPath]).genuiPreviewBrowser,
    ).toBe(process.execPath);
  });
  it('retains only bounded redacted preview owner events, never the full Host log', () => {
    const { events: rows } = collectPreviewDiagnostics({
      entries: [
        {
          source: 'host',
          code: 'info',
          fields: { text: 'Host login https://example.com/?token=keep-private' },
        },
        {
          source: 'genui-preview',
          code: 'refused-detail',
          fields: {
            durationMs: 8001,
            index: 0,
            text: 'token=secret-value https://x.example/?token=hidden /private/user/profile',
            unrelated: 'private',
          },
        },
        { source: 'genui-preview', code: 'unexpected', fields: { durationMs: 1 } },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ phase: 'refused-detail', durationMs: 8001 });
    expect(rows[0]).not.toHaveProperty('unrelated');
    expect(JSON.stringify(rows)).not.toMatch(/keep-private|secret-value|hidden|\/private\/user/);
  });
});
