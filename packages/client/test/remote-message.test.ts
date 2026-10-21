import { afterEach, expect, it, vi } from 'vitest';
import { createHostClient, MethodRefused } from '../../../apps/mobile/src/host/client.js';
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

it.each(
  (['listing', 'create', 'options', 'grant'] as const).flatMap((phase) =>
    (['transport', 'refusal'] as const).map((failure) => ({ phase, failure })),
  ),
)(
  'preserves the original folder $phase/$failure diagnostic as cause',
  async ({ phase, failure }) => {
    const { host } = fixture();
    const cause =
      failure === 'refusal'
        ? new MethodRefused('grant/request-unavailable', 'Canonical refusal details')
        : new TypeError('Transport failure');
    const call = vi.spyOn(host.client, 'call').mockRejectedValue(cause);
    if (phase === 'options' || phase === 'grant')
      call.mockResolvedValueOnce({ workspace: { workspaceId: 'source-workspace' } });
    if (phase === 'grant')
      call.mockResolvedValueOnce({
        workspaces: [{ id: 'source-workspace', path: '/source', title: 'Source' }],
      });
    const actions = remoteMessageActions(
      host,
      { channelId: 'same-channel', messageId: 'same-message', botSlug: 'same-bot' },
      '操作失败，请刷新后重试',
    );
    const error = await (
      phase === 'listing'
        ? actions.listHostFolders()
        : actions.resolveWorkspaceGrantRequest(
            'same-bot',
            'same-message',
            '/source',
            () => '',
            'same-channel',
          )
    ).catch((error: unknown) => error);
    expect(error).toMatchObject({ message: '操作失败，请刷新后重试', cause });
    expect(error).toHaveProperty('cause', cause);
  },
);

it.each([
  { slug: 'other-bot', channelId: 'same-channel', messageId: 'same-message' },
  { slug: 'same-bot', channelId: 'other-channel', messageId: 'same-message' },
  { slug: 'same-bot', channelId: 'same-channel', messageId: 'other-message' },
])('refuses a folder action with changed ownership $slug/$channelId/$messageId', async (target) => {
  const { host, calls } = fixture();
  const actions = remoteMessageActions(
    host,
    { channelId: 'same-channel', messageId: 'same-message', botSlug: 'same-bot' },
    '操作失败，请刷新后重试',
  );
  await expect(
    actions.resolveWorkspaceGrantRequest(
      target.slug,
      target.messageId,
      '/source',
      () => '',
      target.channelId,
    ),
  ).rejects.toMatchObject({
    message: '操作失败，请刷新后重试',
    cause: { message: 'The conversation changed.' },
  });
  expect(calls).toEqual([]);
});

it.each([
  'toolApprovalStatus',
  'toolApprovalState',
  'toolApprovalExecutionState',
  'userQuestionStatus',
] as const)('localizes conversation-card %s errors without losing their cause', async (method) => {
  const { host } = fixture();
  const cause = new Error('The Host answered 502.');
  const call = vi.spyOn(host.client, 'call').mockRejectedValue(cause);
  const actions = remoteMessageActions(
    host,
    { channelId: 'same-channel', messageId: 'same-message', botSlug: 'same-bot' },
    '操作失败，请刷新后重试',
  );
  await expect(actions[method]('same-channel', 'same-message')).rejects.toMatchObject({
    message: '操作失败，请刷新后重试',
    cause,
  });
  expect(
    call.mock.calls.every(
      ([name]) =>
        name === 'toolApprovalStatus' ||
        name === 'userQuestionStatus' ||
        name === 'channelTimeline',
    ),
  ).toBe(true);
});

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
  const forMessage = (messageId: string) =>
    remoteMessageActions(
      host,
      { channelId: 'same-channel', messageId, botSlug: 'same-bot' },
      'Request unavailable',
    );
  const actions = forMessage('same-message');
  await actions.decideToolApproval('same-channel', 'same-message', 'allowed-once');
  await forMessage('question').answerUserQuestion('same-channel', 'question', [
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
  await expect(
    actions.decideToolApproval('same-channel', 'another-message', 'rejected'),
  ).rejects.toMatchObject({
    message: 'Request unavailable',
    cause: expect.objectContaining({ message: 'The conversation changed.' }),
  });
  leave();
  await expect(
    actions.decideToolApproval('same-channel', 'same-message', 'rejected'),
  ).rejects.toMatchObject({
    message: 'Request unavailable',
    cause: expect.objectContaining({ message: 'The conversation changed.' }),
  });
  expect(calls).toHaveLength(2);
});
