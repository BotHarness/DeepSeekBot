// @vitest-environment jsdom
import { act, createElement, StrictMode, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenuiError } from '../../core/src/channels/genui.js';
import {
  initialGenuiDocumentState,
  parseGenuiDocument,
} from '../../core/src/channels/genui-document.js';
import {
  GENUI_HTML_PROTOCOL,
  GENUI_HTML_RUNTIME_LIMITS,
} from '../../core/src/channels/genui-html.js';
import * as htmlCompiler from '../../core/src/channels/genui-html.js';
import { GenuiDocumentCard } from '../src/client/genui-document.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import type { GenuiDocumentActions } from '../src/client/genui-document-view.js';

vi.mock('@deepseek-ai/dsh-client-ui-primitives', () => ({
  Button: ({
    children,
    size: _size,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & { size?: string; children: ReactNode }) =>
    createElement('button', props, children),
  IconRefreshOutlineRegular: () => null,
}));

const fixture = parseGenuiDocument({
  version: 2,
  snapshotId: 'doc-1',
  title: 'Synthetic document',
  observedAt: '2026-11-08T00:00:00Z',
  html: '<button onclick="genui.setState({query:\'chosen\'})">Choose</button>',
  stateContract: { version: 1, fields: { query: { type: 'string', initial: '', maxLength: 20 } } },
});
const english: BotHarnessTranslate = (key, params) => {
  const value: unknown = Reflect.get(en, key);
  return (typeof value === 'string' ? value : key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? name),
  );
};
let container: HTMLDivElement;
let root: Root;
let actions: GenuiDocumentActions;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  actions = {
    genuiDocumentView: vi.fn(async () => ({
      version: 0,
      state: initialGenuiDocumentState(fixture),
    })),
    saveGenuiDocumentView: vi.fn(async (_channel, _message, _document, version, state) => ({
      version: version + 1,
      state,
    })),
    sendGenuiDocumentReply: vi.fn(async () => {}),
  };
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  document.body.removeAttribute('data-ds-dark-theme');
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function render(
  document = fixture,
  available: GenuiDocumentActions | null = actions,
  t = english,
) {
  await act(async () =>
    root.render(
      <GenuiDocumentCard
        document={document}
        channelId="dm-1"
        messageId="message-1"
        {...(available ? { actions: available } : {})}
        t={t}
      />,
    ),
  );
  const frame = container.querySelector('iframe');
  if (!frame) throw new Error('Missing document iframe');
  const instanceId = /const instanceId = "([^"]+)"/.exec(frame.srcdoc)?.[1];
  if (!instanceId) throw new Error('Missing document instance');
  return { frame, instanceId };
}

const frameSequences = new WeakMap<HTMLIFrameElement, number>();

async function message(
  frame: HTMLIFrameElement,
  instanceId: string,
  payload: Record<string, unknown>,
  origin = 'null',
  source: MessageEventSource | null = frame.contentWindow,
) {
  const sequence = (frameSequences.get(frame) ?? 0) + 1;
  frameSequences.set(frame, sequence);
  await act(async () =>
    window.dispatchEvent(
      new MessageEvent('message', {
        data: { protocol: GENUI_HTML_PROTOCOL, instanceId, sequence, ...payload },
        origin,
        source,
      }),
    ),
  );
}

function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!found) throw new Error(`Missing button: ${label}`);
  return found;
}

