import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { apply } from '../../packages/deepseekbot/src/subagent-control.mjs';

const control = '@deepseek-ai/dsh-tool-subagent-control';
const listing = `${control}/list-agents`;

describe('native subagent control compatibility', () => {
  it('registers and calls native tools in independent disposable scopes on the pinned Host', () => {
    const output = execFileSync(process.execPath, ['scripts/verify-subagent-control.mjs'], {
      cwd: fileURLToPath(new URL('../..', import.meta.url)),
      encoding: 'utf8',
      timeout: 10_000,
    });
    expect(JSON.parse(output)).toEqual({
      tools: 'registered once per scope',
      listing: '(no subagents)',
      disposal: 'isolated',
    });
  });

  it('mounts both exported Plugins on split-entry Hosts', async () => {
    const ctx = { loader: { import: vi.fn(async (name) => name) }, plugin: vi.fn() };
    await apply(ctx);
    expect(ctx.plugin.mock.calls).toEqual([[control], [listing]]);
  });

  it.each(['dsh-tool-subagent-control/package.json', 'tool-subagent-control\\package.json'])(
    'uses the main Plugin when the Host removed the separate listing export (%s)',
    async (path) => {
      const missingExport = Object.assign(
        new Error(`Package subpath './list-agents' is not defined by exports in ${path}`),
        { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' },
      );
      const ctx = {
        loader: {
          import: vi.fn().mockResolvedValueOnce(control).mockRejectedValueOnce(missingExport),
        },
        plugin: vi.fn(),
      };
      await apply(ctx);
      expect(ctx.plugin.mock.calls).toEqual([[control]]);
    },
  );

  it.each([
    new Error('dependency failed'),
    Object.assign(new Error('file missing'), { code: 'ERR_MODULE_NOT_FOUND' }),
    Object.assign(new Error("Package subpath './other' is not defined by exports"), {
      code: 'ERR_PACKAGE_PATH_NOT_EXPORTED',
    }),
  ])('preserves unrelated import failures: %s', async (failure) => {
    const ctx = {
      loader: { import: vi.fn().mockResolvedValueOnce(control).mockRejectedValueOnce(failure) },
      plugin: vi.fn(),
    };
    await expect(apply(ctx)).rejects.toBe(failure);
  });

  it('does not retry a failed native Plugin activation', async () => {
    const failure = new Error('activation failed');
    const ctx = {
      loader: { import: vi.fn().mockResolvedValue(control) },
      plugin: vi.fn().mockRejectedValue(failure),
    };
    await expect(apply(ctx)).rejects.toBe(failure);
    expect(ctx.loader.import).toHaveBeenCalledTimes(1);
  });
});
