import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const runtime = resolve(import.meta.dirname, '../..');
const cli = createRequire(realpathSync(join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js')));
const base = createRequire(cli.resolve('@deepseek-ai/dsh-base'));
const { PiAiAdapter } = await import(
  pathToFileURL(base.resolve('@deepseek-ai/dsh-llm-pi-ai')).href
);

it('native Go adapter forwards actual per-conversation IDs, replaces a stale static header and preserves attribution', async () => {
  const requests = [];
  const provider = 'opencode-go';
  const model = {
    id: 'deepseek-v4-flash',
    provider,
    api: 'openai-completions',
    input: ['text'],
    contextWindow: 1000000,
  };
  const profile = {
    headers: {
      'x-opencode-session': 'wrong-static-id',
      'X-OpenCode-Session': 'wrong-case-id',
      'user-agent': 'wrong-agent',
      'x-custom': 'preserved',
    },
    modelErrors: new Map(),
    piProvider: {},
    streamIdleTimeoutMs: 1000,
  };
  const adapter = new PiAiAdapter({ resolveApiKey: async () => 'test-only-key' });
  adapter.current = () => ({
    profiles: new Map([
      [provider, profile],
      ['deepseek', profile],
    ]),
    models: {
      getModel: () => model,
      streamSimple: async function* (_model, _context, options) {
        requests.push(options.headers);
        yield {
          type: 'done',
          reason: 'stop',
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'ok' }],
            api: model.api,
            provider,
            model: model.id,
            usage: {
              input: 1,
              output: 1,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 2,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            stopReason: 'stop',
            timestamp: Date.now(),
          },
        };
      },
    },
  });
  for (const sessionId of ['conversation-a', 'conversation-a', 'conversation-b', undefined]) {
    for await (const _chunk of adapter.stream({
      provider,
      model: model.id,
      messages: [],
      sessionId,
    })) {
    }
  }
  expect(requests.map((headers) => headers['x-opencode-session'])).toEqual([
    'conversation-a',
    'conversation-a',
    'conversation-b',
    undefined,
  ]);
  expect(requests.every((headers) => !Object.hasOwn(headers, 'X-OpenCode-Session'))).toBe(true);
  expect(requests.every((headers) => headers['x-custom'] === 'preserved')).toBe(true);
  expect(requests.every((headers) => headers['user-agent'].startsWith('deepseek-harness/'))).toBe(
    true,
  );
  for await (const _chunk of adapter.stream({
    provider: 'deepseek',
    model: model.id,
    messages: [],
    sessionId: 'other-provider-session',
  })) {
  }
  expect(requests.at(-1)['x-opencode-session']).toBe('wrong-case-id');
  expect(requests.at(-1)['X-OpenCode-Session']).toBeUndefined();
});
