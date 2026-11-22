import { expect, it, vi } from 'vitest';
import {
  sendOrchestratorMessage,
  sendSessionRequest,
  sessionTranscript,
} from '@botharness/host-client/session-detail';

it('reads user inputs, replies, tools and model switches from the exact Session', async () => {
  const at = '2026-11-22T00:00:00Z';
  const from = { kind: 'dsh', provider: 'opencode-go', model: 'deepseek-v4.1-flash' };
  const to = { ...from, reasoningEffort: 'high' };
  const call = vi.fn(async () => ({
    role: 'orchestrator',
    running: true,
    seq: 4,
    items: [
      { kind: 'input', source: 'user', at, turn: 1, text: 'Review the release' },
      { kind: 'tool', id: 'tool-1', tool: 'read', toolKind: 'read', status: 'done', at },
      { kind: 'reply', text: 'The review is ready.', at },
      { kind: 'model-switch', at, from, to },
    ],
  }));
  const transcript = await sessionTranscript({ call }, 'ada', 'chosen');
  expect(transcript.items.map((item) => item.kind)).toEqual([
    'input',
    'tool',
    'reply',
    'model-switch',
  ]);
  expect(transcript.items[3]).toMatchObject({ from, to });
  expect(call).toHaveBeenCalledExactlyOnceWith('sessionTranscript', {
    slug: 'ada',
    sessionId: 'chosen',
  });
});

it('uses the selected Orchestrator and sends Assignment follow-ups at the correct boundary', async () => {
  const call = vi.fn();
  await sendOrchestratorMessage({ call }, 'ada', 'root', 'Review the release');
  await sendSessionRequest({ call }, 'ada', 'task', 'Continue', false);
  await sendSessionRequest({ call }, 'ada', 'task', 'Check the other build', true);
  expect(call.mock.calls).toEqual([
    ['sessionMessageSend', { botSlug: 'ada', sessionId: 'root', text: 'Review the release' }],
    [
      'botToolRun',
      {
        slug: 'ada',
        tool: 'unarchive_assignment',
        args: { session_id: 'task', message: 'Continue', mode: 'next-turn' },
      },
    ],
    [
      'botToolRun',
      {
        slug: 'ada',
        tool: 'unarchive_assignment',
        args: { session_id: 'task', message: 'Check the other build', mode: 'next-step' },
      },
    ],
  ]);
  call.mockResolvedValueOnce({
    result: '{"code":"unavailable","message":"Assignment unavailable"}',
  });
  await expect(sendSessionRequest({ call }, 'ada', 'task', 'Continue', false)).rejects.toThrow(
    'Assignment unavailable',
  );
});
