import { createRequire } from 'node:module';
import { realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

const runtime = resolve(import.meta.dirname, '../..');
const cli = createRequire(realpathSync(join(runtime, 'node_modules/@deepseek-ai/dsh/lib/bin.js')));
const base = createRequire(cli.resolve('@deepseek-ai/dsh-base'));
const piAi = createRequire(base.resolve('@deepseek-ai/dsh-llm-pi-ai'));
const { PiAiAdapter } = await import(
  pathToFileURL(base.resolve('@deepseek-ai/dsh-llm-pi-ai')).href
);
const { resolveRetryPolicy } = await import(
  pathToFileURL(piAi.resolve('@deepseek-ai/dsh-llm')).href
);

const provider = 'local-serial';
const model = {
  id: 'local-model',
  provider,
  api: 'openai-completions',
  input: ['text'],
  contextWindow: 128000,
};
const usage = {
  input: 0,
  output: 0,
  cacheRead: 0,
  cacheWrite: 0,
  totalTokens: 0,
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
};

async function failureCodeFor(errorMessage) {
  const profile = { modelErrors: new Map(), piProvider: {}, streamIdleTimeoutMs: 1000 };
  const adapter = new PiAiAdapter({ resolveApiKey: async () => 'test-only-key' });
  adapter.current = () => ({
    profiles: new Map([[provider, profile]]),
    models: {
      getModel: () => model,
      streamSimple: async function* () {
        yield {
          type: 'error',
          reason: 'error',
          error: {
            role: 'assistant',
            content: [],
            api: model.api,
            provider,
            model: model.id,
            usage,
            stopReason: 'error',
            errorMessage,
            timestamp: Date.now(),
          },
        };
      },
    },
  });
  let finish;
  for await (const chunk of adapter.stream({ provider, model: model.id, messages: [] })) {
    if (chunk.type === 'finish') finish = chunk;
  }
  expect(finish?.reason.kind).toBe('error');
  return finish.reason.failure.code;
}

it.each([
  'Concurrency limit exceeded for user, please retry later',
  '400: {"message":"Concurrency limit exceeded for user, please retry later"}',
  'Too many concurrent requests',
  'Too many requests',
  'Server is busy, please try again later',
])('classifies "%s" as a retryable RATE_LIMIT', async (message) => {
  const code = await failureCodeFor(message);
  expect(code).toBe('RATE_LIMIT');
  expect(resolveRetryPolicy(undefined, 'test').retryableCodes).toContain(code);
});

it('keeps unrelated and quota failures out of RATE_LIMIT', async () => {
  expect(await failureCodeFor('model produced malformed tool call')).toBe('PI_AI_ERROR');
  expect(await failureCodeFor('400 invalid request, please retry later')).toBe('INVALID_REQUEST');
  expect(await failureCodeFor('insufficient_quota: please add credits and retry later')).not.toBe(
    'RATE_LIMIT',
  );
});