describe('isolated document card', () => {
  it('does not rebuild the guardian for local state, height, heartbeat or theme updates', async () => {
    const build = vi.spyOn(htmlCompiler, 'buildGenuiHtmlDocument');
    const { frame, instanceId } = await render();
    expect(build).toHaveBeenCalledTimes(1);
    await message(frame, instanceId, { type: 'ready' });
    for (let index = 0; index < 5; index++) {
      await message(frame, instanceId, { type: 'height', height: 200 + index });
      await message(frame, instanceId, { type: 'heartbeat' });
      await message(frame, instanceId, {
        type: 'state',
        state: { version: 1, values: { query: `chosen-${index}` } },
      });
    }
    await act(async () => document.body.setAttribute('data-ds-dark-theme', ''));
    expect(build).toHaveBeenCalledTimes(1);
    expect(actions.sendGenuiDocumentReply).not.toHaveBeenCalled();
  });

  it('restores lifecycle listeners after a StrictMode cleanup/remount', async () => {
    await act(async () =>
      root.render(
        <StrictMode>
          <GenuiDocumentCard
            document={fixture}
            channelId="dm-1"
            messageId="message-1"
            actions={actions}
            t={english}
          />
        </StrictMode>,
      ),
    );
    const frame = container.querySelector('iframe')!;
    const instanceId = /const instanceId = "([^"]+)"/.exec(frame.srcdoc)?.[1];
    if (!instanceId) throw new Error('Missing document instance');
    await message(frame, instanceId, { type: 'ready' });
    expect(button('Continue').disabled).toBe(false);
  });

  it('fences an old frame and state when the trusted action owner changes', async () => {
    const { frame, instanceId } = await render();
    await message(frame, instanceId, { type: 'ready' });
    const nextActions = {
      ...actions,
      genuiDocumentView: vi.fn(async () => ({
        version: 0,
        state: initialGenuiDocumentState(fixture),
      })),
    };
    const replacement = await render(fixture, nextActions);
    expect(replacement.frame).not.toBe(frame);
    expect(button('Continue').disabled).toBe(true);
    await message(frame, instanceId, { type: 'ready' });
    expect(button('Continue').disabled).toBe(true);
    await message(replacement.frame, replacement.instanceId, { type: 'ready' });
    expect(button('Continue').disabled).toBe(false);
  });
  it('mounts the guardian srcdoc without same-origin capability and waits for ready', async () => {
    const { frame, instanceId } = await render();
    expect(frame.sandbox?.toString() ?? frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(frame.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(frame.dataset['documentId']).toHaveLength(64);
    expect(frame.srcdoc).toContain('genui-guardian');
    expect(button('Continue').disabled).toBe(true);
    await message(frame, instanceId, { type: 'ready' });
    expect(button('Continue').disabled).toBe(false);
  });

  it('ignores earlier same-mount bridge envelopes after a newer state', async () => {
    const { frame, instanceId } = await render();
    await message(frame, instanceId, { type: 'ready', sequence: 1 });
    const newer = { version: 1, values: { query: 'newer' } };
    await message(frame, instanceId, { type: 'state', sequence: 3, state: newer });
    await message(frame, instanceId, {
      type: 'state',
      sequence: 2,
      state: { version: 1, values: { query: 'earlier' } },
    });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(actions.saveGenuiDocumentView).toHaveBeenLastCalledWith(
      'dm-1',
      'message-1',
      fixture,
      0,
      newer,
    );
  });

  it('ignores forged source/origin/instance, unknown types and pre-ready state', async () => {
    const { frame, instanceId } = await render();
    const state = { version: 1, values: { query: 'chosen' } };
    await message(frame, instanceId, { type: 'ready' }, 'https://untrusted.invalid');
    await message(frame, instanceId, { type: 'ready' }, 'null', window);
    await message(frame, 'stale-instance', { type: 'ready' });
    await message(frame, instanceId, { type: 'state', state });
    await message(frame, instanceId, { type: 'invoke', method: 'channelSend' });
    expect(button('Continue').disabled).toBe(true);
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
    expect(actions.sendGenuiDocumentReply).not.toHaveBeenCalled();
    await message(frame, instanceId, { type: 'ready' });
    await message(frame, instanceId, { type: 'state', state });
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(actions.saveGenuiDocumentView).toHaveBeenCalledWith(
      'dm-1',
      'message-1',
      fixture,
      0,
      state,
    );
    expect(actions.sendGenuiDocumentReply).not.toHaveBeenCalled();
    await act(async () => button('Continue').click());
    expect(actions.sendGenuiDocumentReply).toHaveBeenCalledWith(
      'dm-1',
      expect.any(String),
      expect.stringMatching(/^human-/),
      {
        version: 2,
        messageId: 'message-1',
        snapshotId: fixture.snapshotId,
        intent: 'continue',
        state,
      },
    );
  });

  it('restores validated Host state after ready and tracks actual body theme with cleanup', async () => {
    const saved = { version: 1 as const, values: { query: 'saved' } };
    vi.mocked(actions.genuiDocumentView).mockResolvedValue({ version: 3, state: saved });
    const { frame, instanceId } = await render();
    const post = vi.spyOn(frame.contentWindow!, 'postMessage');
    await message(frame, instanceId, { type: 'ready' });
    expect(post).toHaveBeenCalledWith(
      { protocol: GENUI_HTML_PROTOCOL, instanceId, type: 'restore', state: saved },
      '*',
    );
    await act(async () => document.body.setAttribute('data-ds-dark-theme', ''));
    expect(post).toHaveBeenLastCalledWith(
      { protocol: GENUI_HTML_PROTOCOL, instanceId, type: 'theme', theme: 'dark' },
      '*',
    );
    await act(async () => root.render(null));
    post.mockClear();
    await act(async () => document.body.removeAttribute('data-ds-dark-theme'));
    await act(async () => vi.advanceTimersByTimeAsync(GENUI_HTML_RUNTIME_LIMITS.startupMs));
    expect(post).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds height and provides an independently scrollable embed', async () => {
    const { frame, instanceId } = await render();
    await message(frame, instanceId, { type: 'ready' });
    await message(frame, instanceId, { type: 'height', height: 2000 });
    expect(frame.style.height).toBe('2000px');
    await message(frame, instanceId, { type: 'height', height: 20_001 });
    expect(frame.style.height).toBe('2000px');
    await message(frame, instanceId, { type: 'height', height: 47 });
    expect(frame.style.height).toBe('2000px');
  });

  it.each(['startup', 'heartbeat', 'page-error', 'invalid-state'])(
    'keeps trusted recovery controls after %s failure',
    async (failure) => {
      const { frame, instanceId } = await render();
      if (failure === 'startup')
        await act(async () => vi.advanceTimersByTimeAsync(GENUI_HTML_RUNTIME_LIMITS.startupMs));
      else {
        await message(frame, instanceId, { type: 'ready' });
        if (failure === 'heartbeat')
          await act(async () =>
            vi.advanceTimersByTimeAsync(GENUI_HTML_RUNTIME_LIMITS.heartbeatTimeoutMs),
          );
        if (failure === 'page-error')
          await message(frame, instanceId, { type: 'error', message: 'Untrusted failure text' });
        if (failure === 'invalid-state')
          await message(frame, instanceId, {
            type: 'state',
            state: { version: 1, values: { unknown: 'field' } },
          });
      }
      expect(container.querySelector('iframe')).toBeNull();
      expect(container.textContent).toContain('The document could not run');
      expect(container.textContent).not.toContain('Untrusted failure text');
      expect(button('Continue').disabled).toBe(true);
      await act(async () => button('Reload document').click());
      const replacement = container.querySelector('iframe');
      expect(replacement).not.toBeNull();
      expect(replacement?.srcdoc).not.toBe(frame.srcdoc);
    },
  );

  it('does not offer state recovery without a contract, or submissions without actions', async () => {
    const plain = parseGenuiDocument({ ...fixture, stateContract: undefined });
    const { frame, instanceId } = await render(plain, null, zhTranslate);
    await message(frame, instanceId, { type: 'ready' });
    expect(container.textContent).toContain('此文档不保存个人视图');
    expect(actions.genuiDocumentView).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('保存我的视图');
    expect(container.textContent).not.toContain('继续处理');
    expect(container.textContent).toContain('重新载入文档');
  });

  it('unmounts the document when Host access is lost', async () => {
    const { frame, instanceId } = await render();
    await message(frame, instanceId, { type: 'ready' });
    vi.mocked(actions.sendGenuiDocumentReply).mockRejectedValue(
      new GenuiError('genui-unavailable', 'Unavailable'),
    );
    await act(async () => button('Continue').click());
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('Your private draft was cleared');
  });
});
