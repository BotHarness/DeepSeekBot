import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { zstdDecompressSync } from 'node:zlib';
import { resolve, dirname } from 'node:path';
import { cookieFor } from './verify-app.mjs';

const instance = JSON.parse(readFileSync(process.env.BH_E2E_INSTANCE, 'utf8'));
const expected = process.env.BH_E2E_EXPECT ?? 'recovered';
assert(['recovered', 'blocked'].includes(expected));
const evidence = resolve(
  process.env.BH_E2E_EVIDENCE ?? '.humanlayer/verify/context-overflow/result.json',
);
const origin = new URL(instance.url).origin;
async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30_000),
    headers: {
      'content-type': 'application/json',
      connection: 'close',
      cookie: cookieFor(instance.home),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method,
      payload: { args },
    }),
  });
  assert.equal(response.status, 200, method);
  const envelope = await response.json();
  assert(
    !envelope.error && envelope.result?.ok !== false,
    `${method}: ${envelope.result?.error?.message ?? envelope.result?.error?.code ?? 'refused'}`,
  );
  return envelope.result?.ok === true ? envelope.result.value : envelope.result;
}

let channelId;
let sessionId;
let persistedReplacement;
let summaries = 0;
let refusals = 0;
let retriedWithReplacedContext = false;
let requestOrder = 0;
let summaryOrder;
let retryOrder;
function replacementCheckpoint() {
  const root = resolve(instance.home, 'sessions');
  for (const file of readdirSync(root, { recursive: true })) {
    if (!file.endsWith('session.v4.jsonl.zstd')) continue;
    const bytes = readFileSync(resolve(root, file));
    let text = '';
    for (let offset = 0; offset < bytes.length;) {
      const frame = zstdDecompressSync(bytes.subarray(offset), { info: true });
      assert(frame.engine.bytesWritten > 0);
      offset += frame.engine.bytesWritten;
      text += frame.buffer.toString('utf8');
    }
    const [header, ...events] = text.trim().split('\n').map(JSON.parse);
    if (header.id !== sessionId) continue;
    const summary = events.find((event) => event.type === 'compaction/summary');
    const replacement = events.find((event) => event.surfaceOp?.op === 'replace');
    assert(summary && replacement, 'summary and replacement must be persisted before retry');
    return {
      summarySeq: summary.seq,
      replacementSeq: replacement.seq,
      beforeRequest: requestOrder,
    };
  }
  throw new Error('No persisted Session for retry');
}
const server = createServer(async (request, response) => {
  try {
    let raw = '';
    for await (const chunk of request) raw += chunk;
    const input = JSON.parse(raw);
    requestOrder++;
    const messages = JSON.stringify(input.messages ?? []);
    const summary = messages.includes('acting as a compaction engine');
    const probe = messages.includes('[OVERFLOW_PROBE]');
    if (summary) {
      summaries++;
      summaryOrder = requestOrder;
    }
    if (probe && !summary && summaries > 0 && retryOrder === undefined) {
      retryOrder = requestOrder;
      retriedWithReplacedContext =
        !messages.includes('[SEED]') &&
        messages.includes('Earlier seed completed. Preserve the latest recovery request.');
      assert(retriedWithReplacedContext, 'retry must use the summary instead of the old seed');
      persistedReplacement = await replacementCheckpoint();
    }
    if (probe && !summary && summaries === 0) {
      refusals++;
      response.writeHead(400, { 'content-type': 'application/json' });
      response.end(
        JSON.stringify({
          type: 'invalid_request_error',
          code: 'invalid_request_error',
          message:
            'Upstream request failed: [invalid_request_error] Input too long: model limit 1048576 tokens, requested 1123530 tokens',
        }),
      );
      return;
    }
    const tool = input.tools?.find((item) => item.function?.name === 'bot_send_message');
    const delta = summary
      ? { content: 'Earlier seed completed. Preserve the latest recovery request.' }
      : input.messages.at(-1)?.role === 'tool' || !tool
        ? { content: 'Done.' }
        : {
            tool_calls: [
              {
                index: 0,
                id: `qa-${crypto.randomUUID()}`,
                type: 'function',
                function: {
                  name: tool.function.name,
                  arguments: JSON.stringify({
                    channel_id: channelId,
                    body: probe ? 'OVERFLOW_RECOVERED' : 'SEED_OK',
                    end_turn: true,
                  }),
                },
              },
            ],
          };
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.end(
      [
        { choices: [{ delta: { role: 'assistant', ...delta }, index: 0, finish_reason: null }] },
        {
          choices: [
            { delta: {}, index: 0, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' },
          ],
          usage: { prompt_tokens: 3000, completion_tokens: 20 },
        },
      ]
        .map((value) => `data: ${JSON.stringify(value)}\n\n`)
        .join('') + 'data: [DONE]\n\n',
    );
  } catch {
    response.writeHead(500);
    response.end('fixture failed');
  }
});

async function until(read, accept) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('Context-overflow journey timed out');
}

