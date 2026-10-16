// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClientDiagnostics } from '../../core/src/diagnostics/client-diagnostics.js';
import {
  installClientObserver,
  clientObserverScript,
} from '../../core/src/diagnostics/client-observer.js';

describe('early real Client diagnostic observer', () => {
  const observer = () =>
    (
      window as unknown as {
        __BOTHARNESS_CLIENT_DIAGNOSTICS__: { snapshot(): any; dispose(): void };
      }
    ).__BOTHARNESS_CLIENT_DIAGNOSTICS__;

  it('retains a late shell observation when its first report follows a warning flood', async () => {
    vi.useFakeTimers();
    const diagnostics = createClientDiagnostics();
    vi.stubGlobal(
      'fetch',
      vi.fn((url, options) => diagnostics.fetch(new Request('http://localhost' + url, options))),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    installClientObserver(window);
    for (let n = 0; n < 20; n++) console.warn('[connection] connection lost');
    document.body.innerHTML = '<button><span class="bh-panel-glyph"></span></button>';
    vi.spyOn(document.querySelector('button')!, 'getBoundingClientRect').mockReturnValue({
      width: 30,
      height: 30,
    } as DOMRect);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(20);
    for (let n = 0; n < 100; n++) console.warn('[connection] connection lost');
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot().events).toHaveLength(64);
    expect(
      observer()
        .snapshot()
        .events.some((event: any) => event.code === 'shell-mounted'),
    ).toBe(false);
    expect(
      await (
        await diagnostics.fetch(new Request('http://localhost/api/botharness/client-diagnostics'))
      ).json(),
    ).toMatchObject({
      attempts: [{ state: 'shell-ready' }],
    });
  });
  it('delivers the final closed snapshot while an earlier POST is still in flight', async () => {
    vi.useFakeTimers();
    const diagnostics = createClientDiagnostics();
    const send = vi.fn((url, options) =>
      diagnostics.fetch(new Request('http://localhost' + url, options)),
    );
    send.mockImplementationOnce(() => new Promise(() => {}));
    vi.stubGlobal('fetch', send);
    installClientObserver(window);
    await vi.advanceTimersByTimeAsync(300);
    expect(send).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1]![1]).toMatchObject({ keepalive: true, credentials: 'same-origin' });
    expect(
      await (
        await diagnostics.fetch(new Request('http://localhost/api/botharness/client-diagnostics'))
      ).json(),
    ).toMatchObject({ attempts: [{ state: 'closed' }] });
    await vi.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('defers hidden-document deadlines and records real script resource failures', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');
    installClientObserver(window);
    await vi.advanceTimersByTimeAsync(60000);
    expect(observer().snapshot().state).toBe('starting');
    expect(
      observer()
        .snapshot()
        .events.some((event: any) => event.code === 'observation-deferred'),
    ).toBe(true);
    const script = document.createElement('script');
    document.head.appendChild(script);
    script.dispatchEvent(new Event('error'));
    expect(observer().snapshot()).toMatchObject({
      state: 'failed',
      firstFailure: { code: 'resource-load-failed' },
    });
    script.remove();
  });
  it('executes the serialized pre-bootstrap script without a Client module or lexical closure', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    window.eval(clientObserverScript());
    expect(observer().snapshot()).toMatchObject({
      state: 'starting',
      events: [{ code: 'observer-installed' }],
    });
  });

  it('requires the real visible committed navigation and keeps failure sticky', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installClientObserver(window);
    document.body.innerHTML = '<button><span class="bh-panel-glyph"></span></button>';
    vi.spyOn(document.querySelector('button')!, 'getBoundingClientRect').mockReturnValue({
      width: 30,
      height: 30,
    } as DOMRect);
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot().state).toBe('shell-ready');
    console.error('private message token=secret');
    expect(observer().snapshot()).toMatchObject({
      state: 'failed',
      firstFailure: { code: 'unclassified-exception' },
    });
    expect(JSON.stringify(observer().snapshot())).not.toContain('secret');
    await vi.advanceTimersByTimeAsync(10000);
    expect(observer().snapshot().state).toBe('failed');
  });

  it('keeps the shell ready when Bot mode replaces the native sidebar and when it exits', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 30,
      height: 30,
    } as DOMRect);
    installClientObserver(window);
    for (const html of [
      '<button><span class="bh-panel-glyph"></span></button>',
      '<div class="bh-root bh-main">Bot mode</div>',
      '<button><span class="bh-panel-glyph"></span></button>',
    ]) {
      document.body.innerHTML = html;
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(300);
      expect(observer().snapshot()).toMatchObject({ state: 'shell-ready' });
      expect(observer().snapshot().firstFailure).toBeUndefined();
    }
    document.body.innerHTML = '<div class="bh-root">Window Companion</div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot()).toMatchObject({
      state: 'failed',
      firstFailure: { code: 'shell-lost' },
    });
  });

  it('requires a visible Bot mode main surface after the boot screen is gone', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    installClientObserver(window);
    document.body.innerHTML = '<div class="bh-root bh-main"></div>';
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot().state).toBe('starting');
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      width: 30,
      height: 30,
    } as DOMRect);
    document.body.insertAdjacentHTML('beforeend', '<div data-dsh-boot></div>');
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot().state).toBe('starting');
    document.querySelector('[data-dsh-boot]')!.remove();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);
    expect(observer().snapshot().state).toBe('shell-ready');
  });

  it('preserves first failure and bounds a flood, with finite delivery retries and cleanup', async () => {
    vi.useFakeTimers();
    const send = vi.fn().mockRejectedValue(new Error('private network detail'));
    vi.stubGlobal('fetch', send);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installClientObserver(window);
    for (let n = 0; n < 100; n++)
      console.error(
        new Error(
          n === 0 ? "renderSlot('root') before any 'root' registration (boot order)" : 'private',
        ),
      );
    const value = observer().snapshot();
    expect(value.events).toHaveLength(64);
    expect(value.dropped).toBe(37);
    expect(value.firstFailure.code).toBe('root-registration-missing');
    expect(value.events.at(-1).seq).toBe(101);
    await vi.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(4);
    expect(observer().snapshot().delivery).toBe('failed');
    const controller = observer();
    controller.dispose();
    await vi.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(4);
  });
  afterEach(() => {
    (
      window as unknown as { __BOTHARNESS_CLIENT_DIAGNOSTICS__?: { dispose(): void } }
    ).__BOTHARNESS_CLIENT_DIAGNOSTICS__?.dispose();
    vi.useRealTimers();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('retains the first root failure and later unknown-session error before Client activation', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    installClientObserver(window);
    console.error(new Error("renderSlot('root') before any 'root' registration (boot order)"));
    window.addEventListener('error', (event) => event.preventDefault(), { once: true });
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new Error('uiConversation.binding: unknown session "private-session"'),
      }),
    );
    const state = (
      window as unknown as {
        __BOTHARNESS_CLIENT_DIAGNOSTICS__: { snapshot(): unknown; dispose(): void };
      }
    ).__BOTHARNESS_CLIENT_DIAGNOSTICS__;
    expect(state?.snapshot()).toMatchObject({
      state: 'failed',
      firstFailure: { seq: 2, code: 'root-registration-missing', source: 'console-error' },
      events: [
        { seq: 1, code: 'observer-installed' },
        { seq: 2, code: 'root-registration-missing' },
        { seq: 3, code: 'conversation-session-missing' },
      ],
    });
    expect(JSON.stringify(state.snapshot())).not.toContain('private-session');
    state.dispose();
  });
});
