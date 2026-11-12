import { createHash } from 'node:crypto';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildGenuiRuntimeAssets, genuiRuntimeAssetsPlugin } from '../genui-runtime-assets.mjs';

describe('GenUI shared offline runtime assets', () => {
  it('emits matching, watched Core and Client artifacts without placing them in the ordinary entry', async () => {
    const emitted = {};
    const watched = [];
    for (const target of ['core', 'client']) {
      const plugin = genuiRuntimeAssetsPlugin(target);
      await plugin.generateBundle.call({
        addWatchFile: (path) => watched.push(path),
        emitFile: ({ fileName, source }) => {
          emitted[fileName] = source;
        },
      });
    }
    expect(emitted['client.genui.js']).toContain(emitted['genui-runtime.js']);
    expect(emitted['genui-runtime.json']).toBe(emitted['client.genui.json']);
    expect(Object.keys(emitted).sort()).toEqual([
      'client.genui.js',
      'client.genui.json',
      'genui-runtime.js',
      'genui-runtime.json',
    ]);
    expect(watched.some((path) => path.endsWith('/genui-guest-dom.ts'))).toBe(true);
    expect(watched.some((path) => path.endsWith('/genui-document-surface.ts'))).toBe(true);
    expect(() => genuiRuntimeAssetsPlugin('unknown')).toThrow('Unknown');
  });

  it('packages the same trusted renderer for lazy Client loading and standalone preview', async () => {
    const assets = await buildGenuiRuntimeAssets();
    const standalone = runInNewContext(`${assets.rendererSource}\n__BotHarnessGenuiRuntime;`, {
      TextEncoder,
    });
    const registrations = [];
    runInNewContext(assets.clientModuleSource, {
      TextEncoder,
      window: { __ModuleLoader__: { load: (registration) => registrations.push(registration) } },
    });
    expect(registrations).toHaveLength(1);
    expect(registrations[0].id).toBe('@botharness/ui/client.genui.js');
    expect(Object.keys(registrations[0].factory())).toEqual(Object.keys(standalone));
    expect(typeof standalone.mountGenuiDocument).toBe('function');
    expect(assets.clientModuleSource).toContain(assets.rendererSource);
    expect(assets.metadata.renderer.sha256).toBe(
      createHash('sha256').update(assets.rendererSource).digest('hex'),
    );
    expect(assets.metadata.renderer.bytes).toBeLessThanOrEqual(2_097_152);
    expect(assets.metadata.worker.bytes).toBeLessThanOrEqual(1_572_864);
    expect(assets.metadata.library.bytes).toBeLessThanOrEqual(1_048_576);
    expect(
      assets.inputs.some((path) => /node_modules\/(?:react|puppeteer|playwright)\//u.test(path)),
    ).toBe(false);
    expect(assets.inputs.some((path) => path.endsWith('channels/genui-html.ts'))).toBe(false);
    expect(assets.inputs.some((path) => path.endsWith('channels/genui-document-surface.ts'))).toBe(
      true,
    );
  });
});
