import { expect, it } from 'vitest';
import { hostSessionPendingInput } from '../src/host-sessions';

it('keeps the tool call preview on a native approval and drops an empty one', () => {
  expect(
    hostSessionPendingInput([
      {
        kind: 'approval',
        requestId: 'event-1',
        toolName: 'bash',
        callId: 'call-1',
        reason: 'escalate sandbox',
        preview: 'echo READY',
      },
      { kind: 'approval', requestId: 'event-2', toolName: 'bash', preview: '' },
      { kind: 'approval', requestId: 'event-3', toolName: 'bash', preview: 7 },
    ]),
  ).toEqual([
    {
      kind: 'approval',
      requestId: 'event-1',
      toolName: 'bash',
      callId: 'call-1',
      reason: 'escalate sandbox',
      preview: 'echo READY',
    },
    { kind: 'approval', requestId: 'event-2', toolName: 'bash' },
    { kind: 'approval', requestId: 'event-3', toolName: 'bash' },
  ]);
});
