import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'vitest';
import { compactNative, checkNativeWait } from '../experiment-native-wait-proof.mjs';

const load = (name) =>
  JSON.parse(
    readFileSync(
      new URL('../../docs/evidence/issue-1036/' + name + '.json', import.meta.url),
      'utf8',
    ),
  );
const input = (p) => ({
  owner: p.verdict.owner,
  before: p.before,
  during: p.during,
  after: p.after,
  orchestrator: p.orchestrator,
  request: p.request,
  messages: p.messages,
  decision: p.decision,
  rejected: p.verdict.rejected,
});

for (const name of [
  'assignment',
  'orchestrator-approval',
  'orchestrator-question',
  'assignment-revoked',
  'orchestrator-changed',
]) {
  test('revalidates retained real native evidence: ' + name, () => {
    const p = load(name);
    assert.deepEqual(checkNativeWait(input(p)), p.verdict);
  });
}
test('rejects a successful decision with a failed operation result', () => {
  const p = load('assignment');
  p.after.events.find(
    (e) => e.type === 'tool/result' && e.data.callId === p.verdict.callId,
  ).data.isError = true;
  assert.throws(() => checkNativeWait(input(p)), /acceptance alone/);
});

test('rejects a native result without accepted Web decision', () => {
  const p = load('assignment');
  p.decision.result.value.accepted = false;
  assert.throws(() => checkNativeWait(input(p)), /Web decision must be accepted/);
});

test('rejects marker text accompanied by a shell failure', () => {
  const p = load('assignment');
  p.after.events.find(
    (e) => e.type === 'tool/result' && e.data.callId === p.verdict.callId,
  ).data.text += '[exit code: 1]';
  assert.throws(() => checkNativeWait(input(p)), /exact native stdout/);
});
test('rejects replacement Session and changed exact arguments', () => {
  const p = load('assignment');
  p.after.sessionId = 'replacement-session';
  assert.throws(() => checkNativeWait(input(p)), /original Session/);
  p.after.sessionId = p.before.sessionId;
  p.request.toolApprovalRequest.input = '{"command":"echo DIFFERENT"}';
  assert.throws(() => checkNativeWait(input(p)), /exact approved arguments/);
});
test('rejects a reply uncorrelated with the native send receipt', () => {
  const p = load('assignment');
  p.messages.find((m) => m.id === p.verdict.unrelated.replyId).id = 'unrelated-message';
  assert.throws(() => checkNativeWait(input(p)), /canonical Channel message/);
});
test('rejects cancellation presented as continuation', () => {
  const p = load('orchestrator-question');
  p.after.events.push({ type: 'turn/end', data: { reason: { kind: 'aborted' } } });
  assert.throws(() => checkNativeWait(input(p)), /cancellation is not suspension/);
});
test('public native projection drops prompts, reasoning and incomplete snapshots', () => {
  const snapshot = {
    hasMore: false,
    header: { id: 'session' },
    records: [
      { event: { type: 'model/request', data: { privatePrompt: 'omit' } } },
      {
        event: {
          type: 'assistant/message',
          data: {
            message: {
              source: { kind: 'model', provider: 'p', model: 'm' },
              content: [{ type: 'reasoning', text: 'omit' }],
            },
            stream: ['omit'],
          },
        },
      },
      {
        event: {
          type: 'user/message',
          data: { source: { kind: 'runtime-context' }, content: [{ type: 'text', text: 'omit' }] },
        },
      },
    ],
  };
  assert.equal(JSON.stringify(compactNative(snapshot)).includes('omit'), false);
  snapshot.hasMore = true;
  assert.throws(() => compactNative(snapshot), /whole bounded Session/);
});

test('accepts the current sending name in a derived fixture without rewriting retained evidence', () => {
  const p = JSON.parse(
    JSON.stringify(load('assignment')).replaceAll('channel_send', 'bot_send_message'),
  );
  assert.deepEqual(checkNativeWait(input(p)), p.verdict);
});
