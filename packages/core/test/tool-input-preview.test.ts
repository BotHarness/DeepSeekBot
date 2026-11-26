import { expect, it } from 'vitest';
import { withPreview } from '../src/features/sessions/dsh-host-session-input.js';
import { sessionToolInputPreview } from '../src/runtime/session-tool-detail.js';
import { toolInputPreview } from '../src/runtime/tool-input-preview.js';

it('picks the main argument of a tool call', () => {
  expect(toolInputPreview(JSON.stringify({ description: 'x', command: 'date > now' }))).toBe(
    'date > now',
  );
  expect(toolInputPreview(JSON.stringify({ file_path: 'notes/plan.md', content: 'x' }))).toBe(
    'notes/plan.md',
  );
  expect(toolInputPreview(JSON.stringify({ query: 'weather' }))).toBe('weather');
  expect(toolInputPreview('plain text')).toBe('plain text');
});

const call = (callId: string, name: string, args: unknown) => ({
  type: 'tool/call',
  time: 0,
  data: { callId, name, arguments: args },
});

it('adds the pending tool call preview to a native approval', () => {
  const card = {
    kind: 'approval' as const,
    requestId: 'event-1',
    toolName: 'bash',
    callId: 'call-1',
    reason: 'escalate sandbox to danger-full-access: /home/qa/site',
  };
  const events = [
    call('call-0', 'bash', { command: 'echo OLD' }),
    call('call-1', 'bash', { command: 'echo READY', description: 'say ready' }),
  ];
  const preview = (sessionId: string, callId: string) =>
    sessionId === 'native-1' ? sessionToolInputPreview(events, callId) : undefined;
  expect(withPreview('native-1', card, preview)).toEqual({ ...card, preview: 'echo READY' });
  expect(withPreview('native-2', card, preview)).toEqual(card);
  const { callId: _callId, ...uncalled } = card;
  expect(withPreview('native-1', uncalled, preview)).toEqual(uncalled);
  const long = sessionToolInputPreview(
    [call('call-1', 'bash', JSON.stringify({ command: 'x'.repeat(3000) }))],
    'call-1',
  );
  expect(long?.length).toBe(2000);
});

it('never previews the input of a private-input tool', () => {
  const secret = 'sk-live-DO-NOT-SHOW';
  const events = [
    call('call-1', 'secret_cli', { command: `curl -H "Authorization: ${secret}"` }),
    call('call-2', 'ask_secret', JSON.stringify({ value: secret })),
  ];
  for (const callId of ['call-1', 'call-2'])
    expect(sessionToolInputPreview(events, callId)).toBeUndefined();
  for (const [toolName, callId] of [
    ['secret_cli', 'call-1'],
    ['ask_secret', 'call-2'],
  ] as const) {
    const card = {
      kind: 'approval' as const,
      requestId: 'e',
      toolName,
      callId,
      reason: 'Needs a key',
    };
    const shown = withPreview('native-1', card, () => secret);
    expect(shown).toEqual(card);
    expect(
      JSON.stringify(withPreview('native-1', card, (_, id) => sessionToolInputPreview(events, id))),
    ).not.toContain(secret);
  }
});
