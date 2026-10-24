import assert from 'node:assert/strict';
import { createHash, randomInt } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.ok(
  [
    '--before',
    '--record-before',
    '--expired-token',
    '--after',
    '--stale-token',
    '--fresh-token',
    '--cleanup',
    '--verify',
  ].includes(mode),
);
const home = process.env.BH_E2E_HOME;
const origin = process.env.BH_E2E_ORIGIN;
const statePath = process.env.BH_E2E_STATE;
const baselinePath = process.env.BH_E2E_BASELINE;
const markerPath = process.env.BH_QA_PROOF_FILE;
const counterPath = process.env.BH_QA_COUNTER_FILE;
for (const path of [home, statePath, baselinePath, markerPath, counterPath])
  assert.ok(path && isAbsolute(path));
const url = new URL(origin);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'http:');
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
const state = JSON.parse(readFileSync(statePath, 'utf8'));
async function rpc(namespace, method, args = {}) {
  const response = await fetch(`${origin}/api/${namespace}/${method}`, {
    method: 'POST',
    signal: AbortSignal.timeout(30000),
    headers: { cookie, 'content-type': 'application/json' },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: crypto.randomUUID(),
      method: `${namespace}/${method}`,
      payload: { args },
    }),
  });
  const result = (await response.json()).result;
  assert.equal(result?.ok, true, `${namespace}/${method}: ${JSON.stringify(result?.error)}`);
  return result.value;
}
async function nativeEvents() {
  const sessionId = (await rpc('botharness', 'sessions', { slug: state.slug })).sessions.find(
    (s) => s.role === 'orchestrator',
  )?.sessionId;
  assert.ok(sessionId);
  const projection = await rpc('session', 'projections', { request: { sessionId } });
  const page = await rpc('session', 'page', {
    request: {
      address: { kind: 'session', sessionId },
      throughSeq: projection.asOfSeq,
      maxMessages: 300,
    },
  });
  return { sessionId, events: page.records.filter((r) => r.type === 'event').map((r) => r.event) };
}
function text(message) {
  return message.content
    .filter((c) => c.type === 'text')
    .map((c) => c.text)
    .join('\n');
}
function structured(message) {
  return text(message)
    .split('\n')
    .map((line) => {
      try {
        return JSON.parse(line).structuredContent;
      } catch {
        return undefined;
      }
    })
    .find(Boolean);
}
function phase(events, prefix, names) {
  const reply = events.findLast(
    (e) =>
      e.type === 'tool/call' &&
      e.data.name === 'bot_send_message' &&
      JSON.parse(e.data.arguments).body.startsWith(prefix),
  );
  assert.ok(reply, `Wait for ${prefix}`);
  const calls = events.filter((e) => e.type === 'tool/call' && e.data.turn === reply.data.turn);
  assert.deepEqual(
    calls.map((e) => e.data.name),
    names,
  );
  assert.ok(events.some((e) => e.type === 'turn/end' && e.data.turn === reply.data.turn));
  const results = calls.map((call) =>
    events.find((e) => e.type === 'tool/result' && e.data.message.toolCallId === call.data.callId),
  );
  assert.ok(results.every(Boolean));
  return { reply, calls, results };
}
function marker() {
  const alphabet = 'ACDEF234679';
  const value = Array.from({ length: 6 }, () => alphabet[randomInt(alphabet.length)]).join('');
  writeFileSync(markerPath, value, { mode: 0o600 });
  return value;
}
function button(message) {
  return structured(message)?.elements.find((e) => e.label === 'QA click counter');
}
const send = (body) => rpc('botharness', 'channelSend', { channelId: state.channelId, body });
const restrictions =
  'No tools except the requested Computer call(s) and bot_send_message. Never read files, use Browser/Shell, observe other apps or desktop, guess or retry, or fall back to pixel/foreground input.';
