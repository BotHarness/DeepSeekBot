import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { adaptZoomTheme, prepareDesktopZoomCompatibility } from '../desktop-zoom-compat.mjs';
const path = new URL(
  '../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme/lib/client.js',
  import.meta.url,
);
describe('locked downstream theme composition', () => {
  it('imports the generated Host through the ESM schema entry, retaining the license and source', async () => {
    const temporary = mkdtempSync(join(tmpdir(), 'zoom-theme-test-'));
    const target = join(temporary, 'theme');
    const source = fileURLToPath(
      new URL(
        '../../packages/client/node_modules/@deepseek-ai/dsh-client-ui-theme',
        import.meta.url,
      ),
    );
    try {
      prepareDesktopZoomCompatibility({ source, target });
      const host = readFileSync(join(target, 'lib/index.js'), 'utf8');
      expect(host).toContain('/lib/index.mjs');
      expect(host).not.toContain('/lib/index.cjs');
      expect((await import(pathToFileURL(join(target, 'lib/index.js')).href)).apply).toBeTypeOf(
        'function',
      );
      expect(readFileSync(join(target, 'LICENSE'), 'utf8')).toContain('MIT');
    } finally {
      rmSync(temporary, { recursive: true, force: true });
    }
  });
  it('refuses a changed upstream artifact before adapting anything', () => {
    expect(() => adaptZoomTheme('different build')).toThrow('zoom-theme-build-unsupported');
  });
  it('hands off only its own font scope, and preserves a default path and disposal restoration', () => {
    const source = readFileSync(path, 'utf8');
    const adapted = adaptZoomTheme(source);
    expect(adapted).toContain('await fontKeys.dispose()');
    expect(adapted).toContain('if (alive) fontKeys = installFontKeys()');
    expect(adapted).toContain(
      "['darwin', 'win32'].includes(document.documentElement.dataset.platform)",
    );
    expect(adapted).toContain('this.adjustFontSizes(delta)');
    expect(source).not.toContain('__botharnessWindowZoomCompatibility');
    expect(() => new Function(adapted)).not.toThrow();
  });
});

it.each(['darwin', 'win32', 'linux'])(
  'leases native font keys only for the actual adapter protocol independent of boot release on %s',
  async (platform) => {
    const adapted = adaptZoomTheme(readFileSync(path, 'utf8'));
    const start = adapted.indexOf('const installFontKeys =');
    const marker = "}, 'botharness: desktop zoom compatibility ownership');";
    const end = adapted.indexOf('}', adapted.indexOf(marker, start) + marker.length) + 1;
    const mount = new Function(
      'ctx',
      'location',
      'document',
      'window',
      'installFontSizeShortcuts',
      adapted.slice(start, end),
    );
    for (const version of ['0.2.1-rc.2', '0.2.0-rc.2', '0.2.1-rc.3', undefined]) {
      const window = { __DSH_BOOT__: { release: { version } } };
      const cleanups = [];
      const dispose = vi.fn(async () => {});
      const install = vi.fn(() => ({ dispose }));
      mount(
        { effect: (effect) => cleanups.push(effect()) },
        { protocol: 'dsh-app:', hostname: 'app' },
        { documentElement: { dataset: { platform } } },
        window,
        install,
      );
      expect(install).toHaveBeenCalledOnce();
      if (platform === 'linux') {
        expect(window.__botharnessWindowZoomCompatibility).toBeUndefined();
        expect(dispose).not.toHaveBeenCalled();
        continue;
      }
      const lease = window.__botharnessWindowZoomCompatibility;
      expect(lease.platform).toBe(platform === 'win32' ? 'windows' : 'macos');
      const release = await lease.acquire();
      expect(dispose).toHaveBeenCalledOnce();
      release();
      release();
      expect(install).toHaveBeenCalledTimes(2);
      cleanups.forEach((cleanup) => cleanup());
      expect(window.__botharnessWindowZoomCompatibility).toBeUndefined();
      await expect(lease.acquire()).rejects.toThrow('unavailable');
    }
  },
);
