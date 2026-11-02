import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { tmpdir } from 'node:os';

const mode = process.argv[2];
assert.ok(['--prepare', '--capture', '--failure', '--cleanup', '--verify'].includes(mode));
const home = process.env.BH_E2E_HOME;
const origin = process.env.BH_E2E_ORIGIN;
const statePath = process.env.BH_E2E_STATE;
assert.ok(home && origin && statePath, 'Set private home, origin and state paths');
assert.ok(isAbsolute(home) && isAbsolute(statePath));
const url = new URL(origin);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.protocol, 'http:');
const cookie = readFileSync(join(tmpdir(), `dsh-${basename(home)}.cookies`), 'utf8').split(';')[0];
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
const api = (method, args) => rpc('botharness', method, args);
async function route(path, body) {
  const response = await fetch(`${origin}/api/computer/${path}`, {
    signal: AbortSignal.timeout(30000),
    headers: { cookie, 'content-type': 'application/json' },
    ...(body === undefined ? {} : { method: 'POST', body: JSON.stringify(body) }),
  });
  assert.equal(response.ok, true);
  return response.json();
}
if (mode === '--prepare') {
  assert.equal((await route('status')).target, 'local');
  assert.equal((await route('start', { authorize: true, target: 'local' })).ok, true);
  const bot = (await api('create', { displayName: 'Local Screenshot QA', model: 'deepseek-flash' }))
    .bot;
  const channel = (await api('channelDm', { slug: bot.slug })).channel;
  assert.notEqual(bot.browserAccess, true);
  writeFileSync(statePath, JSON.stringify({ slug: bot.slug, channelId: channel.id }), {
    mode: 0o600,
  });
  console.log('Prepared isolated Local Screenshot QA; leave Auto-allow off.');
} else {
  const state = JSON.parse(readFileSync(statePath, 'utf8'));
  const pid = Number(process.env.BH_QA_FIXTURE_PID);
  assert.ok(Number.isSafeInteger(pid) && pid > 0, 'Set the task-owned fixture PID');
  if (mode === '--capture' || mode === '--failure') {
    assert.equal((await route('status')).target, 'local');
    assert.equal((await route('status')).status.state, 'running');
    await api('computerAccessSet', { slug: state.slug, enabled: true });
    const body =
      mode === '--capture'
        ? `Local screenshot QA. Only observe the task-owned process pid=${pid}, window titled BotHarness Local Screenshot QA. Call computer_list_windows with only that pid, then computer_get_window_state for its matching window_id with include_accessibility_tree:true and include_screenshot:true. Do not capture the desktop or other apps, use Shell/Browser, or send input. Read the six-character code beside the blue circle from the actual image and send bot_send_message beginning VISUAL_QA: followed by that code. The code is absent from Accessibility. If no image is available, report the actual failure instead of guessing. Wait for native approval.`
        : `Local screenshot failure QA. Call computer_get_window_state exactly once with pid=${pid},window_id:99999999,include_accessibility_tree:true,include_screenshot:true. This deliberately absent task-window ID tests failure only. Do not list other windows, retry, use Shell/Browser or send input. Send bot_send_message beginning CAPTURE_FAILURE_QA: with the actual failed result; never claim success.`;
    await api('channelSend', { channelId: state.channelId, body });
    console.log(
      'Real model Turn started; approve only its task-window call through the native card.',
    );
  } else if (mode === '--cleanup') {
    await api('computerAccessSet', { slug: state.slug, enabled: false });
    await api('channelSend', {
      channelId: state.channelId,
      body: 'Local screenshot QA has ended and Computer Access is off. Do not call Computer, Shell or Browser. Reply with bot_send_message: ACCESS_OFF_QA: Computer Access is off.',
    });
    console.log('Temporary Access disabled; wait for the real revocation reply, then verify.');
  } else {
    const output = process.env.BH_E2E_REPORT_DIR;
    const markerFile = process.env.BH_QA_PROOF_FILE;
    assert.ok(output && markerFile && isAbsolute(output) && isAbsolute(markerFile));
    const marker = readFileSync(markerFile, 'utf8');
    assert.match(marker, /^[A-F0-9]{6}$/);
    const sessionId = (await api('sessions', { slug: state.slug })).sessions.find(
      (s) => s.role === 'orchestrator',
    )?.sessionId;
    assert.ok(sessionId);
    const projection = await rpc('session', 'projections', { request: { sessionId } });
    const page = await rpc('session', 'page', {
      request: {
        address: { kind: 'session', sessionId },
        throughSeq: projection.asOfSeq,
        maxMessages: 200,
      },
    });
    const events = page.records.filter((r) => r.type === 'event').map((r) => r.event);
    const calls = events.filter((r) => r.type === 'tool/call');
    const results = new Map(
      events.filter((r) => r.type === 'tool/result').map((r) => [r.data.message.toolCallId, r]),
    );
    const reply = (prefix) =>
      calls.findLast(
        (r) =>
          r.data.name === 'bot_send_message' &&
          JSON.parse(r.data.arguments).body.startsWith(prefix),
      );
    const captureReply = reply('VISUAL_QA:');
    assert.ok(captureReply);
    assert.equal(JSON.parse(captureReply.data.arguments).body.trim(), `VISUAL_QA: ${marker}`);
    const capture = calls.filter((r) => r.data.turn === captureReply.data.turn);
    assert.deepEqual(
      capture.map((r) => r.data.name),
      ['computer_list_windows', 'computer_get_window_state', 'bot_send_message'],
    );
    for (const call of capture)
      assert.equal(results.get(call.data.callId)?.data.message.isError, false);
    const observation = capture[1];
    const args = JSON.parse(observation.data.arguments);
    assert.equal(args.pid, pid);
    assert.equal(JSON.parse(capture[0].data.arguments).pid, pid);
    assert.equal(args.include_screenshot, true);
    const observed = results.get(observation.data.callId).data.message.content;
    const tree = observed
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('\n');
    assert.ok(!tree.includes(marker), 'Visual marker must not be in AX/structured text');
    const image = observed.find((c) => c.type === 'image')?.attachment;
    assert.ok(image);
    const hash = image.attachmentId.match(/^sha256:([a-f0-9]{64})$/)?.[1];
    assert.ok(hash);
    const bytes = readFileSync(join(home, 'attachments/v1/objects', hash.slice(0, 2), hash));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
    assert.equal(bytes.length, image.bytes);
    assert.ok(image.width > 0 && image.height > 0);
    const failureReply = reply('CAPTURE_FAILURE_QA:');
    const revokedReply = reply('ACCESS_OFF_QA:');
    assert.ok(failureReply && revokedReply);
    const failed = calls.filter((r) => r.data.turn === failureReply.data.turn);
    assert.deepEqual(
      failed.map((r) => r.data.name),
      ['computer_get_window_state', 'bot_send_message'],
    );
    assert.deepEqual(JSON.parse(failed[0].data.arguments), {
      include_accessibility_tree: true,
      include_screenshot: true,
      pid,
      window_id: 99999999,
    });
    const refused = results.get(failed[0].data.callId).data.message;
    assert.equal(refused.isError, true);
    assert.ok(
      refused.content.some((c) => c.type === 'text' && c.text.includes('window_id_not_found')),
    );
    assert.ok(!refused.content.some((c) => c.type === 'image'));
    const revokedCalls = calls.filter((r) => r.data.turn === revokedReply.data.turn);
    assert.deepEqual(
      revokedCalls.map((r) => r.data.name),
      ['bot_send_message'],
    );
    for (const turn of [captureReply.data.turn, failureReply.data.turn, revokedReply.data.turn])
      assert.ok(events.some((r) => r.type === 'turn/end' && r.data.turn === turn));
    const revokedStart = events.find(
      (r) => r.type === 'turn/start' && r.data.turn === revokedReply.data.turn,
    );
    const revokedHeader = events.find(
      (r) => r.type === 'request/header' && r.seq > revokedStart.seq,
    );
    assert.ok(revokedHeader);
    assert.ok(revokedHeader.data.header.tools.every((t) => !t.name.startsWith('computer_')));
    const messages = (await api('channelMessages', { channelId: state.channelId, limit: 200 }))
      .messages;
    const approval = messages.find(
      (m) =>
        m.toolApprovalRequest?.toolName === 'computer_list_windows' &&
        JSON.parse(m.toolApprovalRequest.input).pid === pid,
    );
    assert.ok(approval);
    assert.ok(
      messages.some(
        (m) =>
          m.toolApprovalDecision?.requestMessageId === approval.id &&
          m.toolApprovalDecision.outcome === 'allowed-once',
      ),
    );
    const bot = (await api('get', { slug: state.slug })).bot;
    assert.equal(bot.computerAccess ?? false, false);
    assert.notEqual(bot.browserAccess, true);
    const audit = (await route('logs?plugin=computer&limit=1000')).entries;
    const failureAudit = audit.findLast(
      (r) =>
        r.detail.includes(`pid=${pid} window=99999999`) &&
        r.detail.includes(`session=${sessionId}`),
    );
    assert.ok(failureAudit?.detail.includes('-> error: Computer driver reported a tool failure'));
    const scopedAudit = audit.filter((r) => r.detail.includes(`session=${sessionId}`));
    assert.ok(scopedAudit.every((r) => !r.detail.includes(marker) && !r.detail.includes(hash)));
    mkdirSync(output, { recursive: true });
    const extension = {
      'image/webp': 'webp',
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/gif': 'gif',
    }[image.mediaType];
    assert.ok(extension);
    writeFileSync(join(output, `driver-window.${extension}`), bytes);
    const receipt = {
      capturedAt: new Date().toISOString(),
      driverVersion: '0.28.0',
      nativeApproval: 'allowed-once',
      captureTurn: captureReply.data.turn,
      failureTurn: failureReply.data.turn,
      revokedTurn: revokedReply.data.turn,
      visualMarker: marker,
      visualMarkerAbsentFromAX: true,
      realNativeScreenshot: 'PASS',
      attachment: image,
      markerReadback: 'PASS',
      driverFailure: 'PASS',
      driverFailureCode: 'window_id_not_found',
      driverFailureCalls: 1,
      driverFailureAudit: 'error',
      accessOff: true,
      revokedComputerTools: 0,
      revokedComputerCalls: 0,
      noOtherAppShellOrBrowserCalls: true,
      liveOsPermissionRevocation: 'NOT_RUN',
    };
    writeFileSync(join(output, 'native-acceptance.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(
      'PASS: real image/visual readback, explicit failure/Audit error, and Access-off Turn.',
    );
  }
}