try {
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  const described = await rpc('settings/describe');
  const setting = described.namespaces.find((entry) => entry.ns.includes('llm-pi-ai'));
  assert(setting, 'native pi-ai settings available');
  await rpc('settings/update', {
    ns: setting.ns,
    patch: {
      providers: {
        'overflow-fixture': {
          api: 'openai-completions',
          baseURL: `http://127.0.0.1:${server.address().port}`,
          apiKeyEnv: 'DSH_OVERFLOW_FIXTURE_KEY',
          models: [{ id: 'fixture', contextWindow: 1_000_000 }],
        },
      },
    },
  });
  const route = { provider: 'overflow-fixture', model: 'fixture' };
  await until(
    () => rpc('botharness/modelCatalog'),
    (result) => result.models.some((model) => model.provider === route.provider),
  );
  const { bot } = await rpc('botharness/create', { displayName: 'Context overflow QA' });
  channelId = (await rpc('botharness/channelDm', { slug: bot.slug })).channel.id;
  const { preset } = await rpc('botharness/modelPresetCreate', {
    name: `Overflow replay ${Date.now()}`,
    orchestrator: route,
    assignmentDefault: route,
  });
  await rpc('botharness/modelPresetApply', { slug: bot.slug, presetId: preset.id });
  await rpc('botharness/channelSend', {
    channelId,
    body: '[SEED] ' + 'Earlier task context. '.repeat(500),
  });
  const messages = () => rpc('botharness/channelMessages', { channelId });
  await until(messages, (result) => result.messages.some((message) => message.body === 'SEED_OK'));
  await until(
    () => rpc('botharness/list'),
    (result) =>
      result.bots.some((item) => item.slug === bot.slug && item.aggregateState === 'idle'),
  );
  for (let index = 0; index < 2; index++) {
    await rpc('botharness/channelSend', {
      channelId,
      body: `[RECENT_${index}] Finish a newer task.`,
    });
    await until(
      messages,
      (value) =>
        value.messages.filter((message) => message.body === 'SEED_OK').length === index + 2,
    );
    await until(
      () => rpc('botharness/list'),
      (value) =>
        value.bots.some((item) => item.slug === bot.slug && item.aggregateState === 'idle'),
    );
  }
  const beforeContext = await rpc('botharness/botContext', { slug: bot.slug });
  assert(beforeContext.sessionId);
  sessionId = beforeContext.sessionId;
  await rpc('botharness/channelSend', {
    channelId,
    body: '[OVERFLOW_PROBE] Reply after recovery.',
  });
  const result = await until(messages, (value) =>
    value.messages.some((message) =>
      expected === 'recovered'
        ? message.body === 'OVERFLOW_RECOVERED'
        : message.sessionFailure?.code === 'INVALID_REQUEST',
    ),
  );
  assert.equal(summaries, expected === 'recovered' ? 1 : 0);
  assert(refusals > 0);
  if (expected === 'recovered') {
    assert(retriedWithReplacedContext);
    assert(retryOrder > summaryOrder);
    assert(persistedReplacement);
  }
  const afterContext = await rpc('botharness/botContext', { slug: bot.slug });
  assert.equal(afterContext.sessionId, beforeContext.sessionId);
  const record = {
    expected,
    verdict: 'pass',
    dshVersion: instance.dshVersion,
    summaries,
    refusals,
    sameSession: true,
    retriedWithReplacedContext,
    summaryOrder: summaryOrder ?? null,
    retryOrder: retryOrder ?? null,
    persistedReplacement: persistedReplacement ?? null,
    reply: result.messages.find((message) => message.body === 'OVERFLOW_RECOVERED')?.body ?? null,
    failureCodes: result.messages.flatMap((message) =>
      message.sessionFailure ? [message.sessionFailure.code] : [],
    ),
  };
  mkdirSync(dirname(evidence), { recursive: true });
  writeFileSync(evidence, JSON.stringify(record, null, 2) + '\n');
  console.log(JSON.stringify(record));
} finally {
  server.closeAllConnections();
  await new Promise((done) => server.close(done));
}
