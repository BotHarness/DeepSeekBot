// Retained qualification logs keep their original tool names; this reader does not register tools.
import assert from 'node:assert/strict';

export function compactNative(snapshot) {
  assert.equal(snapshot.hasMore, false, 'evidence must cover the whole bounded Session');
  return {
    sessionId: snapshot.header.id,
    events: snapshot.records.flatMap(({ event }) => {
      if (!event) return [];
      const { type, seq, time, data } = event;
      const base = { type, seq, time };
      if (type === 'assistant/message')
        return [
          {
            ...base,
            data: {
              turn: data.turn,
              step: data.step,
              source: {
                kind: data.message.source.kind,
                provider: data.message.source.provider,
                model: data.message.source.model,
              },
              usage: data.usage,
            },
          },
        ];
      if (type === 'user/message') {
        if (data.source?.kind !== 'user') return [];
        return [
          {
            ...base,
            data: {
              text: data.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('\n'),
            },
          },
        ];
      }
      if (
        [
          'turn/start',
          'turn/end',
          'step/start',
          'step/end',
          'tool/call',
          'approval/asked',
          'approval/decided',
        ].includes(type)
      )
        return [{ ...base, data }];
      if (type === 'tool/result')
        return [
          {
            ...base,
            data: {
              turn: data.turn,
              step: data.step,
              callId: data.message.toolCallId,
              isError: data.message.isError,
              text: data.message.content
                .filter((b) => b.type === 'text')
                .map((b) => b.text)
                .join('\n'),
            },
          },
        ];
      return [];
    }),
  };
}

export function checkNativeWait({
  owner,
  before,
  during,
  after,
  orchestrator,
  request,
  messages,
  decision: webDecision,
  rejected = false,
}) {
  assert.equal(webDecision?.result?.ok, !rejected, 'Web decision acceptance/refusal');
  if (rejected) {
    assert.equal(webDecision.result.error.code, 'invalid-input');
    assert.equal(webDecision.result.error.message, 'Tool approval request is no longer pending');
  } else {
    assert.equal(webDecision.result.value.accepted, true, 'Web decision must be accepted');
  }
  const nativeRequest = request.toolApprovalRequest ?? request.userQuestionRequest;
  assert.equal(before.sessionId, nativeRequest.sessionId, 'original Session owner');
  assert.equal(after.sessionId, before.sessionId, 'continuation must retain original Session');
  assert.equal(during.sessionId, before.sessionId);
  const call = before.events.find(
    (e) =>
      e.type === 'tool/call' &&
      (request.toolApprovalRequest
        ? e.data.callId === nativeRequest.callId
        : e.data.name === 'ask_user_question' &&
          JSON.stringify(JSON.parse(e.data.arguments).questions) ===
            JSON.stringify(nativeRequest.questions)),
  );
  assert.ok(call, 'exact original native tool call');
  if (request.toolApprovalRequest) {
    assert.equal(call.data.name, nativeRequest.toolName);
    assert.deepEqual(
      JSON.parse(call.data.arguments),
      JSON.parse(nativeRequest.input),
      'exact approved arguments',
    );
    assert.equal(nativeRequest.role, owner);
  }
  assert.equal(
    during.events.some((e) => e.type === 'tool/result' && e.data.callId === call.data.callId),
    false,
    'original remains pending while observing',
  );
  const results = after.events.filter(
    (e) => e.type === 'tool/result' && e.data.callId === call.data.callId,
  );
  assert.equal(results.length, 1, 'original operation settles exactly once');
  const result = results[0];
  assert.equal(result.data.isError, rejected, 'acceptance alone cannot prove execution success');
  if (!rejected) {
    if (request.userQuestionRequest)
      assert.deepEqual(JSON.parse(result.data.text), {
        answers: [{ id: 'wait-route', selected: ['Canary'] }],
      });
    else assert.equal(result.data.text.trim(), 'EXACT_OPERATION_1036', 'exact native stdout');
  }
  const asked = before.events.find(
    (e) => e.type === 'approval/asked' && e.data.callId === call.data.callId,
  );
  const decision =
    asked && after.events.find((e) => e.type === 'approval/decided' && e.data.id === asked.data.id);
  if (request.toolApprovalRequest) {
    assert.ok(asked && decision, 'native asked/decided correlation');
    assert.equal(decision.data.outcome, rejected ? 'unavailable' : 'allowed-once');
    assert.ok(decision.time <= result.time);
  }
  const unrelated = orchestrator.events.find(
    (e) =>
      e.type === 'tool/call' &&
      ['bot_send_message', 'channel_send'].includes(e.data.name) &&
      JSON.parse(e.data.arguments).body === 'UNRELATED_REPLY_1036',
  );
  assert.ok(unrelated, 'actual model-originated unrelated bot_send_message');
  const model = orchestrator.events.find(
    (e) =>
      e.type === 'assistant/message' &&
      e.data.turn === unrelated.data.turn &&
      e.data.step === unrelated.data.step &&
      e.data.source.kind === 'model',
  );
  assert.ok(model?.data.source.provider && model.data.source.model, 'actual model route');
  const sent = orchestrator.events.find(
    (e) => e.type === 'tool/result' && e.data.callId === unrelated.data.callId,
  );
  assert.equal(sent?.data.isError, false, 'successful unrelated send');
  const receipt = JSON.parse(sent.data.text);
  const reply = messages.find(
    (m) => m.id === receipt.messageId && m.body === 'UNRELATED_REPLY_1036',
  );
  assert.ok(reply, 'native send receipt matches canonical Channel message');
  if (owner === 'assignment') {
    assert.notEqual(orchestrator.sessionId, before.sessionId);
    assert.ok(
      Date.parse(reply.at) < (decision?.time ?? result.time),
      'Assignment path must actually reply during pending approval',
    );
  } else {
    assert.equal(orchestrator.sessionId, before.sessionId);
    assert.ok(
      unrelated.time > result.time,
      'Orchestrator unrelated processing starts after wait resolution',
    );
    assert.equal(
      during.events.some(
        (e) => e.type === 'user/message' && e.data.text.startsWith('This is unrelated Inbox work.'),
      ),
      false,
      'native Agent has not claimed unrelated Inbox input while waiting',
    );
  }
  assert.equal(
    after.events.some((e) => e.type === 'turn/end' && e.data.reason?.kind === 'aborted'),
    false,
    'cancellation is not suspension',
  );
  return {
    owner,
    sessionId: before.sessionId,
    callId: call.data.callId,
    tool: call.data.name,
    callAt: call.time,
    ...(asked
      ? { approvalId: asked.data.id, decisionAt: decision.time, outcome: decision.data.outcome }
      : {}),
    resultAt: result.time,
    isError: result.data.isError,
    nativeResult: result.data.text,
    unrelated: {
      sessionId: orchestrator.sessionId,
      callId: unrelated.data.callId,
      callAt: unrelated.time,
      replyId: reply.id,
      replyAt: reply.at,
      model: model.data.source,
    },
    repliedWhileWaiting: owner === 'assignment',
    rejected,
  };
}