if (mode === '--before') {
  const pid = Number(process.env.BH_QA_FIXTURE_PID);
  assert.ok(Number.isSafeInteger(pid) && pid > 0);
  marker();
  await rpc('botharness', 'computerAccessSet', { slug: state.slug, enabled: true });
  await send(
    `Local idle QA baseline. Only computer_list_windows with pid:${pid}; never omit the PID filter. Choose its titled BotHarness Local Idle QA window with the largest bounds, then computer_get_window_state with that exact pid/window_id,query:"QA click counter",include_accessibility_tree:true,include_screenshot:true. ${restrictions} Read the six-character code beside the blue circle from the actual image and reply exactly IDLE_BEFORE_QA: <code>. Wait for native approval.`,
  );
} else if (mode === '--record-before') {
  const { events } = await nativeEvents();
  const reply = events.findLast(
    (e) =>
      e.type === 'tool/call' &&
      e.data.name === 'bot_send_message' &&
      JSON.parse(e.data.arguments).body.startsWith('IDLE_BEFORE_QA:'),
  );
  assert.ok(reply);
  const calls = events.filter((e) => e.type === 'tool/call' && e.data.turn === reply.data.turn);
  const before = phase(
    events,
    'IDLE_BEFORE_QA:',
    calls.length === 3
      ? ['computer_list_windows', 'computer_get_window_state', 'bot_send_message']
      : ['computer_get_window_state', 'bot_send_message'],
  );
  const index = calls.length - 2;
  const observation = before.results[index];
  assert.equal(observation.data.message.isError, false);
  const args = JSON.parse(before.calls[index].data.arguments);
  assert.equal(args.query, 'QA click counter');
  if (index === 1) assert.equal(JSON.parse(before.calls[0].data.arguments).pid, args.pid);
  const code = readFileSync(markerPath, 'utf8');
  assert.equal(JSON.parse(before.reply.data.arguments).body.trim(), `IDLE_BEFORE_QA: ${code}`);
  assert.ok(!text(observation.data.message).includes(code));
  const token = button(observation.data.message)?.element_token;
  assert.ok(token);
  assert.equal(readFileSync(counterPath, 'utf8'), '0');
  writeFileSync(
    baselinePath,
    JSON.stringify({
      callId: before.calls[index].data.callId,
      turn: reply.data.turn,
      time: observation.time,
      marker: code,
      token,
      snapshot: structured(observation.data.message).snapshot_id,
      pid: args.pid,
      windowId: args.window_id,
    }),
    { mode: 0o600 },
  );
  console.log('Baseline recorded. Leave Computer idle for at least 330 seconds.');
} else {
  const baseline = JSON.parse(readFileSync(baselinePath, 'utf8'));
  const args = `pid:${baseline.pid},window_id:${baseline.windowId}`;
  if (mode === '--expired-token') {
    assert.ok(
      Date.now() - baseline.time >= 330000,
      'Wait at least 330 seconds after the native observation',
    );
    await send(
      `Local idle QA expired token test. Only computer_click exactly once with ${args},element_token:"${baseline.token}",delivery_mode:"background". This token came from the task-owned QA click counter before idle; its only intended effect is incrementing the disposable fixture counter. ${restrictions} Reply IDLE_EXPIRED_TOKEN_QA: with the actual result; never claim success after a refusal.`,
    );
  } else if (mode === '--after') {
    const code = marker();
    assert.notEqual(code, baseline.marker);
    await send(
      `Local idle QA fresh observation. Only computer_get_window_state exactly once with ${args},query:"QA click counter",include_accessibility_tree:true,include_screenshot:true. ${restrictions} Read the new six-character code from the actual image and reply exactly IDLE_AFTER_QA: <code>. On failure report actual reason.`,
    );
  } else if (mode === '--stale-token') {
    await send(
      `Local idle QA stale token after fresh observation. Only computer_click exactly once with ${args},element_token:"${baseline.token}",delivery_mode:"background". ${restrictions} Reply IDLE_STALE_TOKEN_QA: with the actual failure; this retired token must not increment the task-owned counter.`,
    );
  } else if (mode === '--fresh-token') {
    const { events } = await nativeEvents();
    const stale = phase(events, 'IDLE_STALE_TOKEN_QA:', ['computer_click', 'bot_send_message']);
    assert.equal(stale.results[0].data.message.isError, true);
    assert.ok(text(stale.results[0].data.message).includes('stale_element_token'));
    assert.equal(readFileSync(counterPath, 'utf8'), '0');
    writeFileSync(baselinePath, JSON.stringify({ ...baseline, counterBeforeFresh: 0 }), {
      mode: 0o600,
    });
    const after = phase(events, 'IDLE_AFTER_QA:', [
      'computer_get_window_state',
      'bot_send_message',
    ]);
    const token = button(after.results[0].data.message)?.element_token;
    assert.ok(token && token !== baseline.token);
    await send(
      `Local idle QA fresh token. Only computer_click exactly once with ${args},element_token:"${token}",delivery_mode:"background". If successful, computer_get_window_state exactly once with ${args},query:"Clicks:",include_accessibility_tree:true,include_screenshot:true and read back the fixture count. ${restrictions} The only intended effect is one disposable QA counter increment. Reply IDLE_FRESH_TOKEN_QA: with the actual click result and observed count; do not retry on any failure.`,
    );
  } else if (mode === '--cleanup') {
    await rpc('botharness', 'computerAccessSet', { slug: state.slug, enabled: false });
    await send(
      'Local idle QA has ended; Computer Access is off. No Computer, Shell, Browser or file calls. Reply via bot_send_message: IDLE_ACCESS_OFF_QA: Computer Access is off.',
    );
  } else {
    const output = process.env.BH_E2E_REPORT_DIR;
    assert.ok(output && isAbsolute(output));
    const { sessionId, events } = await nativeEvents();
    const observation = events.find(
      (e) => e.type === 'tool/result' && e.data.message.toolCallId === baseline.callId,
    );
    assert.ok(observation);
    const expired = phase(events, 'IDLE_EXPIRED_TOKEN_QA:', ['computer_click', 'bot_send_message']);
    const after = phase(events, 'IDLE_AFTER_QA:', [
      'computer_get_window_state',
      'bot_send_message',
    ]);
    const stale = phase(events, 'IDLE_STALE_TOKEN_QA:', ['computer_click', 'bot_send_message']);
    const fresh = phase(events, 'IDLE_FRESH_TOKEN_QA:', [
      'computer_click',
      'computer_get_window_state',
      'bot_send_message',
    ]);
    const off = phase(events, 'IDLE_ACCESS_OFF_QA:', ['bot_send_message']);
    assert.ok(expired.calls[0].time - baseline.time >= 330000);
    assert.ok(
      baseline.turn < expired.reply.data.turn &&
        expired.reply.data.turn < after.reply.data.turn &&
        after.reply.data.turn < stale.reply.data.turn &&
        stale.reply.data.turn < fresh.reply.data.turn &&
        fresh.reply.data.turn < off.reply.data.turn,
    );
    for (const refused of [expired, stale]) {
      const args = JSON.parse(refused.calls[0].data.arguments);
      assert.equal(args.pid, baseline.pid);
      assert.equal(args.element_token, baseline.token);
      assert.equal(args.delivery_mode, 'background');
      assert.equal(refused.results[0].data.message.isError, true);
      assert.ok(text(refused.results[0].data.message).includes('stale_element_token'));
    }
    for (const p of [after, fresh]) {
      assert.ok(p.results.every((e) => e.data.message.isError === false));
      for (const c of p.calls.slice(0, -1))
        assert.equal(JSON.parse(c.data.arguments).pid, baseline.pid);
    }
    assert.notEqual(button(after.results[0].data.message).element_token, baseline.token);
    assert.equal(
      JSON.parse(fresh.calls[0].data.arguments).element_token,
      button(after.results[0].data.message).element_token,
    );
    assert.ok(text(fresh.results[1].data.message).includes('Clicks: 1'));
    assert.equal(readFileSync(counterPath, 'utf8'), '1');
    assert.equal(baseline.counterBeforeFresh, 0);
    const beforeCapture = structured(observation.data.message).capture_id;
    const afterCapture = structured(after.results[0].data.message).capture_id;
    assert.equal(beforeCapture.split('_')[1], afterCapture.split('_')[1]);
    assert.notEqual(beforeCapture, afterCapture);
    const current = readFileSync(markerPath, 'utf8');
    assert.notEqual(current, baseline.marker);
    assert.equal(JSON.parse(after.reply.data.arguments).body.trim(), `IDLE_AFTER_QA: ${current}`);
    assert.ok(!text(after.results[0].data.message).includes(current));
    const start = events.find(
      (e) => e.type === 'turn/start' && e.data.turn === off.reply.data.turn,
    );
    const header = events.find((e) => e.type === 'request/header' && e.seq > start.seq);
    assert.ok(header.data.header.tools.every((t) => !t.name.startsWith('computer_')));
    const bot = (await rpc('botharness', 'get', { slug: state.slug })).bot;
    assert.equal(bot.computerAccess ?? false, false);
    assert.notEqual(bot.browserAccess, true);
    mkdirSync(output, { recursive: true });
    const images = [];
    for (const [name, message] of [
      ['before', observation.data.message],
      ['after', after.results[0].data.message],
      ['fresh-counter', fresh.results[1].data.message],
    ]) {
      const image = message.content.find((c) => c.type === 'image')?.attachment;
      assert.ok(image);
      const hash = image.attachmentId.match(/^sha256:([a-f0-9]{64})$/)?.[1];
      assert.ok(hash);
      const bytes = readFileSync(join(home, 'attachments/v1/objects', hash.slice(0, 2), hash));
      assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
      const extension = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }[
        image.mediaType
      ];
      assert.ok(extension);
      writeFileSync(join(output, `${name}.${extension}`), bytes);
      images.push({
        name,
        sha256: hash,
        width: image.width,
        height: image.height,
        bytes: bytes.length,
      });
    }
    writeFileSync(
      join(output, 'native-acceptance.json'),
      JSON.stringify(
        {
          issue: 713,
          sessionId,
          driverVersion: '0.31.0',
          idleMs: expired.calls[0].time - baseline.time,
          markers: { before: baseline.marker, after: current },
          oldToken: baseline.token,
          freshToken: button(after.results[0].data.message).element_token,
          assertions: {
            expiredTokenRefused: true,
            freshObservationReadback: true,
            oldTokenStillRefused: true,
            freshTokenClickCount: 1,
            accessOffComputerTools: 0,
            accessOffComputerCalls: 0,
            sameDriverCaptureRuntime: true,
            counterBeforeFresh: baseline.counterBeforeFresh,
            osPermissionMutation: 'NOT_RUN',
          },
          images,
        },
        null,
        2,
      ),
    );
    console.log(
      'Native idle acceptance PASSED; raw driver images and content-free receipt written.',
    );
  }
}
