import assert from 'node:assert/strict';
import { realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function verifySubagentControl(anchor, plugin, { source = false } = {}) {
  const moduleUrl = (path) =>
    pathToFileURL(source ? path.replace(/[\\/]lib[\\/]index\.js$/u, '/src/index.ts') : path).href;
  const host = createRequire(realpathSync(anchor));
  const control = host.resolve('@deepseek-ai/dsh-tool-subagent-control');
  const native = createRequire(control);
  const toolsPath = native.resolve('@deepseek-ai/dsh-tools');
  const toolImports = createRequire(toolsPath);
  const { Context } = await import(moduleUrl(native.resolve('@deepseek-ai/cordis')));
  const { default: Loader } = await import(
    moduleUrl(host.resolve('@deepseek-ai/cordis-plugin-loader'))
  );
  const { createScope } = await import(moduleUrl(toolImports.resolve('@deepseek-ai/dsh-scope')));
  const { default: SystemPrompt } = await import(
    moduleUrl(toolImports.resolve('@deepseek-ai/dsh-system-prompt'))
  );
  const { default: Tools } = await import(moduleUrl(toolsPath));
  const ctx = new Context();
  ctx.baseUrl = pathToFileURL(control).href;
  try {
    await ctx.plugin(Loader);
    await ctx.plugin(SystemPrompt, { personaPrefix: '' });
    await ctx.plugin(Tools);
    ctx.provide('subagents', { listChildren: async () => [], listDescendants: async () => [] });
    ctx.provide('agents', { get: () => undefined });
    const scopes = [{}, {}].map((key) => ({ key, ...createScope(ctx, key) }));
    for (const scope of scopes) {
      await scope.ctx.plugin(plugin);
      const names = ctx.tools.schemas(scope.key).map((tool) => tool.name);
      for (const name of ['list_agents', 'send_message', 'interrupt_agent']) {
        assert.equal(names.filter((value) => value === name).length, 1, `${name} registers once`);
      }
      const listing = ctx.tools.get('list_agents', scope.key);
      const args = { scope: 'children' };
      const result = await listing.execute(args, {
        agent: { id: 'parent' },
        signal: new AbortController().signal,
      });
      assert.deepEqual(listing.output.render(args, result), [
        { type: 'text', text: '(no subagents)' },
      ]);
    }
    await scopes[0].dispose();
    assert.equal(ctx.tools.get('list_agents', scopes[0].key), undefined);
    assert.ok(ctx.tools.get('list_agents', scopes[1].key));
    await scopes[1].dispose();
    assert.equal(ctx.tools.get('list_agents', scopes[1].key), undefined);
    return { tools: 'registered once per scope', listing: '(no subagents)', disposal: 'isolated' };
  } finally {
    await ctx.fiber.dispose();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const anchor = resolve(process.argv[2] ?? 'node_modules/@deepseek-ai/dsh/package.json');
  const plugin = await import('../packages/deepseekbot/src/subagent-control.mjs');
  console.log(
    JSON.stringify(
      await verifySubagentControl(anchor, plugin, {
        source: process.argv.includes('--source'),
      }),
    ),
  );
}
