// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { type GenuiDocumentMountOptions } from '../../core/src/channels/genui-document-runtime.js';
import { type GenuiDocumentRuntime } from '../../core/src/channels/genui-document-runtime.js';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarkdownText } from '@deepseek-ai/dsh-client-ui-primitives';
import { createActions } from '../src/client/actions.js';
import { ChannelMessageBody } from '../src/client/channel-message-body.js';
import { zhTranslate } from '../src/client/locale.js';
import { store, type ChannelMessage } from '../src/client/store.js';
import { initialGenuiView, parseGenuiReport } from '../../core/src/channels/genui.js';
import { comparisonReport } from '../../core/test/fixtures/genui-report.js';
import {
  initialGenuiDocumentState,
  parseGenuiDocument,
} from '../../core/src/channels/genui-document.js';

const runtime = vi.hoisted(() => ({ load: vi.fn<() => Promise<GenuiDocumentRuntime>>() }));

vi.mock('../src/client/genui-document-runtime.js', () => ({
  loadGenuiDocumentRuntime: runtime.load,
}));

const mountDocument = vi.fn((container: HTMLElement, options: GenuiDocumentMountOptions) => {
  const frame = document.createElement('iframe');
  frame.title = options.document.title;
  frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
  container.append(frame);
  return {
    ready: Promise.resolve(),
    restore: vi.fn(),
    theme: vi.fn(),
    textScale: vi.fn(),
    dispose: vi.fn(() => frame.remove()),
  };
});

vi.mock('@deepseek-ai/dsh-client-ui-primitives', async () =>
  (await import('./support/channel-message-body-primitives.js')).mockMessagePrimitives(),
);

describe('GenUI ordinary message integration', () => {
  it.each(['dm', 'group'] as const)(
    'retains the summary and enables Host view reads only in a Web DM: %s',
    async (type) => {
      Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
      const previous = store.getSnapshot().conversation;
      const channel = {
        id: `${type}-genui`,
        type,
        name: 'GenUI',
        members: ['ada'],
        createdAt: '2026-11-07T00:00:00Z',
        updatedAt: '2026-11-07T00:00:00Z',
      };
      const message: ChannelMessage = {
        id: 'report-integration',
        at: channel.createdAt,
        author: { kind: 'bot', slug: 'ada' },
        body: 'Always readable report summary',
        format: 'text',
        genui: parseGenuiReport(comparisonReport),
      };
      store.setConversation({ status: 'ready', channel, messages: [message], revision: 0 });
      const call = vi.fn(async () => ({
        ok: true as const,
        value: { version: 0, state: initialGenuiView() },
      }));
      const container = document.createElement('div');
      document.body.append(container);
      const root = createRoot(container);
      try {
        await act(async () =>
          root.render(
            createElement(ChannelMessageBody, {
              message,
              channelId: channel.id,
              actions: createActions(call, store),
              t: zhTranslate,
            }),
          ),
        );
        expect(container.textContent).toContain(message.body);
        expect(container.querySelector('table')).not.toBeNull();
        if (type === 'dm') {
          expect(call).toHaveBeenCalledTimes(1);
          expect(call).toHaveBeenCalledWith(
            'channelGenuiView',
            { channelId: channel.id, messageId: message.id },
            undefined,
          );
        } else {
          expect(call).not.toHaveBeenCalled();
          expect(container.querySelector('input')).toBeNull();
        }
      } finally {
        await act(async () => root.unmount());
        container.remove();
        store.setConversation(previous);
      }
    },
  );
});

it.each(['dm', 'group'] as const)(
  'mounts the shared v2 runtime beside the readable summary in %s',
  async (type) => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
    const previous = store.getSnapshot().conversation;
    const channel = {
      id: `${type}-document`,
      type,
      name: 'Synthetic document',
      members: ['ada'],
      createdAt: '2026-11-08T00:00:00Z',
      updatedAt: '2026-11-08T00:00:00Z',
    };
    const genui = parseGenuiDocument({
      version: 2,
      snapshotId: 'document-1',
      title: 'Synthetic document',
      observedAt: channel.createdAt,
      html: '<p>Synthetic</p>',
      stateContract: { version: 1, fields: { expanded: { type: 'boolean', initial: false } } },
    });
    const message: ChannelMessage = {
      id: 'document-message',
      at: channel.createdAt,
      author: { kind: 'bot', slug: 'ada' },
      body: 'Always readable document summary',
      format: 'text',
      genui,
    };
    store.setConversation({ status: 'ready', channel, messages: [message], revision: 0 });
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { version: 0, state: initialGenuiDocumentState(genui) },
    }));
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    try {
      await act(async () =>
        root.render(
          createElement(ChannelMessageBody, {
            message,
            channelId: channel.id,
            actions: createActions(call, store),
            t: zhTranslate,
          }),
        ),
      );
      expect(container.textContent).toContain(message.body);
      expect(runtime.load).toHaveBeenCalledTimes(1);
      expect(mountDocument).toHaveBeenCalledTimes(1);
      expect(mountDocument).toHaveBeenCalledWith(
        expect.any(HTMLElement),
        expect.objectContaining({ document: genui, state: initialGenuiDocumentState(genui) }),
      );
      expect(container.querySelector('iframe')?.title).toBe(genui.title);
      if (type === 'dm')
        expect(call).toHaveBeenCalledWith(
          'channelGenuiView',
          { channelId: channel.id, messageId: message.id },
          undefined,
        );
      else {
        expect(call).not.toHaveBeenCalled();
        expect(container.textContent).not.toContain('保存我的视图');
      }
    } finally {
      await act(async () => root.unmount());
      expect(mountDocument.mock.results[0]?.value.dispose).toHaveBeenCalledTimes(1);
      container.remove();
      store.setConversation(previous);
    }
  },
);

beforeEach(() => {
  vi.mocked(MarkdownText).mockClear();
  runtime.load.mockReset();
  runtime.load.mockResolvedValue({ mountGenuiDocument: mountDocument });
  mountDocument.mockClear();
});
