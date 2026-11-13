import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { genuiPreviewPatch } from '../dev-genui-preview.mjs';
import { parseArgs } from '../dev-instance.mjs';
import { parseVerifyArgs } from '../verify-app.mjs';
import { previewDiagnosticEvents } from '../perf-genui-browser-diagnostics.mjs';

const source = `- id: group
  config:
    - id: botharness-core
      name: '@botharness/core'
      config: { agentPreset: deepseekbot, telemetry: false }
    - id: unrelated
      config: !!js 'throw new Error("must not execute")'
`;

describe('explicit GenUI preview Profile configuration', () => {
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
    const rows = previewDiagnosticEvents({
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
