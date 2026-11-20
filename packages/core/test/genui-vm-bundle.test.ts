import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { describe, expect, it } from 'vitest';

describe('GenUI Worker interpreter import budget', () => {
  it('does not carry message schemas and their localization graph into the interpreter', async () => {
    const root = fileURLToPath(new URL('../../../', import.meta.url));
    const result = await build({
      stdin: {
        contents: "export {createGenuiVm} from './packages/core/src/channels/genui-vm.ts'",
        resolveDir: root,
      },
      bundle: true,
      write: false,
      metafile: true,
      platform: 'browser',
      format: 'iife',
    });
    expect(result.outputFiles[0]?.contents.byteLength).toBeLessThanOrEqual(131_072);
    expect(
      Object.keys(result.metafile.inputs).some((path) =>
        /(?:zod|channels\/genui-document\.ts|channels\/genui\.ts)/u.test(path),
      ),
    ).toBe(false);
  });
});
