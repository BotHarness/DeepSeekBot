import { createServer } from 'node:http';
import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { createScope } from '@deepseek-ai/dsh-scope';
import { ToolRuntime } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  ProtectedMcp,
  PRIVATE_MCP_TOOL,
  privateMcpStatus,
} from '../src/credentials/protected-mcp.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { createChannelStore } from '../src/channels/store.js';
import { createTempRoot, createTestOwnership } from './helpers.js';
import { createTestRegistry, registryDatabase } from './registry-fixture.js';

const canary = 'SYNTHETIC-private-mcp-1384';
const safe = { content: [{ type: 'text', text: '200' }], structuredContent: { httpStatus: 200 } };

describe('protected native MCP consumer', () => {
  it.each([
    { ...safe, content: [{ type: 'text', text: canary }] },
    { ...safe, content: [{ type: 'text', text: Buffer.from(canary).toString('base64') }] },
    { ...safe, content: [...safe.content, { type: 'image', data: canary, mimeType: 'image/png' }] },
    { ...safe, structuredContent: { httpStatus: 200, echo: canary } },
    { ...safe, _meta: { secret: canary } },
    { ...safe, isError: true },
    { ...safe, structuredContent: { httpStatus: '200' } },
    { ...safe, structuredContent: { httpStatus: 200.1 } },
    { ...safe, structuredContent: { httpStatus: 600 } },
    { content: [{ type: 'resource_link', uri: canary }], structuredContent: { httpStatus: 200 } },
  ])('rejects unqualified protocol output without echoing it', (result) => {
    expect(() => privateMcpStatus(result)).toThrow(
      'Protected MCP returned an invalid nonsecret result',
    );
  });

  it('runs actual MCP discovery/call through the native adapter and retains only references in the outer invocation', async () => {
    let requests = 0;
    let delay = false;
    let entered!: () => void;
    let disconnected!: () => void;
    const server = createServer((request, response) => {
      requests++;
      const accepted =
        request.headers['x-api-key'] === canary &&
        request.headers['x-api-secret'] === canary + '-secret';
      if (delay) {
        response.on('close', () => disconnected());
        entered();
        return;
      }
      response.writeHead(accepted ? 200 : 401, { 'x-private-echo': canary });
      response.end(canary + Buffer.from(canary).toString('base64'));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture');
    const endpoint = `http://127.0.0.1:${address.port}/status?private=${canary}`;
    const root = createTempRoot('bh-protected-mcp-');
    const ctx = new Context();
    await ctx
      .plugin(LocalCredentialProvider, { path: join(root, '.credentials.yaml'), watch: false })
      .await();
    await ctx
      .plugin({
        name: 'mcp-test-prompt',
        apply(c: Context) {
          c.provide('systemPrompt', { tools: () => () => undefined });
        },
      })
      .await();
    await ctx.plugin(ToolRuntime, {}).await();
    const agent = { session: { id: 'ada-session' } } as Agent;
    const bea = { session: { id: 'bea-session' } } as Agent;
    const scopes = [agent, bea].map((current) => createScope(ctx, current));
    const registry = createTestRegistry({ rootDir: root });
    registry.create({ slug: 'ada', displayName: 'Ada' });
    registry.create({ slug: 'bea', displayName: 'Bea' });
    const channels = createChannelStore({ rootDir: join(root, 'channels') });
    channels.getOrCreateDm('ada', 'Ada');
    channels.getOrCreateDm('bea', 'Bea');
    const logs = vi.fn();
    const owner = new PrivateInputs({
      channels,
      registry,
      ownership: createTestOwnership({
        'ada-session': { botSlug: 'ada', rootRole: 'orchestrator' },
        'bea-session': { botSlug: 'bea', rootRole: 'orchestrator' },
      }),
      credentials: () => ctx.credentials,
      isLive: (candidate) => candidate === agent || candidate === bea,
      canRequest: () => true,
      qualified: async () => true,
      log: logs,
    });
    const mcp = new ProtectedMcp(logs);
    try {
      [agent, bea].forEach((current, index) => mcp.register(scopes[index]!.ctx, current, owner));
      ctx.tools.guard(({ name, agent: current }) =>
        name === PRIVATE_MCP_TOOL && current !== undefined ? mcp.denial(ctx, current) : undefined,
      );
      expect(ctx.tools.get(PRIVATE_MCP_TOOL)).toBeUndefined();
      const pending = owner.ask(
        agent,
        {
          account: 'mcp-demo',
          purpose: 'Generic MCP acceptance',
          fields: ['endpoint', 'api_key', 'api_secret'].map((id) => ({
            id,
            label: id,
            required: true,
          })),
        },
        new AbortController().signal,
      );
      await vi.waitFor(() => expect(channels.readMessages('dm-ada')).toHaveLength(1));
      const card = channels.readMessages('dm-ada')[0]!.id;
      await owner.submit(true, {
        channelId: 'dm-ada',
        messageId: card,
        values: { endpoint, api_key: canary, api_secret: canary + '-secret' },
      });
      const configured = await pending;
      const args = { account: 'mcp-demo', ...configured.references };
      const original = JSON.stringify(args);
      let calls = 0;
      const invoke = (current = agent, argumentsValue: Record<string, unknown> = args) =>
        ctx.tools.execute({
          agent: current,
          callId: ToolCallId('private-mcp-' + ++calls),
          name: PRIVATE_MCP_TOOL,
          arguments: argumentsValue,
          signal: new AbortController().signal,
        });
      const result = await invoke();
      expect(result.isError).toBe(false);
      expect(JSON.stringify(result)).toContain('mcp-http-status-v1');
      expect(JSON.stringify(result)).toContain('200');
      expect(requests).toBe(1);
      expect(JSON.stringify(args)).toBe(original);
      expect((await invoke(bea)).isError).toBe(true);
      expect((await invoke(agent, { ...args, account: 'other' })).isError).toBe(true);
      expect((await invoke(agent, { ...args, command: 'print-private-values' })).isError).toBe(
        true,
      );
      expect((await invoke(agent, { ...args, server: 'unqualified' })).isError).toBe(true);
      expect(requests).toBe(1);
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const stopped = new Promise<void>((resolve) => {
        disconnected = resolve;
      });
      delay = true;
      const running = invoke();
      await started;
      expect(await owner.revoke(true, 'dm-ada', card)).toEqual({
        accepted: true,
        stopped: 1,
        completed: 0,
        uncertain: 0,
      });
      const cancelled = await running;
      expect(cancelled.isError).toBe(true);
      expect(JSON.stringify(cancelled.content)).toContain('remote effects are unknown');
      await stopped;
      expect((await invoke()).isError).toBe(true);
      expect(requests).toBe(2);
      const publicEvidence = JSON.stringify({
        result,
        history: channels.readMessages('dm-ada'),
        logs: logs.mock.calls,
      });
      expect(publicEvidence).not.toContain(canary);
      expect(publicEvidence).not.toContain(Buffer.from(canary).toString('base64'));
    } finally {
      await mcp.close();
      await owner.close();
      await Promise.all(scopes.map((scope) => scope.dispose()));
      await ctx.fiber.dispose();
      registryDatabase(root).close();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }, 15_000);

  it('discards real MCP failures and safely reports stale credentials without retry', async () => {
    const mcp = new ProtectedMcp(() => undefined);
    const server = createServer((_request, response) => {
      response.writeHead(401, { 'x-echo': canary });
      response.end(canary);
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('Missing fixture');
    const signal = new AbortController().signal;
    try {
      expect(
        await mcp.authenticatedStatus(
          { endpoint: `http://127.0.0.1:${address.port}/`, api_key: canary, api_secret: canary },
          signal,
        ),
      ).toEqual({
        consumer: 'mcp-http-status-v1',
        successful: false,
        httpStatus: 401,
        action:
          'Replace private information in Web Chat and retry; remote authorization may also need repair.',
      });
      await expect(
        mcp.authenticatedStatus({ endpoint: canary, api_key: canary, api_secret: canary }, signal),
      ).rejects.toThrow('Protected MCP execution failed or was cancelled');
      await expect(
        mcp.authenticatedStatus(
          { endpoint: 'https://user:pass@example.com', api_key: canary, api_secret: canary },
          signal,
        ),
      ).rejects.toThrow('Protected MCP execution failed or was cancelled');
    } finally {
      await mcp.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
