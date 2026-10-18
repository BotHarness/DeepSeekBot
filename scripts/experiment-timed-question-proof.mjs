import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

const text = (content) =>
  content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
const source = (value) => ({
  kind: value.kind,
  provider: value.provider,
  model: value.model,
  callId: value.callId,
  outcome: value.outcome,
});
export function compactTimedQuestion(snapshot) {
  assert.equal(snapshot.hasMore, false, 'whole bounded native Session required');
  return {
    sessionId: snapshot.header.id,
    questions: snapshot.projections.values.userQuestions,
    events: snapshot.records.flatMap(({ event }) => {
      if (!event) return [];
      const { type, seq, time, data } = event;
      const base = { type, seq, time };
      if (type === 'assistant/message')
        return [
          {
            ...base,
            data: { turn: data.turn, step: data.step, source: source(data.message.source) },
          },
        ];
      if (type === 'user/message' && ['user', 'user-question-reply'].includes(data.source?.kind))
        return [
          { ...base, data: { id: data.id, source: source(data.source), text: text(data.content) } },
        ];
      if (type === 'tool/call')
        return [
          {
            ...base,
            data: {
              turn: data.turn,
              step: data.step,
              callId: data.callId,
              name: data.name,
              arguments: data.arguments,
            },
          },
        ];
      if (type === 'tool/result')
        return [
          {
            ...base,
            data: {
              turn: data.turn,
              step: data.step,
              callId: data.message.toolCallId,
              isError: data.message.isError,
              text: text(data.message.content),
            },
          },
        ];
      if (type === 'turn/end') return [{ ...base, data: { turn: data.turn, reason: data.reason } }];
      if (type === 'turn/start') return [{ ...base, data: { turn: data.turn } }];
      if (type === 'request/header')
        return [
          {
            ...base,
            data: {
              timedSchema: data.header.tools.find((tool) => tool.name === 'ask_user_question')
                ?.parameters.properties.timeout,
            },
          },
        ];
      if (type === 'agent/inbox/spliced')
        return [
          {
            ...base,
            data: {
              target: data.target,
              removedCount: data.removedCount,
              inserted: (data.inserted ?? [])
                .filter((row) => row.source?.kind === 'user-question-reply')
                .map((row) => ({
                  id: row.id,
                  source: source(row.source),
                  text: text(row.content),
                })),
            },
          },
        ];
      return [];
    }),
  };
}

