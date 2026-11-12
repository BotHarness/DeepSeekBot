import { describe, expect, it } from 'vitest';
import type { SavedHost } from '../src/host/hosts';
import { answerInPlace, type AnswerPort } from '../src/host/push-answer';
import type { PushDecision } from '../src/host/push-actions';

const host = { hostId: 'studio', routes: ['http://studio.test'] } as unknown as SavedHost;
const data = {
  v: 1,
  hostId: 'studio',
  itemId: 'item-1',
  kind: 'tool-approval',
  botSlug: 'helper',
  channelId: 'dm-helper',
  messageId: 'm1',
};

function port(result: PushDecision | Error) {
  const calls = { decided: [] as string[], dismissed: [] as string[], retried: [] as unknown[] };
  const claimed = new Set<string>();
  const value: AnswerPort = {
    claim: (id) => !claimed.has(id) && Boolean(claimed.add(id)),
    hosts: async () => [host],
    decide: async (_host, _route, ref, outcome) => {
      calls.decided.push(`${ref.messageId}:${outcome}`);
      if (result instanceof Error) throw result;
      return result as never;
    },
    dismiss: async (id) => {
      calls.dismissed.push(id);
    },
    retry: async (title, retryData) => {
      calls.retried.push({ title, data: retryData });
    },
  };
  return { value, calls };
}

const response = (action: string) => ({ id: 'n1', action, title: 'Helper', data });

describe('answering an approval from the notification without opening the app', () => {
  it.each([
    ['approve', 'allowed-once'],
    ['always', 'allowed-always-tool'],
    ['reject', 'rejected'],
  ])('sends %s, dismisses the notification and posts nothing else', async (action, outcome) => {
    const { value, calls } = port('accepted');
    expect(await answerInPlace(response(action), value)).toBe('accepted');
    expect(calls.decided).toEqual([`m1:${outcome}`]);
    expect(calls.dismissed).toEqual(['n1']);
    expect(calls.retried).toEqual([]);
  });

  it('treats a request someone already decided as answered', async () => {
    const { value, calls } = port('decided');
    expect(await answerInPlace(response('approve'), value)).toBe('decided');
    expect(calls.retried).toEqual([]);
  });

  it('answers a response once even if both the task and the tap listener see it', async () => {
    const { value, calls } = port('accepted');
    await answerInPlace(response('approve'), value);
    expect(await answerInPlace(response('approve'), value)).toBeUndefined();
    expect(calls.decided).toHaveLength(1);
  });

  it('replaces a failed decision with a plain notification that opens the request', async () => {
    const { value, calls } = port(new Error('offline'));
    expect(await answerInPlace(response('approve'), value)).toBe('failed');
    expect(calls.dismissed).toEqual(['n1']);
    expect(calls.retried).toEqual([
      {
        title: 'Helper',
        data: {
          v: 1,
          hostId: 'studio',
          kind: 'tool-approval',
          botSlug: 'helper',
          channelId: 'dm-helper',
          messageId: 'm1',
        },
      },
    ]);
  });

  it('leaves plain taps and other actions to the app', async () => {
    const { value, calls } = port('accepted');
    expect(
      await answerInPlace({ ...response('expo.modules.notifications.actions.DEFAULT') }, value),
    ).toBeUndefined();
    expect(await answerInPlace(response('remove-device'), value)).toBeUndefined();
    expect(calls.decided).toEqual([]);
  });
});
