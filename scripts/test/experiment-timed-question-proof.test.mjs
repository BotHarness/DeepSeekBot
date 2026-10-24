import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { checkTimedQuestion, compactTimedQuestion } from '../experiment-timed-question-proof.mjs';

const load = () =>
  JSON.parse(
    readFileSync(
      new URL('../../docs/evidence/issue-1220/timed-question.json', import.meta.url),
      'utf8',
    ),
  );
test('revalidates the retained real native timed-question evidence', () => {
  const proof = load();
  assert.deepEqual(checkTimedQuestion(proof), proof.verdict);
});

const loadCard = () =>
  JSON.parse(
    readFileSync(
      new URL('../../docs/evidence/issue-1220/timed-question-card.json', import.meta.url),
      'utf8',
    ),
  );
test('revalidates the real browser card answer after the ordinary turn ended', () => {
  const proof = loadCard();
  assert.deepEqual(checkTimedQuestion(proof), proof.verdict);
});
test('rejects card success before ordinary idle or before native admission', () => {
  const busy = loadCard();
  busy.unanswered.events.push({ type: 'turn/start', seq: 999, time: 999, data: { turn: 999 } });
  assert.throws(() => checkTimedQuestion(busy), /ordinary turn fully ended/u);
  const early = loadCard();
  early.messages.find((row) => row.userQuestionResolution?.state === 'answered').at =
    early.verdict.baseline.replyAt;
  assert.throws(() => checkTimedQuestion(early), /settles after native admission/u);
});
test('rejects a cancelled card and a missing application submission', () => {
  const cancelled = loadCard();
  cancelled.messages.find(
    (row) => row.userQuestionResolution?.state === 'answered',
  ).userQuestionResolution.state = 'cancelled';
  assert.throws(() => checkTimedQuestion(cancelled), /deadline does not cancel/u);
  const bypassed = loadCard();
  bypassed.card.submit.via = 'native-api';
  assert.throws(() => checkTimedQuestion(bypassed));
});
test('rejects replacement Session and question reissue', () => {
  const proof = load();
  proof.after.sessionId = 'replacement';
  assert.throws(() => checkTimedQuestion(proof), /same answered Session/u);
  proof.after.sessionId = proof.pending.sessionId;
  proof.after.events.push(
    proof.after.events.find(
      (event) => event.type === 'tool/call' && event.data.name === 'ask_user_question',
    ),
  );
  assert.throws(() => checkTimedQuestion(proof), /no reissue/u);
});
test('rejects a rewritten native pending result', () => {
  const proof = load();
  proof.after.events.find(
    (event) => event.type === 'tool/result' && event.data.callId === proof.verdict.callId,
  ).data.text = JSON.stringify({ pending: true, callId: 'another-call' });
  assert.throws(() => checkTimedQuestion(proof), /original question/u);
});
test('rejects ordinary text impersonating a qualified answer', () => {
  const proof = load();
  proof.after.events.find(
    (event) => event.type === 'user/message' && event.data.source.kind === 'user-question-reply',
  ).data.source.kind = 'user';
  assert.throws(() => checkTimedQuestion(proof), /one admitted qualified answer/u);
});
test('rejects an answer queued before the unrelated reply despite a later HTTP response', () => {
  const proof = load();
  const queued = proof.after.events.find(
    (event) =>
      event.type === 'agent/inbox/spliced' &&
      event.data.inserted.some((row) => row.source.callId === proof.verdict.callId),
  );
  queued.time = Date.parse(proof.verdict.baseline.replyAt);
  assert.throws(() => checkTimedQuestion(proof), /answer submitted after/u);
});
test('rejects queued-only answers and prematurely settled questions', () => {
  const proof = load();
  proof.unanswered.questions.active = [];
  assert.throws(() => checkTimedQuestion(proof), /remains answerable/u);
  const queuedOnly = load();
  queuedOnly.after.events = queuedOnly.after.events.filter(
    (event) => event.type !== 'user/message' || event.data.source.kind !== 'user-question-reply',
  );
  assert.throws(() => checkTimedQuestion(queuedOnly), /one admitted qualified answer/u);
});
test('rejects a reply after the answer or without actual model provenance', () => {
  const proof = load();
  proof.decisions.accepted.at = proof.verdict.baseline.replyAt;
  assert.throws(() => checkTimedQuestion(proof), /precedes answer/u);
  const fake = load();
  const call = fake.after.events.find(
    (event) => event.type === 'tool/call' && event.data.callId === fake.verdict.unrelated.callId,
  );
  fake.after.events.find(
    (event) =>
      event.type === 'assistant/message' &&
      event.data.turn === call.data.turn &&
      event.data.step === call.data.step,
  ).data.source.kind = 'synthetic';
  assert.throws(() => checkTimedQuestion(fake), /real model-originated/u);
});
test('rejects a mismatched Channel receipt and a failed send', () => {
  const proof = load();
  proof.messages.find((row) => row.id === proof.verdict.unrelated.replyId).id = 'different';
  assert.throws(() => checkTimedQuestion(proof), /canonical Channel receipt/u);
  const failed = load();
  failed.after.events.find(
    (event) =>
      event.type === 'tool/result' && event.data.callId === failed.verdict.processed.callId,
  ).data.isError = true;
  assert.throws(() => checkTimedQuestion(failed), /native send succeeded/u);
});
test('compact evidence drops private model data and refuses truncated snapshots', () => {
  const snapshot = {
    hasMore: false,
    header: { id: 'session' },
    projections: { values: { userQuestions: { active: [], settled: [] } } },
    records: [
      { event: { type: 'system/message', data: { text: 'PRIVATE' } } },
      { event: { type: 'request/context', data: { systemPromptUpdate: 'PRIVATE' } } },
      {
        event: {
          type: 'assistant/message',
          data: {
            message: {
              source: { kind: 'model', provider: 'provider', model: 'model' },
              content: [{ type: 'reasoning', text: 'PRIVATE' }],
            },
            stream: 'PRIVATE',
          },
        },
      },
    ],
  };
  assert.equal(JSON.stringify(compactTimedQuestion(snapshot)).includes('PRIVATE'), false);
  snapshot.hasMore = true;
  assert.throws(() => compactTimedQuestion(snapshot), /whole bounded/u);
});

test('accepts the current sending name in a derived fixture without rewriting retained evidence', () => {
  const proof = JSON.parse(JSON.stringify(load()).replaceAll('channel_send', 'bot_send_message'));
  assert.deepEqual(checkTimedQuestion(proof), proof.verdict);
});