export function checkTimedQuestion(proof) {
  const { pending, unanswered, after, request, decisions, messages } = proof;
  assert.equal(pending.sessionId, request.userQuestionRequest.sessionId, 'original Session owner');
  assert.equal(unanswered.sessionId, pending.sessionId, 'same unanswered Session');
  assert.equal(after.sessionId, pending.sessionId, 'same answered Session');
  const calls = after.events.filter(
    (event) => event.type === 'tool/call' && event.data.name === 'ask_user_question',
  );
  assert.equal(calls.length, 1, 'one original question, no reissue');
  const call = calls[0];
  const callId = call.data.callId;
  assert.deepEqual(
    pending.events.find((event) => event.type === 'tool/call' && event.data.callId === callId),
    call,
    'original call remains unchanged',
  );
  const args = JSON.parse(call.data.arguments);
  assert.equal(args.timeout, 2);
  assert.deepEqual(args.questions, request.userQuestionRequest.questions);
  const schema = pending.events
    .filter((event) => event.type === 'request/header' && event.seq < call.seq)
    .at(-1);
  assert.equal(schema?.data.timedSchema?.type, 'integer', 'actual native timed Tool schema');
  const results = after.events.filter(
    (event) => event.type === 'tool/result' && event.data.callId === callId,
  );
  assert.equal(results.length, 1, 'original native Tool result occurs once');
  const result = results[0];
  const native = JSON.parse(result.data.text);
  assert.equal(native.pending, true, 'genuine pending result');
  assert.equal(native.callId, callId, 'pending result identifies original question');
  assert.equal(result.data.isError, false);
  assert.deepEqual(
    pending.events.find((event) => event.type === 'tool/result' && event.data.callId === callId),
    result,
    'pending result is never rewritten',
  );
  for (const snapshot of [pending, unanswered]) {
    assert.equal(
      snapshot.questions.active.find((row) => row.callId === callId)?.state,
      'continued',
      'native question remains answerable',
    );
    assert.equal(
      snapshot.events.some(
        (event) =>
          event.type === 'user/message' && event.data.source.kind === 'user-question-reply',
      ),
      false,
      'no answer admitted before unrelated reply',
    );
    assert.equal(
      snapshot.events.some(
        (event) =>
          event.type === 'agent/inbox/spliced' &&
          event.data.inserted.some((row) => row.source.callId === callId),
      ),
      false,
      'no qualified answer queued before unrelated reply',
    );
  }
  const modelSend = (body) => {
    const send = after.events.find(
      (event) =>
        event.type === 'tool/call' &&
        event.data.name === 'channel_send' &&
        JSON.parse(event.data.arguments).body === body,
    );
    assert.ok(send, 'actual native channel_send: ' + body);
    const model = after.events.find(
      (event) =>
        event.type === 'assistant/message' &&
        event.data.turn === send.data.turn &&
        event.data.step === send.data.step,
    );
    assert.equal(model?.data.source.kind, 'model', 'real model-originated call');
    assert.ok(model.data.source.provider && model.data.source.model, 'real model route');
    const outcome = after.events.find(
      (event) => event.type === 'tool/result' && event.data.callId === send.data.callId,
    );
    assert.equal(outcome?.data.isError, false, 'native send succeeded');
    const receipt = JSON.parse(outcome.data.text);
    const message = messages.find(
      (row) => row.id === receipt.messageId && row.body === body && row.author.kind === 'bot',
    );
    assert.ok(message, 'canonical Channel receipt matches native send');
    return {
      callId: send.data.callId,
      callAt: send.time,
      replyId: message.id,
      replyAt: message.at,
      model: model.data.source,
    };
  };
  const baseline = modelSend('BASELINE_1220');
  const pendingReply = modelSend('PENDING_1220');
  const unrelated = modelSend('UNRELATED_REPLY_1220');
  assert.ok(
    unanswered.events.some(
      (event) => event.type === 'tool/call' && event.data.callId === unrelated.callId,
    ),
    'unrelated native processing already occurred before decision',
  );
  assert.ok(
    unanswered.events.some(
      (event) =>
        event.type === 'user/message' &&
        event.data.source.kind === 'user' &&
        event.data.text.startsWith('This is unrelated ordinary Inbox work.'),
    ),
    'ordinary input was admitted, not just queued',
  );
  assert.ok(
    result.time < unrelated.callAt &&
      Date.parse(unrelated.replyAt) < Date.parse(decisions.accepted.at),
    'real unrelated reply precedes answer submission',
  );
  assert.equal(decisions.wrong, false, 'wrong call rejected');
  assert.equal(decisions.accepted.value, true, 'qualified native answer accepted');
  assert.equal(decisions.duplicate, false, 'duplicate settled answer rejected');
  const replies = after.events.filter(
    (event) => event.type === 'user/message' && event.data.source.kind === 'user-question-reply',
  );
  assert.equal(replies.length, 1, 'one admitted qualified answer');
  const reply = replies[0];
  assert.equal(reply.data.source.callId, callId, 'qualified source retains original call');
  assert.equal(reply.data.source.outcome, 'answered');
  const answer = JSON.parse(reply.data.text);
  assert.equal(answer.kind, 'answer_to_pending_question');
  assert.equal(answer.tool, 'ask_user_question');
  assert.equal(answer.callId, callId);
  assert.deepEqual(answer.questions, args.questions, 'original questions retained');
  assert.deepEqual(answer.answers, [{ id: 'wait-route', selected: ['Canary'] }]);
  const queued = after.events.find(
    (event) =>
      event.type === 'agent/inbox/spliced' &&
      event.data.inserted.some((row) => row.id === reply.data.id && row.source.callId === callId),
  );
  assert.ok(queued && queued.seq < reply.seq, 'qualified reply queued then admitted');
  assert.ok(
    Date.parse(unrelated.replyAt) < queued.time,
    'answer submitted after the unrelated reply',
  );
  assert.equal(
    after.questions.active.some((row) => row.callId === callId),
    false,
  );
  assert.deepEqual(
    after.questions.settled.find((row) => row.callId === callId)?.answers,
    answer.answers,
    'native Projection settles the original answer',
  );
  const answerMessage = messages.find((row) => /^ANSWER_1220\s*:?\s*Canary$/u.test(row.body));
  assert.ok(answerMessage, 'real reply contains the actual selected answer');
  const processed = modelSend(answerMessage.body);
  assert.ok(processed.callAt >= reply.time, 'real model processed qualified late answer');
  assert.equal(
    after.events.some(
      (event) => event.type === 'turn/end' && event.data.reason?.kind === 'aborted',
    ),
    false,
    'no Agent cancellation/restart substitute',
  );
  assert.equal(
    after.events.some(
      (event) =>
        event.type === 'tool/call' &&
        !['channel_send', 'ask_user_question'].includes(event.data.name),
    ),
    false,
    'only the declared synthetic tools executed',
  );
  const cancelled = messages.some(
    (row) =>
      row.userQuestionResolution?.requestMessageId === request.id &&
      row.userQuestionResolution.state === 'cancelled',
  );
  if (proof.integration === 'card') {
    assert.equal(
      unanswered.events.filter((event) => ['turn/start', 'turn/end'].includes(event.type)).at(-1)
        ?.type,
      'turn/end',
      'ordinary turn fully ended before card answer',
    );
    assert.equal(cancelled, false, 'deadline does not cancel the application card');
    assert.equal(request.userQuestionRequest.callId, callId);
    assert.equal(proof.card.before.status, 'pending');
    assert.equal(proof.card.after.status, 'answered');
    assert.deepEqual(proof.card.submit, { via: 'visible-question-card', accepted: true });
    assert.ok(
      proof.client.every((row) => row.consoleErrorCount === 0),
      'actual browser has no console errors',
    );
    const resolution = messages.find(
      (row) =>
        row.userQuestionResolution?.requestMessageId === request.id &&
        row.userQuestionResolution.state === 'answered',
    );
    assert.deepEqual(resolution?.userQuestionResolution.answers, answer.answers);
    assert.ok(Date.parse(resolution.at) >= reply.time, 'card settles after native admission');
  } else assert.ok(cancelled, 'retained negative application-card boundary');
  return {
    sessionId: after.sessionId,
    callId,
    toolResult: 'pending',
    nativeQuestionAfterTimeout: 'continued',
    nativeQuestionAfterAnswer: 'settled',
    baseline,
    pendingReply,
    unrelated,
    processed,
    applicationCardAfterTimeout: proof.integration === 'card' ? 'pending' : 'cancelled',
    ...(proof.integration === 'card' ? { applicationCardQualified: true } : {}),
    productionQualified: false,
  };
}

