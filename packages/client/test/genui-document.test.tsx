// @vitest-environment jsdom
import { act, createElement, StrictMode, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GenuiError } from '../../core/src/channels/genui.js';
import {
  initialGenuiDocumentState,
  parseGenuiDocument,
} from '../../core/src/channels/genui-document.js';
import type {
  GenuiDocumentHandle,
  GenuiDocumentMountOptions,
  GenuiDocumentRuntime,
} from '../../core/src/channels/genui-document-runtime.js';
import { GENUI_EXECUTION_LIMITS } from '../../core/src/channels/genui-execution-limits.js';
import { GENUI_MIRROR_SHELL } from '../../core/src/channels/genui-mirror-shell.js';
import { GenuiDocumentCard } from '../src/client/genui-document.js';
import { en, zhTranslate, type BotHarnessTranslate } from '../src/client/locale.js';
import type { GenuiDocumentActions } from '../src/client/genui-document-view.js';

const runtime = vi.hoisted(() => ({ load: vi.fn<() => Promise<GenuiDocumentRuntime>>() }));
vi.mock('../src/client/genui-document-runtime.js', () => ({
  loadGenuiDocumentRuntime: runtime.load,
}));
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
  html: '<button id="choose">Choose</button><script>document.querySelector("#choose").addEventListener("click",()=>genui.setState({query:"chosen"}))</script>',
  stateContract: { version: 1, fields: { query: { type: 'string', initial: '', maxLength: 20 } } },
});
const english: BotHarnessTranslate = (key, params) => {
  const value: unknown = Reflect.get(en, key);
  return (typeof value === 'string' ? value : key).replace(/\{(\w+)\}/g, (_, name: string) =>
    String(params?.[name] ?? name),
  );
};
interface ControlledSurface {
  frame: HTMLIFrameElement;
  options: GenuiDocumentMountOptions;
  handle: GenuiDocumentHandle;
  complete: () => void;
}
let container: HTMLDivElement;
let root: Root;
let actions: GenuiDocumentActions;
const surfaces: ControlledSurface[] = [];
const updateTextScale = vi.fn();

const mount = vi.fn(
  (container: HTMLElement, options: GenuiDocumentMountOptions): GenuiDocumentHandle => {
    const frame = options.shell ?? document.createElement('iframe');
    frame.title = options.document.title;
    frame.setAttribute('sandbox', 'allow-same-origin allow-scripts');
    if (!frame.isConnected) container.append(frame);
    let resolve: (() => void) | undefined;
    const handle = {
      ready: new Promise<void>((complete) => {
        resolve = complete;
      }),
      restore: vi.fn(),
      theme: vi.fn(),
      textScale: updateTextScale,
      dispose: vi.fn(() => frame.remove()),
    };
    surfaces.push({ frame, options, handle, complete: () => resolve?.() });
    return handle;
  },
);

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  runtime.load.mockReset();
  runtime.load.mockResolvedValue({ mountGenuiDocument: mount });
  mount.mockClear();
  updateTextScale.mockClear();
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
  surfaces.length = 0;
  document.body.removeAttribute('data-ds-dark-theme');
  document.body.style.removeProperty('--dsh-content-font-size');
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
}
function latest() {
  const surface = surfaces.at(-1);
  if (!surface) throw Error('Missing controlled shared surface.');
  return surface;
}
async function ready(surface = latest()) {
  await act(async () => surface.complete());
}
function button(label: string) {
  const found = [...container.querySelectorAll('button')].find(
    (candidate) => candidate.textContent === label,
  );
  if (!found) throw Error(`Missing button: ${label}`);
  return found;
}

