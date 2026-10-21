import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient } from '../../../apps/mobile/src/host/client.js';
import type { ClientRequest } from '../../../apps/mobile/src/host/wire.js';
import { createMessageResource } from '../src/client/message-resource.js';
import { remoteMessageActions } from '../src/client/remote-message-actions.js';

function fixture() {
  const calls: { url: string; request: ClientRequest }[] = [];
  let current = true;
  const client = createHostClient({
    routes: ['https://source.example.ts.net'],
    credential: 'test-device.test-secret',
    carrier: {
      async request(url, init) {
        const request = JSON.parse(String(init.body)) as ClientRequest;
        calls.push({ url, request });
        return {
          status: 200,
          text: async () =>
            JSON.stringify({
              type: 'server-response',
              rpcId: request.rpcId,
              result: { ok: true, value: { accepted: true, status: 'pending' } },
            }),
        };
      },
      openSocket() {
        throw new Error('No socket expected');
      },
    },
  });
  return {
    host: { client, current: () => current },
    calls,
    leave: () => {
      current = false;
    },
  };
}

afterEach(() => vi.restoreAllMocks());

it('loads attachments only from their source Host with device authorization and releases the URL', async () => {
  const { host } = fixture();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('image', { headers: { 'content-type': 'image/png' } }));
  const make = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:remote-image');
  const release = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  const resource = createMessageResource(
    '/api/botharness/attachment?channelId=same&messageId=same&fileId=file',
    host,
  );
  const stop = resource.subscribe(() => {});
  await vi.waitFor(() => expect(resource.getSnapshot().url).toBe('blob:remote-image'));
  expect(fetcher).toHaveBeenCalledWith(
    'https://source.example.ts.net/botharness-device/api/botharness/attachment?channelId=same&messageId=same&fileId=file',
    expect.objectContaining({
      headers: { authorization: 'Device test-device.test-secret' },
      credentials: 'omit',
      redirect: 'error',
    }),
  );
  expect(make).toHaveBeenCalledOnce();
  stop();
  expect(release).toHaveBeenCalledWith('blob:remote-image');
});

it('refuses unavailable attachments without a local fallback and ignores completions after release', async () => {
  const { host } = fixture();
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response('', { status: 403 }));
  const make = vi.spyOn(URL, 'createObjectURL');
  const resource = createMessageResource('/api/botharness/attachment?channelId=same', host);
  const stop = resource.subscribe(() => {});
  await vi.waitFor(() => expect(resource.getSnapshot().failed).toBe(true));
  expect(fetcher).toHaveBeenCalledOnce();
  stop();
  let finish: ((response: Response) => void) | undefined;
  fetcher.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const late = createMessageResource('/api/botharness/attachment?channelId=late', host);
  const release = late.subscribe(() => {});
  release();
  finish?.(new Response('late'));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(late.getSnapshot()).toEqual({});
  expect(make).not.toHaveBeenCalled();
});

it('routes approval and question decisions to their source Host and refuses stale conversation actions', async () => {
  const { host, calls, leave } = fixture();
  const actions = remoteMessageActions(host, 'same-bot');
  await actions.decideToolApproval('same-channel', 'same-message', 'allowed-once');
  await actions.answerUserQuestion('same-channel', 'question', [
    { id: 'q', selected: ['yes'], custom: '' },
  ]);
  expect(calls.map((call) => call.url)).toEqual([
    'https://source.example.ts.net/botharness-device/api/botharness/toolApprovalDecide',
    'https://source.example.ts.net/botharness-device/api/botharness/userQuestionAnswer',
  ]);
  expect(calls[0]?.request.payload.args).toEqual({
    channelId: 'same-channel',
    messageId: 'same-message',
    outcome: 'allowed-once',
  });
  leave();
  await expect(
    actions.decideToolApproval('same-channel', 'same-message', 'rejected'),
  ).rejects.toThrow('conversation changed');
  expect(calls).toHaveLength(2);
});
