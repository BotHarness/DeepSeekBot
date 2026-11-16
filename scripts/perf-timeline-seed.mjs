import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const directSession = /^direct-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;

async function bounded(promise, timeoutMs, code) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(code)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

function matchesRequest(message, slug, args) {
  const request = message.toolApprovalRequest;
  if (
    message.author.kind !== 'bot' ||
    message.author.slug !== slug ||
    request.role !== 'orchestrator' ||
    !directSession.test(request.sessionId) ||
    request.callId !== request.sessionId ||
    request.toolName !== 'bot_send_message'
  )
    return false;
  try {
    return isDeepStrictEqual(JSON.parse(request.input), args);
  } catch {
    return false;
  }
}

export async function runTimelineSeedTool({
  rpc,
  slug,
  args,
  timeoutMs = 30_000,
  pollMs = 25,
  onState = () => undefined,
}) {
  let closed = false;
  let channelId;
  let previous = new Set();
  let settled;
  let running;
  let verified;
  const state = { botSlug: slug, operation: 'not-started' };
  const publish = () => onState({ ...state });
  const remember = (message) => {
    verified = message;
    Object.assign(state, {
      channelId,
      messageId: message.id,
      sessionId: message.toolApprovalRequest.sessionId,
      callId: message.toolApprovalRequest.callId,
    });
    publish();
  };
  const pendingFrom = (messages) => {
    const decided = new Set(
      messages.flatMap((message) =>
        message.toolApprovalDecision ? [message.toolApprovalDecision.requestMessageId] : [],
      ),
    );
    return messages.filter(
      (message) =>
        message.toolApprovalRequest && !previous.has(message.id) && !decided.has(message.id),
    );
  };
  const execute = async () => {
    channelId = (await rpc('channelDm', { slug })).channel.id;
    state.channelId = channelId;
    previous = new Set(
      (await rpc('channelMessages', { channelId })).messages.map((message) => message.id),
    );
    if (closed) return;
    state.operation = 'pending';
    publish();
    running = rpc('botToolRun', { slug, tool: 'bot_send_message', args }).then(
      (value) => {
        settled = { ok: true, value };
        state.operation = 'completed';
      },
      (error) => {
        settled = { ok: false, error };
        state.operation = 'failed';
      },
    );
    const approved = new Set();
    while (!closed) {
      await Promise.race([running, pause(pollMs)]);
      if (settled) {
        publish();
        if (!settled.ok) throw settled.error;
        return settled.value;
      }
      const messages = (await rpc('channelMessages', { channelId })).messages;
      if (closed) break;
      const pending = pendingFrom(messages).filter((message) => !approved.has(message.id));
      assert.ok(pending.length <= 1, 'timeline-seed-unexpected-approval-count');
      for (const message of pending) {
        assert.ok(
          matchesRequest(message, slug, args) && approved.size === 0,
          'timeline-seed-unrelated-approval',
        );
        remember(message);
        assert.equal(
          (await rpc('toolApprovalStatus', { channelId, messageId: message.id })).status,
          'pending',
          'timeline-seed-approval-not-pending',
        );
        if (closed) break;
        const decision = await rpc('toolApprovalDecide', {
          channelId,
          messageId: message.id,
          outcome: 'allowed-once',
        });
        assert.equal(decision.accepted, true, 'timeline-seed-approval-refused');
        approved.add(message.id);
        state.decision = 'allowed-once';
        publish();
      }
    }
  };
  try {
    return await bounded(execute(), timeoutMs, 'timeline-seed-tool-timeout');
  } catch (error) {
    closed = true;
    state.cleanup = 'not-required';
    if (running && !settled) {
      let cleanupClosed = false;
      try {
        await bounded(
          (async () => {
            if (!verified) {
              const matching = pendingFrom(
                (await rpc('channelMessages', { channelId })).messages,
              ).filter((message) => matchesRequest(message, slug, args));
              if (matching.length === 1) remember(matching[0]);
            }
            if (verified && !cleanupClosed) {
              const status = (
                await rpc('toolApprovalStatus', { channelId, messageId: verified.id })
              ).status;
              if (status === 'pending' && !cleanupClosed) {
                const result = await rpc('toolApprovalDecide', {
                  channelId,
                  messageId: verified.id,
                  outcome: 'rejected',
                });
                state.cleanup = result.accepted ? 'rejected' : 'rejection-refused';
              } else state.cleanup = status;
            } else state.cleanup = 'matching-card-unavailable';
          })(),
          2_000,
          'timeline-seed-cleanup-timeout',
        );
      } catch (cleanupError) {
        state.cleanup = cleanupError instanceof Error ? cleanupError.message : 'cleanup-failed';
      } finally {
        cleanupClosed = true;
      }
      try {
        await bounded(running, 500, 'timeline-seed-operation-unsettled');
      } catch {}
      if (!settled) state.operation = 'pending-host-cleanup-required';
    }
    publish();
    const failure = error instanceof Error ? error : new Error('timeline-seed-failed');
    failure.timelineSeed = { ...state };
    throw failure;
  } finally {
    closed = true;
  }
}

export async function seedTimeline({
  rpc,
  count,
  bodies,
  onMessage = () => undefined,
  onProgress = () => undefined,
  onToolState = () => undefined,
}) {
  const bots = [];
  for (const name of ['Perf Ada', 'Perf Lin', 'Perf Kai'])
    bots.push((await rpc('create', { displayName: name + ' ' + (Date.now() % 100000) })).bot);
  const group = (
    await rpc('channelCreate', { name: 'Idle perf ' + count, members: bots.map((bot) => bot.slug) })
  ).channel;
  for (const bot of bots)
    await rpc('channelGroupWakeSet', {
      channelId: group.id,
      botSlug: bot.slug,
      mode: 'silent',
      count: 5,
      intervalSeconds: 30,
    });
  const ids = [];
  let source;
  for (let index = 0; index < count; index++) {
    onMessage({
      ordinal: index + 1,
      count,
      method: index % 5 === 0 ? 'channelSend' : 'botToolRun',
    });
    if (index % 5 === 0) {
      const sent = await rpc('channelSend', {
        channelId: group.id,
        body: 'Human check-in ' + (index + 1) + ': how is it going?',
      });
      source = sent.message?.id ?? sent.messageId ?? sent.id;
      assert.ok(source, 'timeline-seed-human-message-missing');
      ids.push(source);
      continue;
    }
    const bot = bots[index % bots.length];
    const run = await runTimelineSeedTool({
      rpc,
      slug: bot.slug,
      onState: onToolState,
      args: {
        channel_id: group.id,
        body: bodies[index % bodies.length](index + 1),
        reply_to: source,
      },
    });
    assert.ok(run.result?.messageId, 'timeline-seed-bot-message-missing');
    ids.push(run.result.messageId);
    if ((index + 1) % 100 === 0) onProgress(index + 1, count);
  }
  await rpc('channelMarkRead', { channelId: group.id, messageId: ids.at(-1) });
  return { channelId: group.id, messageIds: ids, bots: bots.map((bot) => bot.slug) };
}