describe('GenUI card integration with the shared renderer owner', () => {
  it('loads the lazy runtime and waits for successful native-mirror readiness', async () => {
    await render();
    expect(runtime.load).toHaveBeenCalled();
    expect(latest().options.document).toEqual(fixture);
    expect(latest().options.instanceId).toMatch(/^[a-f0-9-]+$/);
    expect(button('Continue').disabled).toBe(true);
    const frames = container.querySelectorAll('iframe');
    expect(frames).toHaveLength(1);
    expect(latest().options.shell).toBe(frames[0]);
    expect(frames[0]?.srcdoc).toBe(GENUI_MIRROR_SHELL);
    expect(frames[0]?.srcdoc).not.toContain(fixture.html);
    await ready();
    expect(button('Continue').disabled).toBe(false);
  });

  it('starts only the fixed script-disabled shell while the runtime loads and removes it on early unmount', async () => {
    runtime.load.mockReturnValue(new Promise(() => {}));
    await render();
    const shell = container.querySelector('iframe');
    expect(shell?.srcdoc).toBe(GENUI_MIRROR_SHELL);
    expect(shell?.getAttribute('sandbox')).toBe('allow-same-origin allow-scripts');
    expect(shell?.referrerPolicy).toBe('no-referrer');
    expect(mount).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    expect(container.querySelector('iframe')).toBeNull();
    root = createRoot(container);
  });

  it('does not remount the runtime for local state or theme changes', async () => {
    await render();
    const surface = latest();
    await ready(surface);
    const count = mount.mock.calls.length;
    for (let index = 0; index < 5; index++)
      await act(async () =>
        surface.options.onState({ version: 1, values: { query: `chosen-${index}` } }),
      );
    await act(async () => document.body.setAttribute('data-ds-dark-theme', ''));
    expect(surface.handle.theme).toHaveBeenLastCalledWith('dark');
    expect(mount).toHaveBeenCalledTimes(count);
    expect(actions.sendGenuiDocumentReply).not.toHaveBeenCalled();
  });

  it('inherits the current content font preference and updates without remounting or saving state', async () => {
    document.body.style.setProperty('--dsh-content-font-size', '22px');
    await render();
    const surface = latest();
    await ready(surface);
    expect(surface.options).toMatchObject({ textScale: 22 / 14 });
    const count = mount.mock.calls.length;
    await act(async () => document.body.style.setProperty('--dsh-content-font-size', '10px'));
    expect(updateTextScale).toHaveBeenLastCalledWith(10 / 14);
    expect(surface.handle.theme).not.toHaveBeenCalled();
    expect(mount).toHaveBeenCalledTimes(count);
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
    await act(async () => document.body.style.removeProperty('--dsh-content-font-size'));
    expect(updateTextScale).toHaveBeenLastCalledWith(1);
    await act(async () => root.unmount());
    updateTextScale.mockClear();
    await act(async () => document.body.style.setProperty('--dsh-content-font-size', '22px'));
    expect(updateTextScale).not.toHaveBeenCalled();
  });

  it('fences the first asynchronous load during StrictMode cleanup/remount', async () => {
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
    expect(mount).toHaveBeenCalledTimes(1);
    await ready();
    expect(button('Continue').disabled).toBe(false);
  });

  it('fences callbacks and readiness when the trusted action owner changes', async () => {
    await render();
    const previous = latest();
    await ready(previous);
    const nextActions = {
      ...actions,
      genuiDocumentView: vi.fn(async () => ({
        version: 0,
        state: initialGenuiDocumentState(fixture),
      })),
    };
    await render(fixture, nextActions);
    const replacement = latest();
    expect(replacement.frame).not.toBe(previous.frame);
    expect(previous.handle.dispose).toHaveBeenCalledTimes(1);
    await act(async () => previous.options.onState({ version: 1, values: { query: 'stale' } }));
    expect(button('Continue').disabled).toBe(true);
    await ready(replacement);
    expect(button('Continue').disabled).toBe(false);
    expect(nextActions.saveGenuiDocumentView).not.toHaveBeenCalled();
  });

  it('does not accept state or readiness through the removed window-message bridge', async () => {
    await render();
    await act(async () =>
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            protocol: 'botharness-genui-v1',
            type: 'state',
            state: { version: 1, values: { query: 'injected' } },
          },
          source: latest().frame.contentWindow,
          origin: 'null',
        }),
      ),
    );
    await act(async () => vi.advanceTimersByTimeAsync(600));
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
    expect(button('Continue').disabled).toBe(true);
  });

  it('persists validated private state without publishing and uses that state for attributable continuation', async () => {
    await render();
    await ready();
    const state = { version: 1 as const, values: { query: 'chosen' } };
    await act(async () => latest().options.onState(state));
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

  it('starts from canonical Host state and disposes theme observation with the surface', async () => {
    const saved = { version: 1 as const, values: { query: 'saved' } };
    vi.mocked(actions.genuiDocumentView).mockResolvedValue({ version: 3, state: saved });
    await render();
    const surface = latest();
    expect(vi.mocked(surface.handle.restore).mock.lastCall?.[0] ?? surface.options.state).toEqual(
      saved,
    );
    await ready(surface);
    await act(async () => document.body.setAttribute('data-ds-dark-theme', ''));
    expect(surface.handle.theme).toHaveBeenLastCalledWith('dark');
    await act(async () => root.render(null));
    vi.mocked(surface.handle.theme).mockClear();
    await act(async () => document.body.removeAttribute('data-ds-dark-theme'));
    expect(surface.handle.theme).not.toHaveBeenCalled();
    expect(surface.handle.dispose).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    'startup',
    'execution',
    'memory',
    'resource',
    'unsupported',
    'invalid-content',
  ] as const)('keeps trusted recovery and disables submission after %s refusal', async (reason) => {
    await render();
    const surface = latest();
    await ready(surface);
    await act(async () => surface.options.onFailure(reason));
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).toContain('The document could not run');
    expect(button('Continue').disabled).toBe(true);
    await act(async () => button('Reload document').click());
    expect(latest().frame).not.toBe(surface.frame);
    await ready();
    expect(button('Continue').disabled).toBe(false);
  });

  it('fails closed on invalid owner state without exposing untrusted error text', async () => {
    await render();
    await ready();
    await act(async () =>
      latest().options.onState({ version: 1, values: { unknown: 'Untrusted failure text' } }),
    );
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.textContent).not.toContain('Untrusted failure text');
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
  });

  it('bounds a stalled asset load and refuses to mount its late completion', async () => {
    let complete: ((value: GenuiDocumentRuntime) => void) | undefined;
    runtime.load.mockReturnValue(
      new Promise((resolve) => {
        complete = resolve;
      }),
    );
    await render();
    await act(async () => vi.advanceTimersByTimeAsync(GENUI_EXECUTION_LIMITS.startupMs));
    expect(container.textContent).toContain('The document could not run');
    await act(async () => complete?.({ mountGenuiDocument: mount }));
    expect(mount).not.toHaveBeenCalled();
    expect(button('Continue').disabled).toBe(true);
  });

  it('offers retry after a missing runtime without native generated-code fallback', async () => {
    runtime.load.mockRejectedValueOnce(Error('Private loader failure detail'));
    await render();
    expect(container.textContent).toContain('The document could not run');
    expect(container.textContent).not.toContain('Private loader failure detail');
    expect(container.querySelector('iframe')).toBeNull();
    await act(async () => button('Reload document').click());
    await ready();
    expect(button('Continue').disabled).toBe(false);
  });

  it('does not offer state recovery without a contract or submissions without actions', async () => {
    const plain = parseGenuiDocument({ ...fixture, stateContract: undefined });
    await render(plain, null, zhTranslate);
    await ready();
    expect(container.textContent).toContain('此文档不保存个人视图');
    expect(actions.genuiDocumentView).not.toHaveBeenCalled();
    expect(container.textContent).not.toContain('继续处理');
    expect(container.textContent).toContain('重新载入文档');
  });

  it('unmounts and fences the renderer when canonical Host access is lost', async () => {
    await render();
    const surface = latest();
    await ready(surface);
    vi.mocked(actions.sendGenuiDocumentReply).mockRejectedValue(
      new GenuiError('genui-unavailable', 'Unavailable'),
    );
    await act(async () => button('Continue').click());
    expect(container.querySelector('iframe')).toBeNull();
    expect(surface.handle.dispose).toHaveBeenCalledTimes(1);
    await act(async () => surface.options.onState({ version: 1, values: { query: 'late' } }));
    expect(actions.saveGenuiDocumentView).not.toHaveBeenCalled();
  });
});
