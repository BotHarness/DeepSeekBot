import assert from 'node:assert/strict';
import { test } from 'vitest';
import { checkApprovalCapacity } from '../e2e-approval-capacity-proof.mjs';

function fixture(mode = 'candidate') {
  const call = {
    type: 'tool/call',
    time: 1,
    data: { callId: 'original-call', name: 'pwsh', arguments: '{"command":"opaque"}', turn: 1 },
  };
  const asked = {
    type: 'approval/asked',
    time: 2,
    data: { callId: 'original-call', id: 'approval' },
  };
  const native = { sessionId: 'original', events: [call, asked] };
  const observations = Object.entries({
    'running-limit': { limit: 1 },
    'execution-after': { execution: mode === 'revoked' ? 'needs-repair' : 'settled' },
    client: { errors: [] },
    'original-request': {
      id: 'card',
      toolApprovalRequest: {
        role: 'assignment',
        sessionId: 'original',
        callId: 'original-call',
        toolName: 'pwsh',
        input: call.data.arguments,
      },
    },
    'original-before': native,
    'original-after': {
      sessionId: 'original',
      events: [
        call,
        asked,
        {
          type: 'approval/decided',
          time: 20,
          data: { id: 'approval', outcome: mode === 'revoked' ? 'unavailable' : 'allowed-once' },
        },
        {
          type: 'tool/result',
          time: 21,
          data: {
            callId: 'original-call',
            turn: 1,
            isError: mode === 'revoked',
            text: 'ORIGINAL_1037\n',
          },
        },
      ],
    },
    'unrelated-reply': { id: 'reply', at: new Date(5).toISOString() },
    'orchestrator-after': {
      sessionId: 'orchestrator',
      events: [
        {
          type: 'tool/call',
          time: 22,
          data: {
            name: 'bot_send_message',
            callId: 'final',
            turn: 3,
            step: 1,
            arguments: '{"body":"ORIGINAL_1037"}',
          },
        },
        {
          type: 'tool/result',
          time: 24,
          data: { callId: 'final', isError: false, text: '{"messageId":"final-reply"}' },
        },
        {
          type: 'assistant/message',
          time: 3,
          data: { turn: 2, step: 1, source: { kind: 'model', provider: 'live', model: 'model' } },
        },
        {
          type: 'tool/call',
          time: 4,
          data: {
            name: 'bot_send_message',
            callId: 'send',
            turn: 2,
            step: 1,
            arguments: '{"body":"UNRELATED_1037"}',
          },
        },
        {
          type: 'tool/result',
          time: 5,
          data: { callId: 'send', isError: false, text: '{"messageId":"reply"}' },
        },
      ],
    },
    'effect-before': false,
    'effect-after': mode !== 'revoked',
    'baseline-refusal': { body: 'CAPACITY_REFUSED' },
    'assignments-after': { assignments: mode === 'baseline' ? [{}] : [{}, {}] },
    'capacity-wait': {
      status: { execution: 'waiting-capacity', status: 'expired' },
      originalEffect: false,
      original: native,
      assignments: {
        assignments: [
          { activity: 'working', executionWait: 'waiting-capacity' },
          { activity: 'working' },
        ],
      },
    },
    'messages-after': [
      { id: 'final-reply', body: 'ORIGINAL_1037', at: new Date(24).toISOString() },
      { toolApprovalDecision: { requestMessageId: 'card', outcome: 'allowed-once' } },
    ],
    'competitor-request': {
      toolApprovalRequest: { sessionId: 'competitor', callId: 'competitor-call' },
    },
    'competitor-body-started': { marker: 'COMPETITOR_1037' },
    'competitor-after': {
      events: [
        { type: 'tool/result', time: 19, data: { callId: 'competitor-call', isError: false } },
      ],
    },
    'grant-revoked': { id: 'grant' },
  }).map(([kind, value]) => ({ kind, value }));
  return structuredClone({ mode, observations });
}

for (const mode of ['baseline', 'candidate', 'revoked']) {
  test(`accepts complete ${mode} evidence`, () =>
    assert.equal(checkApprovalCapacity(fixture(mode)).mode, mode));
}

for (const [name, mutate] of [
  [
    'replacement Session',
    (read) => {
      read('original-after').sessionId = 'replacement';
    },
  ],
  [
    'duplicate actual result',
    (read) => {
      read('original-after').events.push(read('original-after').events.at(-1));
    },
  ],
  [
    'effect before capacity',
    (read) => {
      read('capacity-wait').originalEffect = true;
    },
  ],
  [
    'missing model provenance',
    (read) => {
      read('orchestrator-after').events.find(
        (event) => event.type === 'assistant/message',
      ).data.source.kind = 'synthetic';
    },
  ],
  [
    'two concurrent holders',
    (read) => {
      delete read('capacity-wait').assignments.assignments[0].executionWait;
    },
  ],
  [
    'failed competing command',
    (read) => {
      read('competitor-after').events[0].data.isError = true;
    },
  ],
  [
    'original execution before peer settlement',
    (read) => {
      read('competitor-after').events[0].time = 25;
    },
  ],
]) {
  test(`refuses ${name}`, () => {
    const proof = fixture();
    mutate((kind) => proof.observations.find((o) => o.kind === kind).value);
    assert.throws(() => checkApprovalCapacity(proof));
  });
}
