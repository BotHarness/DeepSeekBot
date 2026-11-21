import { liveHost, releases } from './remote-hosts-fixtures.js';
import { afterEach, assert, expect, it, vi } from 'vitest';
import { createHostActivityActions } from '../src/client/host-activity-actions.js';
import type { HumanAttentionItem } from '../src/client/store.js';
import { createRemoteHosts } from '../src/client/remote-hosts.js';

afterEach(() => {
  for (const release of releases.splice(0)) release();
  vi.unstubAllGlobals();
});

it.each(
  (['tool-approval', 'user-question'] as const).flatMap((kind) =>
    (['decided', 'expired'] as const).map((result) => ({ kind, result })),
  ),
)(
  'does not accept a remote $kind returning $result after the precheck',
  async ({ kind, result }) => {
    const { host, storage } = liveHost();
    const sources = createRemoteHosts({ carrier: host.carrier, storage });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    let pending = true;
    const item: HumanAttentionItem = {
      id: 'request',
      category: 'action',
      kind,
      botSlug: 'ada',
      channelId: 'dm-ada',
      messageId: 'request-message',
      summary: '',
      createdAt: '',
    };
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => [item],
      refresh,
      open: async () => {},
      requestUnavailable: 'This request was not accepted',
    });
    const request = {
      id: item.messageId,
      toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
      userQuestionRequest: {
        questions: [{ id: 'q', question: 'Choose', options: [{ label: 'Blue' }] }],
      },
    };
    host.methods.set('channelTimeline', () => ({
      revision: 1,
      page: {
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
        entries: [
          request,
          ...(!pending && result === 'decided'
            ? [
                {
                  id: 'other-device-decision',
                  toolApprovalDecision: { requestMessageId: item.messageId, outcome: 'rejected' },
                  userQuestionResolution: {
                    requestMessageId: item.messageId,
                    state: 'answered',
                    answers: [{ id: 'q', selected: ['Blue'] }],
                  },
                },
              ]
            : []),
        ],
      },
    }));
    host.methods.set('toolApprovalStatus', () => ({ status: pending ? 'pending' : 'expired' }));
    host.methods.set('userQuestionStatus', () => ({
      status: pending ? 'pending' : result === 'decided' ? 'answered' : 'expired',
    }));
    host.methods.set(kind === 'tool-approval' ? 'toolApprovalDecide' : 'userQuestionAnswer', () => {
      pending = false;
      throw new Error('Host refused after another device settled the request');
    });
    const status = () =>
      kind === 'tool-approval'
        ? actions.toolApprovalStatus(item.channelId!, item.messageId!)
        : actions.userQuestionStatus(item.channelId!, item.messageId!);
    expect(await status()).toBe('pending');
    const submit = () =>
      kind === 'tool-approval'
        ? actions.decideToolApproval(item.channelId!, item.messageId!, 'allowed-once')
        : actions.answerUserQuestion(item.channelId!, item.messageId!, [
            { id: 'q', selected: ['Blue'] },
          ]);
    await expect(submit()).rejects.toThrow('This request was not accepted');
    expect(refresh).toHaveBeenCalledOnce();
    expect(await status()).toBe(
      kind === 'user-question' && result === 'decided' ? 'answered' : 'expired',
    );
  },
);

it.each(
  (['tool-approval', 'user-question'] as const).flatMap((kind) =>
    (['submit', 'refresh'] as const).map((phase) => ({ kind, phase })),
  ),
)('preserves the $phase failure cause for remote $kind', async ({ kind, phase }) => {
  const { host, storage } = liveHost();
  const method = kind === 'tool-approval' ? 'toolApprovalDecide' : 'userQuestionAnswer';
  const cause = new TypeError('Network request failed');
  host.methods.set(method, () => ({ accepted: true }));
  const sources = createRemoteHosts({
    storage,
    carrier: {
      ...host.carrier,
      async request(url, init) {
        if (phase === 'submit' && url.endsWith('/' + method)) throw cause;
        return host.carrier.request(url, init);
      },
    },
  });
  releases.push(sources.subscribe(() => {}));
  await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
  const refresh = vi.fn(async () => {
    throw cause;
  });
  const actions = createHostActivityActions({
    client: () => sources.client(host.hostId)!,
    items: () => [
      {
        id: 'request',
        category: 'action',
        kind,
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'request-message',
        summary: '',
        createdAt: '',
      },
    ],
    refresh,
    open: async () => {},
    requestUnavailable: '操作失败，请刷新后重试',
  });
  const submit = () =>
    kind === 'tool-approval'
      ? actions.decideToolApproval('dm-ada', 'request-message', 'allowed-once')
      : actions.answerUserQuestion('dm-ada', 'request-message', [{ id: 'q', selected: ['Blue'] }]);
  if (phase === 'submit') {
    await expect(submit()).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: { message: 'The Host could not be reached.' },
    });
    expect(refresh).not.toHaveBeenCalled();
  } else {
    await expect(submit()).rejects.toBe(cause);
    expect(refresh).toHaveBeenCalledOnce();
    expect(host.calls.filter((call) => call.method === method)).toHaveLength(1);
  }
});

