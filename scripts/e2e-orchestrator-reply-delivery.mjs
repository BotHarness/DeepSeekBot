import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const origin = process.env.BH_E2E_ORIGIN;
const home = process.env.BH_E2E_HOME;
const evidence = process.env.BH_E2E_EVIDENCE;
const requested = process.env.BH_E2E_MODELS?.split(',');
const selectedScenarios = process.env.BH_E2E_SCENARIOS?.split(',');
assert.ok(origin && home && evidence && requested?.length);
assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname));
const cookie = readFileSync(resolve(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(
  ';',
)[0];
const pnpm = resolve('node_modules/.pnpm');
const wsDirectory = readdirSync(pnpm).find((entry) => entry.startsWith('ws@'));
assert.ok(wsDirectory);
const WebSocket = createRequire(resolve(pnpm, wsDirectory, 'node_modules/'))('ws');
const rounds = Number(process.env.BH_E2E_ROUNDS ?? 2);
const imageLabels = process.env.BH_E2E_IMAGE_LABELS?.split(',').filter(Boolean) ?? [];
assert.ok(
  !process.env.BH_E2E_IMAGE || imageLabels.length >= 2,
  'Provide at least two expected image labels',
);
assert.ok(Number.isInteger(rounds) && rounds >= 1 && rounds <= 5);
mkdirSync(evidence, { recursive: true });
const results = [];

async function rpc(method, args = {}) {
  const response = await fetch(`${origin}/api/botharness/${method}`, {
    method: 'POST',
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `botharness/${method}`,
      payload: { args },
    }),
    signal: AbortSignal.timeout(20000),
  });
  const envelope = await response.json();
  assert.equal(envelope.result?.ok, true, `${method} refused`);
  return envelope.result.value;
}