export function exportTimedQuestionEvidence(proof) {
  assert.match(
    proof.applicationBaseline,
    /^[a-f0-9]{40}$/u,
    'explicit application baseline required',
  );
  const observation = (kind) => proof.observations.find((row) => row.kind === kind);
  const read = (kind) => observation(kind)?.value;
  const result = {
    integration: proof.integration ?? 'native',
    ...(proof.integration === 'card'
      ? {
          card: {
            before: read('card-status-before'),
            after: read('card-status-after'),
            submit: read('card-submit'),
          },
        }
      : {}),
    issue: 1220,
    dsh: '0.2.1-rc.2',
    upstream: '687f282e8625c6b8d11ff58211a90524be2e4317',
    applicationBaseline: proof.applicationBaseline,
    startedAt: proof.startedAt,
    request: read('channel-question'),
    pending: compactTimedQuestion(read('native-pending')),
    unanswered: compactTimedQuestion(read('native-unanswered')),
    after: compactTimedQuestion(read('native-after')),
    decisions: {
      wrong: read('wrong-call-answer'),
      accepted: observation('native-late-answer'),
      duplicate: read('duplicate-answer'),
    },
    messages: read('messages-after').filter(
      (row) => row.author.kind === 'bot' || row.userQuestionResolution,
    ),
    client: proof.observations
      .filter((row) => ['client', 'client-final'].includes(row.kind))
      .map((row) => ({ at: row.at, consoleErrorCount: row.value.consoleErrors.length })),
  };
  result.decisions.accepted = {
    at: result.decisions.accepted.at,
    value: result.decisions.accepted.value,
  };
  result.verdict = checkTimedQuestion(result);
  return result;
}

if (process.argv[1]?.endsWith('experiment-timed-question-proof.mjs')) {
  const proof = JSON.parse(readFileSync(process.argv[2], 'utf8'));
  const result = exportTimedQuestionEvidence(proof);
  writeFileSync(process.argv[3], JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result.verdict));
}
