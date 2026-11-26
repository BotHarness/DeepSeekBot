import { expect, it } from 'vitest';
import { withPreview } from '../src/features/sessions/dsh-host-session-input.js';
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

it('adds the pending tool call preview to a native approval', () => {
  const card = {
    kind: 'approval' as const,
    requestId: 'event-1',
    toolName: 'bash',
    callId: 'call-1',
    reason: 'escalate sandbox to danger-full-access: /home/qa/site',
  };
  const lookup = (sessionId: string, callId: string) =>
    sessionId === 'native-1' && callId === 'call-1'
      ? { arguments: { command: 'echo READY', description: 'say ready' } }
      : undefined;
  expect(withPreview('native-1', card, lookup)).toEqual({ ...card, preview: 'echo READY' });
  expect(withPreview('native-2', card, lookup)).toEqual(card);
  const { callId: _callId, ...uncalled } = card;
  expect(withPreview('native-1', uncalled, lookup)).toEqual(uncalled);
  const long = withPreview('native-1', card, () => ({
    arguments: JSON.stringify({ command: 'x'.repeat(3000) }),
  }));
  expect(long.kind === 'approval' && long.preview?.length).toBe(2000);
});
