// @vitest-environment jsdom
import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MethodRefused } from '../../../apps/mobile/src/host/client.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import {
  createRemoteMessageHost,
  hostBridgeCall,
  RemoteMessageHostContext,
  type RemoteMessageHost,
} from '../src/client/remote-message-host.js';
import type { ChannelMessage } from '../src/client/store.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  FileTypeIcon: () => null,
  fileSizeText: (bytes: number) => `${bytes}B`,
  IconCheckOutlineRegular: () => null,
  IconCloseOutlineRegular: () => null,
  IconDownloadOutlineRegular: () => null,
  IconEllipsisOutlineRegular: () => null,
  IconFolderOpenOutlineRegular: () => null,
  IconPlayOutlineRegular: () => null,
  IconPauseOutlineRegular: () => null,
  Input: () => null,
  MarkdownText: ({ text }: { text: string }) => text,
  Modal: () => null,
  StateDot: () => null,
  Tag: () => null,
  Tooltip: ({ children }: { children: ReactNode }) => children,
  Button: ({ children, ...props }: { children: ReactNode }) =>
    createElement('button', props, children),
}));

const ORIGIN = 'https://studio.tailnet-example.ts.net/botharness-device';

function remoteClient(answers: Record<string, unknown>) {
  const call = vi.fn(async (method: string) => {
    if (!(method in answers)) throw new MethodRefused('not-found', `${method} is unavailable`);
    return answers[method];
  });
  return {
    call: call as unknown as <T>(method: string, args?: Record<string, unknown>) => Promise<T>,
    calls: call,
    resource: (path: string) => ({
      uri: ORIGIN + path,
      headers: { authorization: 'Bearer device-1.secret' },
    }),
  };
}

async function mount(message: ChannelMessage, host: RemoteMessageHost, channelId = 'dm-ada') {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      createElement(
        RemoteMessageHostContext.Provider,
        { value: host },
        createElement(ChannelMessageBody, { message, channelId, t: zhTranslate }),
      ),
    ),
  );
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const approval: ChannelMessage = {
  id: 'approval-1',
  at: '2026-10-21T00:00:00.000Z',
  author: { kind: 'bot', slug: 'ada' },
  body: 'Approve bash',
  toolApprovalRequest: {
    sessionId: 'session-1',
    callId: 'call-1',
    toolName: 'bash',
    role: 'orchestrator',
    cwd: '/work',
    input: '{"command":"pwd"}',
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('remote message host', () => {
  it('turns Remote Host refusals into Bridge call failures', async () => {
    const client = remoteClient({ toolApprovalStatus: { status: 'pending' } });
    const call = hostBridgeCall(client);
    await expect(call('toolApprovalStatus', {})).resolves.toEqual({
      ok: true,
      value: { status: 'pending' },
    });
    await expect(call('toolApprovalDecide', {})).resolves.toMatchObject({
      ok: false,
      error: { code: 'not-found', message: 'toolApprovalDecide is unavailable' },
    });
  });

  it('decides a Remote Host approval on that Host while another local Channel is open', async () => {
    const client = remoteClient({
      toolApprovalStatus: { status: 'pending' },
      toolApprovalDecide: { accepted: true },
    });
    const host = createRemoteMessageHost(client, (channelId) => channelId === 'dm-ada');
    const view = await mount(approval, host);
    try {
      const allow = [...view.container.querySelectorAll('button')].find(
        (button) => button.textContent === '允许这次',
      );
      expect(allow).toBeDefined();
      await act(async () => allow!.click());
      expect(client.calls).toHaveBeenCalledWith('toolApprovalDecide', {
        channelId: 'dm-ada',
        messageId: 'approval-1',
        outcome: 'allowed-once',
      });
      expect(view.container.textContent).toContain('终端 · 已允许');
    } finally {
      await view.unmount();
    }
  });

  it('refuses to decide once the remote chat is no longer open', async () => {
    const client = remoteClient({ toolApprovalStatus: { status: 'pending' } });
    const host = createRemoteMessageHost(client, () => false);
    const view = await mount(approval, host);
    try {
      const allow = [...view.container.querySelectorAll('button')].find(
        (button) => button.textContent === '允许这次',
      );
      await act(async () => allow!.click());
      expect(client.calls).not.toHaveBeenCalledWith('toolApprovalDecide', expect.anything());
    } finally {
      await view.unmount();
    }
  });

  it('loads an image attachment from the Remote Host with the device credential', async () => {
    const fetch = vi.fn(
      async () => new Response(new Blob(['png']), { headers: { 'content-type': 'image/png' } }),
    );
    vi.stubGlobal('fetch', fetch);
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:remote-image' }));
    const client = remoteClient({});
    const view = await mount(
      {
        id: 'photo-1',
        at: '2026-10-21T00:00:00.000Z',
        author: { kind: 'human' },
        body: '',
        attachments: [{ name: 'shot.png', mime: 'image/png', size: 3, fileId: 'file-1' }],
      },
      createRemoteMessageHost(client, () => true),
      'group-1',
    );
    try {
      await vi.waitFor(() =>
        expect(view.container.querySelector('img')?.getAttribute('src')).toBe('blob:remote-image'),
      );
      expect(fetch).toHaveBeenCalledWith(
        `${ORIGIN}/api/botharness/attachment?channelId=group-1&messageId=photo-1&fileId=file-1`,
        expect.objectContaining({
          headers: { authorization: 'Bearer device-1.secret' },
          credentials: 'omit',
          mode: 'cors',
        }),
      );
    } finally {
      await view.unmount();
    }
  });
});
