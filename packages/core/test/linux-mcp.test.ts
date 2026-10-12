import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { chmodSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import { ProtectedExecution } from '../src/credentials/protected-execution.js';
import { LinuxMcp } from '../src/credentials/linux-mcp.js';

describe('ordinary native MCP in Linux', () => {
  it.skipIf(process.env.BOTHARNESS_PRIVATE_DOCKER_QA !== '1')(
    'isolates concurrent native Agent namespaces and revokes workspace authority without private input',
    async () => {
      const parent = createTempRoot('bh-private-mcp-');
      const home = join(parent, 'home');
      const roots = ['workspace-a', 'workspace-b'].map((name) => join(parent, name));
      mkdirSync(home);
      for (const root of roots) {
        mkdirSync(root);
        chmodSync(root, 0o755);
        writeFileSync(join(root, 'proof.txt'), 'proof-' + root.at(-1));
        chmodSync(join(root, 'proof.txt'), 0o644);
      }
      const ctx = new Context();
      const execution = new ProtectedExecution(() => undefined);
      await ctx
        .plugin({
          name: 'test-native-mcp-services',
          apply(c: Context) {
            c.provide('systemPrompt', {
              tools: () => () => undefined,
              section: () => () => undefined,
              getSectionOrder: () => 1,
            });
          },
        })
        .await();
      await ctx.plugin(ToolRuntime, {}).await();
      const agents = roots.map(
        (root, index) =>
          ({ session: { id: 'mcp-agent-' + index, header: { cwd: root } } }) as Agent,
      );
      const ancestorKey = {};
      const ancestor = createScope(ctx, ancestorKey);
      const scopes = agents.map((agent) => createScope(ctx, agent, { parent: ancestorKey }));
      agents.forEach((agent, index) => Object.assign(agent, { ctx: scopes[index]!.ctx }));
      let hostCalls = 0;
      const sentinel = (name: string): ToolDefinition => ({
        name,
        description: 'Host-only sentinel',
        parameters: { type: 'object', properties: {} },
        output: { schema: { type: 'boolean' }, render: () => [] },
        async execute() {
          hostCalls++;
          return true;
        },
      });
      const globalName = 'mcp__linux_demo__global_host_reader';
      const ancestorName = 'mcp__linux_demo__ancestor_host_reader';
      const ownName = 'mcp__linux_demo__existing_host_reader';
      ctx.tools.register(sentinel(globalName));
      ancestor.ctx.get('tools')!.register(sentinel(ancestorName));
      scopes[0]!.ctx.get('tools')!.register(sentinel(ownName));
      const active = new Set(agents);
      const mcp = new LinuxMcp(execution, home, (agent, workdir) => {
        if (!active.has(agent)) throw new Error('Revoked');
        return workdir;
      });
      const servers = [
        {
          serverName: 'linux_demo',
          command: 'node',
          args: [
            '--input-type=module',
            '-e',
            readFileSync('scripts/ask-secret-mcp-fixture.mjs', 'utf8'),
          ],
        },
      ];
      const disposers: Array<() => Promise<void>> = [];
      const name = 'mcp__linux_demo__workspace_probe';
      const lateGlobalName = 'mcp__linux_demo__late_global_host_reader';
      const lateAncestorName = 'mcp__linux_demo__late_ancestor_host_reader';
      let injected = false;
      ctx.on('tools/change', () => {
        if (injected || ctx.tools.get(name, agents[0]) === undefined) return;
        injected = true;
        ctx.tools.register(sentinel(lateGlobalName));
        ancestor.ctx.get('tools')!.register(sentinel(lateAncestorName));
      });
      try {
        for (const [index, scope] of scopes.entries())
          disposers.push(await mcp.install(scope.ctx, agents[index]!, servers));
        ctx.tools.guard(({ name: tool, agent }) =>
          tool.startsWith('mcp__linux_demo__') && agent !== undefined
            ? mcp.denial(ctx, agent, tool)
            : undefined,
        );
        expect(ctx.tools.get(name)).toBeUndefined();
        expect(ctx.tools.get(name, agents[0])).not.toBe(ctx.tools.get(name, agents[1]));
        const invoke = (agent: Agent, id: string, tool = name) =>
          ctx.tools.execute({
            agent,
            callId: ToolCallId(id),
            name: tool,
            arguments: {},
            signal: new AbortController().signal,
          });
        for (const agent of agents) {
          for (const tool of [globalName, ancestorName, lateGlobalName, lateAncestorName]) {
            expect(ctx.tools.get(tool, agent)).toBeDefined();
            expect((await invoke(agent, 'deny-' + tool, tool)).isError).toBe(true);
          }
        }
        expect((await invoke(agents[0]!, 'deny-existing', ownName)).isError).toBe(true);
        expect(hostCalls).toBe(0);
        const [a, b] = await Promise.all(
          agents.map((agent, index) => invoke(agent, 'ordinary-mcp-' + index)),
        );
        expect(a!.isError).toBe(false);
        expect(b!.isError).toBe(false);
        expect(JSON.stringify(a!.content)).toContain('proof-a');
        expect(JSON.stringify(b!.content)).toContain('proof-b');
        expect(JSON.stringify(a!.content)).toContain('65534');
        active.delete(agents[0]!);
        expect((await invoke(agents[0]!, 'revoked-mcp')).isError).toBe(true);
        expect((await invoke(agents[1]!, 'retained-mcp')).isError).toBe(false);
      } finally {
        await Promise.allSettled(disposers.map((dispose) => dispose()));
        await Promise.allSettled(scopes.map((scope) => scope.dispose()));
        await ancestor.dispose();
        await ctx.fiber.dispose();
        await execution.close();
      }
    },
    60_000,
  );
});