async function snapshot(sessionId) {
  const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/api/remote.mux`, {
    headers: { cookie },
  });
  try {
    await new Promise((done, reject) => {
      socket.once('open', done);
      socket.once('error', reject);
    });
    return await new Promise((done, reject) => {
      const timer = setTimeout(() => reject(Error('Session snapshot timed out')), 15000);
      socket.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'error') {
          clearTimeout(timer);
          reject(Error('Session snapshot refused'));
        } else if (frame.type === 'item' && frame.value.type === 'snapshot') {
          clearTimeout(timer);
          done(frame.value);
        }
      });
      socket.send(
        JSON.stringify({
          type: 'open',
          streamId: crypto.randomUUID(),
          endpoint: 'session/follow',
          payload: {
            args: { request: { address: { kind: 'session', sessionId }, maxMessages: 100 } },
          },
        }),
      );
    });
  } finally {
    socket.terminate();
  }
}

const catalog = (await rpc('modelCatalog')).models;
let image;
if (process.env.BH_E2E_IMAGE) {
  const uploaded = await fetch(
    `${origin}/api/botharness/attachment/upload?name=delivery-image.png`,
    {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/octet-stream' },
      body: readFileSync(process.env.BH_E2E_IMAGE),
      signal: AbortSignal.timeout(20000),
    },
  );
  assert.ok(uploaded.ok, 'Image upload refused');
  image = (await uploaded.json()).attachment;
  assert.ok(image);
}

for (const selection of requested) {
  const [provider, model, effort = 'low'] = selection.split(':');
  const available = catalog.find((entry) => entry.provider === provider && entry.model === model);
  assert.ok(
    available?.efforts.some((entry) => entry.id === effort),
    'Requested route unavailable',
  );
  for (let round = 1; round <= rounds; round++) {
    const marker = `DELIVERY_${round}_${crypto.randomUUID().slice(0, 8)}`;
    const bot = (
      await rpc('create', {
        displayName: `Delivery QA ${model} ${effort} ${round} ${marker.slice(-8)}`,
      })
    ).bot;
    const dmChannelId = `dm-${bot.slug}`;
    await rpc('channelDm', { slug: bot.slug, displayName: bot.displayName });
    const group = (
      await rpc('channelCreate', { name: `${bot.displayName} Group`, members: [bot.slug] })
    ).channel;
    const route = { provider, model, reasoningEffort: effort };
    const preset = (
      await rpc('modelPresetCreate', {
        name: bot.displayName,
        orchestrator: route,
        assignmentDefault: route,
      })
    ).preset;
    await rpc('modelPresetApply', { slug: bot.slug, presetId: preset.id });
    const allCases = [
      { name: 'no-tools-ack', body: `请仅回复 ${marker}，不调用工具。`, marker },
      { name: 'ordinary-followup', body: '测试一下，你收到了吗？' },
      { name: 'short-question', body: '2 加 3 等于多少？请简短回答。', marker: '5' },
      { name: 'capability-question', body: '你可以帮我做什么？用一句话回答。' },
      {
        name: 'native-question-answer',
        body: `用 ask_user_question 问我选择 Canary 还是 Stable，等待我回答。收到真实回答后，用一条消息回复 ${marker}_CHOICE 并包含我选择的选项。不要代替我选择。`,
        marker: `${marker}_CHOICE`,
        question: true,
      },
      {
        name: 'english-ack',
        body: `Only say ${marker}_EN. Do not use tools.`,
        marker: `${marker}_EN`,
      },
      ...(image
        ? [
            {
              name: 'image-followup',
              body: '你看得见这个图片吗？请说出截图中的任意两个标签。',
              attachments: [image],
              image: true,
            },
          ]
        : []),
      {
        name: 'intentional-silence',
        body: '这条只是 FYI，我稍后再说明。不用回复，也不需要采取行动。',
        silent: true,
      },
      {
        name: 'reply-after-silence',
        body: `现在请回复 ${marker}_BACK。`,
        marker: `${marker}_BACK`,
      },
      {
        name: 'group-mention-answer',
        body: `请仅回复 ${marker}_GROUP。`,
        marker: `${marker}_GROUP`,
        group: true,
      },
      {
        name: 'group-mention-fyi',
        body: '只是 FYI，另一个同事负责处理。不用回复，也不用采取行动。',
        silent: true,
        group: true,
      },
    ];
    const cases = selectedScenarios
      ? allCases.filter((scenario) => selectedScenarios.includes(scenario.name))
      : allCases;
    assert.ok(
      cases.length > 0 && (!selectedScenarios || cases.length === selectedScenarios.length),
      'Unknown scenario selection',
    );
    let afterSequence = -1;
    for (const scenario of cases) {
      const channelId = scenario.group ? group.id : dmChannelId;
      const priorDmIds = new Set(
        (await rpc('channelMessages', { channelId: dmChannelId })).messages.map(
          (message) => message.id,
        ),
      );
      const prior = (await rpc('channelMessages', { channelId })).messages;
      const priorIds = new Set(prior.map((message) => message.id));
      const mention = `@${bot.displayName}`;
      const sent = (
        await rpc('channelSend', {
          channelId,
          body: scenario.group ? `${mention} ${scenario.body}` : scenario.body,
          ...(scenario.group
            ? {
                mentions: [
                  { botSlug: bot.slug, label: bot.displayName, start: 0, end: mention.length },
                ],
              }
            : {}),
          ...(scenario.attachments ? { attachments: scenario.attachments } : {}),
        })
      ).message;
      const deadline = Date.now() + 180000;
      let rows;
      let settled = false;
      const answered = new Set();
      while (Date.now() < deadline) {
        rows = (await rpc('channelMessages', { channelId })).messages;
        if (scenario.question) {
          for (const question of rows.filter(
            (message) =>
              !priorIds.has(message.id) && message.userQuestionRequest && !answered.has(message.id),
          )) {
            const response = await rpc('userQuestionAnswer', {
              channelId,
              messageId: question.id,
              answer: {
                answers: question.userQuestionRequest.questions.map((item) => {
                  const option = item.options.find((entry) => /^Canary(?:\s|$)/u.test(entry.label));
                  assert.ok(option, 'Expected synthetic QA option missing');
                  return { id: item.id, selected: [option.label] };
                }),
              },
            });
            assert.equal(response.accepted, true, 'QA question answer refused');
            answered.add(question.id);
          }
        }
        const delivery = rows
          .find((message) => message.id === sent.id)
          ?.deliveries?.find((entry) => entry.botSlug === bot.slug);
        if (delivery?.state === 'handled') {
          settled = true;
          break;
        }
        if (delivery?.state === 'retryable') break;
        if (rows.some((message) => !priorIds.has(message.id) && message.toolApprovalRequest)) break;
        await new Promise((done) => setTimeout(done, 500));
      }
      const session = (await rpc('sessions', { slug: bot.slug })).sessions.find(
        (entry) => entry.role === 'orchestrator',
      );
      const native = session ? await snapshot(session.sessionId) : undefined;
      const events =
        native?.records
          .map((record) => record.event)
          .filter((event) => event.seq > afterSequence) ?? [];
      if (events.length) afterSequence = Math.max(...events.map((event) => event.seq));
      const tools = events
        .filter((event) => event.type === 'tool/call')
        .map((event) => event.data.name);
      const replies =
        rows?.filter(
          (message) =>
            !priorIds.has(message.id) &&
            message.author.kind === 'bot' &&
            !message.userQuestionRequest &&
            !message.toolApprovalRequest &&
            message.author.slug === bot.slug,
        ) ?? [];
      const observed = events
        .filter((event) => event.type === 'assistant/message')
        .map((event) => event.data.message.source)
        .filter((source) => source?.kind === 'model');
      const completed = events.some(
        (event) => event.type === 'turn/end' && event.data.reason.kind === 'completed',
      );
      const actualRoute =
        observed.length > 0 &&
        observed.every((source) => source.provider === provider && source.model === model);
      const imageRead = !scenario.image || tools.includes('channel_read_image');
      const imageContentMatches =
        !scenario.image ||
        imageLabels.filter((label) => replies.some((message) => message.body.includes(label)))
          .length >= 2;
      const deliveryContract =
        native?.records.some(
          (record) =>
            record.event.type === 'system/message' &&
            JSON.stringify(record.event.data).includes('Before ending this Orchestrator turn'),
        ) === true;
      const turnReminder = events.some(
        (event) =>
          event.type === 'user/message' &&
          JSON.stringify(event.data).includes('[Host reply transport reminder]'),
      );
      const questionAnswered =
        !scenario.question || (answered.size === 1 && tools.includes('ask_user_question'));
      const contentMatches =
        !scenario.marker || replies.some((message) => message.body.includes(scenario.marker));
      const delivered = scenario.silent
        ? replies.length === 0 && !tools.includes('channel_send')
        : replies.length === 1 && tools.filter((name) => name === 'channel_send').length === 1;
      const pass =
        settled &&
        completed &&
        actualRoute &&
        native?.hasMore === false &&
        imageRead &&
        imageContentMatches &&
        deliveryContract &&
        turnReminder &&
        questionAnswered &&
        contentMatches &&
        delivered;
      const destinationOnly =
        !scenario.group ||
        !(await rpc('channelMessages', { channelId: dmChannelId })).messages.some(
          (message) =>
            !priorDmIds.has(message.id) &&
            message.author.kind === 'bot' &&
            !message.userQuestionRequest &&
            !message.toolApprovalRequest,
        );
      const result = {
        provider,
        model,
        effort,
        round,
        scenario: scenario.name,
        pass: pass && destinationOnly,
        destinationOnly,
        settled,
        completed,
        actualRoute,
        completeSnapshot: native?.hasMore === false,
        imageRead,
        imageContentMatches,
        deliveryContract,
        turnReminder,
        questionAnswered,
        contentMatches,
        replyCount: replies.length,
        tools,
      };
      results.push(result);
      writeFileSync(
        resolve(evidence, 'reply-delivery.json'),
        JSON.stringify({ imageScenarioIncluded: Boolean(image), results }, null, 2),
      );
      console.log(JSON.stringify(result));
      if (!settled) {
        for (const skipped of cases.slice(cases.indexOf(scenario) + 1))
          results.push({
            provider,
            model,
            effort,
            round,
            scenario: skipped.name,
            pass: false,
            skipped: true,
            skipReason: 'previous-scenario-unsettled',
          });
        writeFileSync(
          resolve(evidence, 'reply-delivery.json'),
          JSON.stringify({ imageScenarioIncluded: Boolean(image), results }, null, 2),
        );
        break;
      }
    }
  }
}
assert.ok(
  results.every((result) => result.pass),
  'Reply delivery matrix has failures; inspect evidence',
);
