import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import vm from 'node:vm';
import { build } from 'tsdown';
import { expect, it } from 'vitest';
import { vrmCompanionClientBundleOptions } from '../../../tsdown.config.js';

it('registers an independent native Client bundle using only declared shell runtime modules', async () => {
  const outDir = mkdtempSync(join(tmpdir(), 'bh-vrm-bundle-'));
  try {
    await build({ ...vrmCompanionClientBundleOptions, outDir, logLevel: 'silent' });
    const code = readFileSync(join(outDir, 'client.js'), 'utf8');
    const required = [...code.matchAll(/require\(["']([^"']+)["']\)/g)].map((m) => m[1]);
    expect(required.length).toBeGreaterThan(0);
    expect(
      required.every((id) =>
        ['react', 'react/jsx-runtime', '@deepseek-ai/dsh-client-ui-primitives'].includes(id!),
      ),
    ).toBe(true);
    expect(code).not.toMatch(/\bprocess\.env\b/);
    let entry: { id: string; factory: unknown } | undefined;
    vm.runInNewContext(code, {
      window: {
        __ModuleLoader__: {
          load(value: typeof entry) {
            entry = value;
          },
        },
      },
    });
    expect(entry?.id).toBe('@botharness/vrm-companion');
    expect(entry?.factory).toBeTypeOf('function');
    expect(code).not.toContain('data:model/gltf-binary');
    expect(code).toContain('require.async("./client.model.js")');
    let chunk: { id: string; factory: () => { url: string } } | undefined;
    vm.runInNewContext(readFileSync(join(outDir, 'client.model.js'), 'utf8'), {
      window: {
        __ModuleLoader__: {
          load(value: typeof chunk) {
            chunk = value;
          },
        },
      },
    });
    expect(chunk?.id).toBe('@botharness/vrm-companion/client.model.js');
    expect(chunk?.factory().url).toMatch(/^data:model\/gltf-binary;base64,/);
  } finally {
    rmSync(outDir, { recursive: true, force: true });
  }
}, 120_000);
