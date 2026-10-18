import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { apply } from '../fixtures/group-recovery-fault.mjs';

it('loses exactly one actual committed result for the armed Group, retaining the commit evidence', async () => {
  const stateFile = join(mkdtempSync(join(tmpdir(), 'recovery-fault-')), 'state.json');
  let dispatch;
  apply(
    {
      on: (_event, listener) => {
        dispatch = listener;
      },
    },
    { stateFile },
  );
  const exec = {
    name: 'channel_send',
    callId: 'native-call',
    agent: { session: { id: 'native-session' } },
    arguments: { body: 'Notice' },
    signal: new AbortController().signal,
  };
  const committed = {
    isError: false,
    value: JSON.stringify({ channelId: 'owned-group', messageId: 'canonical-one' }),
    content: [
      {
        type: 'text',
        text: JSON.stringify({ channelId: 'owned-group', messageId: 'canonical-one' }),
      },
    ],
  };
  let calls = 0;
  const next = async () => {
    calls++;
    return committed;
  };
  expect(await dispatch(exec, next)).toBe(committed);
  writeFileSync(
    stateFile,
    JSON.stringify({
      phase: 'armed',
      channelId: 'other-group',
      match: 'committed',
      action: 'lose-response',
    }),
  );
  expect(await dispatch(exec, next)).toBe(committed);
  writeFileSync(
    stateFile,
    JSON.stringify({
      phase: 'armed',
      channelId: 'owned-group',
      match: 'committed',
      action: 'lose-response',
    }),
  );
  expect(await dispatch(exec, next)).toMatchObject({
    isError: true,
    error: { info: { code: 'EVAL_RESPONSE_LOST' } },
  });
  expect(JSON.parse(readFileSync(stateFile, 'utf8'))).toMatchObject({
    phase: 'fired',
    sessionId: 'native-session',
    actualResult: committed,
  });
  expect(await dispatch(exec, next)).toBe(committed);
  expect(calls).toBe(4);
});