it.each(['tool-approval', 'user-question'] as const)(
  'rejects a removed %s without reusing its cached mutation reference',
  async (kind) => {
    const { host, storage } = liveHost();
    host.methods.set('toolApprovalStatus', () => ({ status: 'pending' }));
    host.methods.set('userQuestionStatus', () => ({ status: 'pending' }));
    host.methods.set('channelTimeline', () => ({
      revision: 1,
      page: {
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
        entries: [
          {
            id: 'request-message',
            toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
            userQuestionRequest: { questions: [{ id: 'q', question: 'Choose' }] },
          },
        ],
      },
    }));
    host.methods.set('toolApprovalDecide', () => ({ accepted: true }));
    host.methods.set('userQuestionAnswer', () => ({ accepted: true }));
    const sources = createRemoteHosts({ storage, carrier: host.carrier });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    let items: HumanAttentionItem[] = [
      {
        id: 'request',
        category: 'action',
        kind,
        botSlug: 'ada',
        channelId: 'dm-ada',
        messageId: 'request-message',
        summary: '',
        createdAt: '',
      },
    ];
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => items,
      refresh,
      open: async () => {},
      requestUnavailable: '操作失败，请刷新后重试',
    });
    const status = () =>
      kind === 'tool-approval'
        ? actions.toolApprovalStatus('dm-ada', 'request-message')
        : actions.userQuestionStatus('dm-ada', 'request-message');
    expect(await status()).toBe('pending');
    items = [];
    const submit = () =>
      kind === 'tool-approval'
        ? actions.decideToolApproval('dm-ada', 'request-message', 'allowed-once')
        : actions.answerUserQuestion('dm-ada', 'request-message', [
            { id: 'q', selected: ['Blue'] },
          ]);
    await expect(submit()).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: { message: 'Activity request is unavailable' },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      host.calls.filter(
        ({ method }) => method === 'toolApprovalDecide' || method === 'userQuestionAnswer',
      ),
    ).toEqual([]);
    expect(await status()).toBe('pending');
  },
);

it.each(
  (
    [
      'toolApprovalStatus',
      'toolApprovalState',
      'toolApprovalExecutionState',
      'userQuestionStatus',
    ] as const
  ).flatMap((method) =>
    (['status', 'timeline'] as const).flatMap((read) =>
      (['http', 'non-json', 'network'] as const).map((failure) => ({ method, read, failure })),
    ),
  ),
)(
  'localizes $method $read $failure while retaining its cause',
  async ({ method, read, failure }) => {
    const { host, storage } = liveHost();
    const status = method === 'userQuestionStatus' ? 'userQuestionStatus' : 'toolApprovalStatus';
    const endpoint = read === 'timeline' ? 'channelTimeline' : status;
    host.methods.set(status, () => ({ status: 'pending' }));
    host.methods.set('channelTimeline', () => ({
      revision: 1,
      page: {
        olderCursor: null,
        newerCursor: null,
        hasOlder: false,
        hasNewer: false,
        entries: [
          {
            id: 'request-message',
            toolApprovalRequest: { toolName: 'bash', role: 'orchestrator', cwd: '', input: '{}' },
            userQuestionRequest: { questions: [{ id: 'q', question: 'Choose' }] },
          },
        ],
      },
    }));
    const sources = createRemoteHosts({
      storage,
      carrier: {
        ...host.carrier,
        async request(url, init) {
          if (url.endsWith('/' + endpoint)) {
            if (failure === 'network') throw new TypeError('Network request failed');
            return {
              status: failure === 'http' ? 502 : 200,
              text: async () => '<html>Bad gateway</html>',
            };
          }
          return host.carrier.request(url, init);
        },
      },
    });
    releases.push(sources.subscribe(() => {}));
    await vi.waitFor(() => expect(sources.getSnapshot().hosts[0]?.inbox.status).toBe('ready'));
    const refresh = vi.fn(async () => {});
    const actions = createHostActivityActions({
      client: () => sources.client(host.hostId)!,
      items: () => [
        {
          id: 'request',
          category: 'action',
          kind: method === 'userQuestionStatus' ? 'user-question' : 'tool-approval',
          botSlug: 'ada',
          channelId: 'dm-ada',
          messageId: 'request-message',
          summary: '',
          createdAt: '',
        },
      ],
      refresh,
      open: async () => {},
      requestUnavailable: '操作失败，请刷新后重试',
    });
    const readRequest = actions[method];
    assert(readRequest !== undefined);
    await expect(readRequest('dm-ada', 'request-message')).rejects.toMatchObject({
      message: '操作失败，请刷新后重试',
      cause: {
        message:
          failure === 'http'
            ? 'The Host answered 502.'
            : failure === 'non-json'
              ? 'The Host did not return a JSON response.'
              : 'The Host could not be reached.',
      },
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(
      host.calls.filter(
        ({ method }) => method === 'toolApprovalDecide' || method === 'userQuestionAnswer',
      ),
    ).toEqual([]);
  },
);
