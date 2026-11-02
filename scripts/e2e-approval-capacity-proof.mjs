import assert from 'node:assert/strict';

export function checkApprovalCapacity(proof) {
  const read = (kind) => {
    const value = proof.observations.find((o) => o.kind === kind)?.value;
    assert.notEqual(value, undefined, 'missing evidence: ' + kind);
    return value;
  };
  assert.equal(read('running-limit').limit, 1);
  assert.deepEqual(read('client').errors, []);
  const request = read('original-request');
  const original = request.toolApprovalRequest;
  assert.equal(original.role, 'assignment');
  const before = read('original-before');
  const after = read('original-after');
  assert.equal(before.sessionId, original.sessionId);
  assert.equal(after.sessionId, original.sessionId);
  const calls = after.events.filter(
    (e) => e.type === 'tool/call' && e.data.callId === original.callId,
  );
  assert.equal(calls.length, 1, 'one exact original call');
  const call = calls[0];
  assert.equal(call.data.name, original.toolName);
  assert.deepEqual(JSON.parse(call.data.arguments), JSON.parse(original.input));
  const asked = before.events.find(
    (e) => e.type === 'approval/asked' && e.data.callId === original.callId,
  );
  assert.ok(asked, 'native asked before unrelated conversation');
  const decisions = after.events.filter(
    (e) => e.type === 'approval/decided' && e.data.id === asked.data.id,
  );
  assert.equal(decisions.length, 1, 'one exact native decision');
  const decision = decisions[0];
  const results = after.events.filter(
    (e) => e.type === 'tool/result' && e.data.callId === original.callId,
  );
  assert.equal(results.length, 1, 'one actual original native result');
  const result = results[0];
  assert.equal(result.data.turn, call.data.turn, 'same original Turn');
  assert.equal(decision.data.outcome, proof.mode === 'revoked' ? 'unavailable' : 'allowed-once');
  assert.equal(result.data.isError, proof.mode === 'revoked');
  assert.ok(result.time >= decision.time);
  const reply = read('unrelated-reply');
  const orchestrator = read('orchestrator-after');
  assert.notEqual(orchestrator.sessionId, original.sessionId);
  const send = orchestrator.events.find(
    (e) =>
      e.type === 'tool/call' &&
      e.data.name === 'bot_send_message' &&
      JSON.parse(e.data.arguments).body === 'UNRELATED_1037',
  );
  assert.ok(send, 'unrelated reply came from a native Channel tool');
  const model = orchestrator.events.find(
    (e) =>
      e.type === 'assistant/message' &&
      e.data.turn === send.data.turn &&
      e.data.step === send.data.step &&
      e.data.source.kind === 'model',
  );
  assert.ok(model?.data.source.provider && model.data.source.model, 'live model provenance');
  const sent = orchestrator.events.find(
    (e) => e.type === 'tool/result' && e.data.callId === send.data.callId,
  );
  assert.equal(sent?.data.isError, false);
  assert.equal(JSON.parse(sent.data.text).messageId, reply.id, 'canonical Channel receipt');
  assert.ok(
    Date.parse(reply.at) < decision.time,
    'actual reply while original native approval was unresolved',
  );
  assert.equal(read('effect-before'), false);
  const summary = {
    mode: proof.mode,
    limit: 1,
    original: {
      sessionId: original.sessionId,
      callId: original.callId,
      approvalId: asked.data.id,
      turn: call.data.turn,
      decision: decision.data.outcome,
      decisionAt: decision.time,
      resultAt: result.time,
      isError: result.data.isError,
    },
    unrelated: {
      sessionId: orchestrator.sessionId,
      callId: send.data.callId,
      messageId: reply.id,
      at: reply.at,
      model: model.data.source,
    },
    browserErrors: 0,
  };
  if (proof.mode !== 'revoked') {
    assert.equal(result.data.text.trim(), 'ORIGINAL_1037', 'actual native stdout');
    const finalSend = orchestrator.events.find(
      (e) =>
        e.type === 'tool/call' &&
        e.data.name === 'bot_send_message' &&
        JSON.parse(e.data.arguments).body.includes('ORIGINAL_1037'),
    );
    assert.ok(finalSend, 'original result is relayed through the native Channel tool');
    const finalReceipt = orchestrator.events.find(
      (e) => e.type === 'tool/result' && e.data.callId === finalSend.data.callId,
    );
    assert.equal(finalReceipt?.data.isError, false);
    const finalMessage = read('messages-after').find(
      (m) => m.id === JSON.parse(finalReceipt.data.text).messageId,
    );
    assert.ok(finalMessage?.body.includes('ORIGINAL_1037'), 'original result Channel receipt');
    assert.ok(Date.parse(finalMessage.at) >= result.time);
    summary.original.replyId = finalMessage.id;
  }
  if (proof.mode === 'baseline') {
    read('baseline-refusal');
    assert.equal(read('assignments-after').assignments.length, 1);
  } else {
    const waiting = read('capacity-wait');
    assert.equal(waiting.status.execution, 'waiting-capacity');
    assert.equal(
      waiting.status.status,
      'expired',
      'Human decision is committed without another approval',
    );
    assert.equal(waiting.originalEffect, false);
    assert.equal(
      waiting.assignments.assignments.filter(
        (a) => a.activity === 'working' && a.executionWait === undefined,
      ).length,
      1,
    );
    assert.equal(
      waiting.original.events.some(
        (e) => e.type === 'tool/result' && e.data.callId === original.callId,
      ),
      false,
    );
    assert.equal(
      waiting.original.events.some(
        (e) => e.type === 'approval/decided' && e.data.id === asked.data.id,
      ),
      false,
      'native outcome still waits for capacity',
    );
    const accepted = read('messages-after').find(
      (m) => m.toolApprovalDecision?.requestMessageId === request.id,
    );
    assert.equal(accepted?.toolApprovalDecision.outcome, 'allowed-once');
    const competitor = read('competitor-request').toolApprovalRequest;
    assert.notEqual(competitor.sessionId, original.sessionId);
    assert.equal(read('competitor-body-started').marker, 'COMPETITOR_1037');
    const native = read('competitor-after');
    const done = native.events.find(
      (e) => e.type === 'tool/result' && e.data.callId === competitor.callId,
    );
    assert.equal(done?.data.isError, false, 'competitor actually executed');
    if (proof.mode !== 'revoked')
      assert.ok(done.time <= result.time, 'original executes after the competing body settles');
    if (proof.mode === 'revoked') {
      read('grant-revoked');
      assert.equal(read('execution-after').execution, 'needs-repair');
      summary.needsRepair = true;
    }
    summary.competitor = {
      sessionId: competitor.sessionId,
      callId: competitor.callId,
      resultAt: done.time,
    };
    summary.waitingCapacity = true;
  }
  assert.equal(read('effect-after'), proof.mode !== 'revoked');
  return summary;
}
