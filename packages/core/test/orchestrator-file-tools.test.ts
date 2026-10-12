import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';
import { installOrchestratorFileTools } from '../src/workspaces/orchestrator-file-tools.js';

interface CallPolicy {
  mode: string;
  workspaceRoot: string;
}

describe('Agent-scoped native file Policy', () => {
  it('preserves global policy, isolates concurrent roots across Agents, and removes its registrations on awaited disposal', async () => {
    const ctx = new Context();
    const writes: Array<{ path: string; policy: CallPolicy }> = [];
    const policies = new Map<string, string>();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let entered = 0;
    let enteredAll!: () => void;
    const allEntered = new Promise<void>((resolve) => {
      enteredAll = resolve;
    });
    const base = {
      defaultMode: 'workspace-write',
      workspaceRoot: '/memory',
      overrideOf: () => 'workspace-write',
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/memory' }),
    };
    const providers = ctx.plugin({
      name: 'test-public-native-capabilities',
      apply(c: Context) {
        c.provide('systemPrompt', {
          tools: () => () => undefined,
          section: () => () => undefined,
          getSectionOrder: () => 1,
        });
        c.provide('sandboxPolicy', base);
        c.provide('shellEnv', {});
        c.provide('shell', { sandboxMode: 'workspace-write' });
        c.provide('fs', {
          sandboxMode: 'workspace-write',
          resolve: async (path: string) => ({ displayPath: path, targetKey: path }),
          writeText: async (
            target: { displayPath: string },
            content: string,
            _intent: unknown,
            _signal: AbortSignal,
            policy: CallPolicy,
          ) => {
            entered++;
            if (entered === 3) enteredAll();
            await gate;
            writes.push({ path: target.displayPath, policy });
            return { operation: 'create', version: 'v1', before: null, after: content };
          },
        });
      },
    });
    await providers.await();
    const runtime = ctx.plugin(ToolRuntime, {});
    await runtime.await();
    const agentA = { session: { id: 'agent-a', header: { cwd: '/memory' } } } as Agent;
    const agentB = { session: { id: 'agent-b', header: { cwd: '/memory' } } } as Agent;
    const scopeA = createScope(ctx, agentA);
    const scopeB = createScope(ctx, agentB);
    Object.assign(agentA, { ctx: scopeA.ctx });
    Object.assign(agentB, { ctx: scopeB.ctx });
    const rootFor = (name: string, args: unknown) => {
      expect(name).toBe('write');
      const path = (args as { file_path: string }).file_path;
      const root = policies.get(path);
      if (root === undefined) throw new Error('Grant revoked');
      return root;
    };
    policies.set('/project-a/one', '/project-a');
    policies.set('/project-b/two', '/project-b');
    policies.set('/project-c/three', '/project-c');
    const disposeA = await installOrchestratorFileTools(scopeA.ctx, agentA, undefined, rootFor);
    const disposeB = await installOrchestratorFileTools(scopeB.ctx, agentB, undefined, rootFor);
    try {
      const execute = (agent: Agent, path: string, id: string) =>
        ctx.tools.execute({
          agent,
          callId: ToolCallId(id),
          name: 'write',
          arguments: { file_path: path, content: 'result' },
          signal: new AbortController().signal,
        });
      const calls = [
        execute(agentA, '/project-a/one', 'one'),
        execute(agentA, '/project-b/two', 'two'),
        execute(agentB, '/project-c/three', 'three'),
      ];
      await Promise.race([
        allEntered,
        Promise.all(calls).then((results) => {
          throw new Error(JSON.stringify(results));
        }),
      ]);
      expect(ctx.get('sandboxPolicy')).toBe(base);
      expect(base.resolve().workspaceRoot).toBe('/memory');
      release();
      const results = await Promise.all(calls);
      expect(results.every((result) => !result.isError)).toBe(true);
      expect(writes.sort((a, b) => a.path.localeCompare(b.path))).toEqual([
        {
          path: '/project-a/one',
          policy: { mode: 'workspace-write', workspaceRoot: '/project-a' },
        },
        {
          path: '/project-b/two',
          policy: { mode: 'workspace-write', workspaceRoot: '/project-b' },
        },
        {
          path: '/project-c/three',
          policy: { mode: 'workspace-write', workspaceRoot: '/project-c' },
        },
      ]);
      policies.delete('/project-a/one');
      expect((await execute(agentA, '/project-a/one', 'revoked')).isError).toBe(true);
      expect(writes).toHaveLength(3);
      await disposeA();
      expect((await execute(agentA, '/project-a/one', 'disposed')).isError).toBe(true);
      expect(ctx.get('sandboxPolicy')).toBe(base);
      expect(ctx.tools.get('write')).toBeUndefined();
    } finally {
      release();
      await disposeA();
      await disposeB();
      await scopeA.dispose();
      await scopeB.dispose();
      await runtime.dispose();
      await providers.dispose();
    }
  });
  it('reads images through the native registration with the scoped fs Provider and current Grant gate', async () => {
    const ctx = new Context();
    const reads: string[] = [];
    let active = true;
    let supportsImage = true;
    const base = {
      defaultMode: 'workspace-write',
      workspaceRoot: '/memory',
      overrideOf: () => 'workspace-write',
      resolve: () => ({ mode: 'workspace-write', workspaceRoot: '/memory' }),
    };
    const providers = ctx.plugin({
      name: 'test-native-image-capabilities',
      apply(c: Context) {
        c.provide('systemPrompt', {
          tools: () => () => undefined,
          section: () => () => undefined,
          getSectionOrder: () => 1,
        });
        c.provide('sandboxPolicy', base);
        c.provide('shellEnv', {});
        c.provide('shell', { sandboxMode: 'workspace-write' });
        c.provide('fs', {
          sandboxMode: 'workspace-write',
          resolve: async (path: string) => ({ displayPath: path, targetKey: path }),
          stat: async () => ({ type: 'file', size: 4, version: 'v1' }),
          readBytes: async (target: { displayPath: string }) => {
            reads.push(target.displayPath);
            return new Uint8Array([137, 80, 78, 71]);
          },
        });
        c.provide('llm', {
          resolveModelInfo: async () => ({
            inputModalities: supportsImage ? ['text', 'image'] : ['text'],
          }),
        });
        c.provide('attachments', {
          imageLimits: {
            mediaTypes: ['image/png'],
            maxImageBytes: 1024,
            maxMessageImageBytes: 1024,
          },
          saveImage: async () => ({
            attachmentId: 'native-image',
            mediaType: 'image/png',
            bytes: 4,
            width: 1,
            height: 1,
          }),
        });
      },
    });
    await providers.await();
    const runtime = ctx.plugin(ToolRuntime, {});
    await runtime.await();
    const agent = {
      session: {
        id: 'native-image-agent',
        header: { cwd: '/memory' },
        requestHeader: () => ({ config: { provider: 'test', model: 'vision' } }),
      },
    } as Agent;
    const scope = createScope(ctx, agent);
    Object.assign(agent, { ctx: scope.ctx });
    const dispose = await installOrchestratorFileTools(
      scope.ctx,
      agent,
      undefined,
      (name, args) => {
        expect(name).toBe('read_image');
        expect(args).toEqual({ file_path: '/authorized/result.png' });
        if (!active) throw new Error('Grant revoked');
        return '/authorized';
      },
    );
    const execute = (id: string) =>
      ctx.tools.execute({
        agent,
        callId: ToolCallId(id),
        name: 'read_image',
        arguments: { file_path: '/authorized/result.png' },
        signal: new AbortController().signal,
      });
    try {
      const result = await execute('image');
      expect(result.isError, JSON.stringify(result)).not.toBe(true);
      expect(result.content).toEqual(
        expect.arrayContaining([expect.objectContaining({ type: 'image' })]),
      );
      expect(reads).toEqual(['/authorized/result.png']);
      supportsImage = false;
      expect((await execute('unsupported-model')).isError).toBe(true);
      expect(reads).toHaveLength(1);
      supportsImage = true;
      active = false;
      expect((await execute('revoked')).isError).toBe(true);
      expect(reads).toHaveLength(1);
      await dispose();
      expect((await execute('disposed')).isError).toBe(true);
      expect(ctx.get('sandboxPolicy')).toBe(base);
    } finally {
      await dispose();
      await scope.dispose();
      await runtime.dispose();
      await providers.dispose();
    }
  });
});
