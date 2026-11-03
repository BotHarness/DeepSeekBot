// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clientLogFields,
  createClientLogRecorder,
  describeControl,
  disposeClientLog,
  installClientLog,
  type ClientLogRecorder,
} from '../src/client/diagnostic-log.js';
import { watchClientLogState } from '../src/client/diagnostic-log-state.js';
import { initialTimeline, type ClientState } from '../src/client/store.js';

interface SentBatch {
  session: string;
  entries: Array<{
    category: string;
    code: string;
    level: string;
    fields?: Record<string, unknown>;
  }>;
}

let recorder: ClientLogRecorder | undefined;

afterEach(() => {
  disposeClientLog();
  recorder?.dispose();
  recorder = undefined;
  document.body.innerHTML = '';
  vi.useRealTimers();
});

function harness(global = false) {
  const sent: SentBatch[] = [];
  const send = vi.fn(async (_url: unknown, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return new Response('{"ok":true}', { status: 200 });
  });
  const options = {
    window: window as Window & typeof globalThis,
    fetch: send as unknown as typeof fetch,
    surface: 'desktop_app',
  };
  const created = global ? installClientLog(options) : createClientLogRecorder(options);
  if (!global) recorder = created;
  const entries = () => sent.flatMap((batch) => batch.entries);
  return { recorder: created, sent, entries };
}

describe('Client diagnostic recorder', () => {
  it('opens a session with device context and ships batches on flush', async () => {
    const { recorder, sent, entries } = harness();
    await recorder.flush();
    expect(sent[0]?.session).toBe(recorder.session);
    expect(entries()[0]).toMatchObject({
      category: 'lifecycle',
      code: 'session-start',
      fields: { surface: 'desktop_app' },
    });
  });

  it('records clicks on controls by label and never records typed text', async () => {
    const { recorder, entries } = harness();
    document.body.innerHTML = `
      <div role="dialog" aria-label="Settings">
        <button class="bh-mode-sidebar-row x" aria-label="Diagnostic logs">icon</button>
      </div>
      <textarea id="composer"></textarea>
      <p id="message">secret message body</p>`;
    document.querySelector('button')!.click();
    document.getElementById('message')!.click();
    const composer = document.getElementById('composer') as HTMLTextAreaElement;
    composer.value = 'my private draft';
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
    composer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true }));
    await recorder.flush();
    const actions = entries().filter((entry) => entry.category === 'action');
    expect(actions).toEqual([
      expect.objectContaining({
        code: 'click',
        fields: {
          role: 'button',
          label: 'Diagnostic logs',
          hook: 'bh-mode-sidebar-row',
          dialog: 'Settings',
        },
      }),
      expect.objectContaining({ code: 'key', fields: { keys: 'Enter', inEditor: true } }),
      expect.objectContaining({ code: 'key', fields: { keys: 'Meta+K' } }),
    ]);
    expect(JSON.stringify(entries())).not.toMatch(/private draft|secret message/u);
  });

  it('captures console warnings with their structured fields and dedupes repeats', async () => {
    const { recorder, entries } = harness();
    const quiet = vi.spyOn(console, 'warn');
    for (let index = 0; index < 3; index += 1)
      console.warn('botharness: something odd', { groups: 4, next: { top: 10 } });
    await recorder.flush();
    const warnings = entries().filter((entry) => entry.code === 'console-warn');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      level: 'warn',
      fields: { message: 'botharness: something odd', groups: 4, 'next.top': 10 },
    });
    quiet.mockRestore();
  });

  it('logs an invariant once as an invariant, not as a console warning', async () => {
    const { recorder, entries } = harness();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    recorder.invariant('timeline-window-lost-groups', 'timeline window lost its rendered groups', {
      groups: 9,
      rendered: 0,
    });
    await recorder.flush();
    expect(entries().filter((entry) => entry.category !== 'lifecycle')).toEqual([
      expect.objectContaining({
        category: 'invariant',
        code: 'timeline-window-lost-groups',
        fields: expect.objectContaining({ groups: 9, rendered: 0 }),
      }),
    ]);
    warn.mockRestore();
  });

  it('times RPCs: slow calls are perf, refusals are network, aborts are ignored', async () => {
    const { recorder, entries } = harness();
    let clock = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => clock);
    await recorder.timeRpc('slowThing', async () => {
      clock += 2000;
      return { ok: true };
    });
    await recorder.timeRpc(
      'refused',
      async () => ({ ok: false, code: 'not-found' }),
      (result) => (result.ok ? undefined : result.code),
    );
    await expect(
      recorder.timeRpc('aborted', async () => {
        throw new DOMException('aborted', 'AbortError');
      }),
    ).rejects.toThrow();
    await recorder.flush();
    const rows = entries().filter((entry) => entry.category !== 'lifecycle');
    expect(rows).toEqual([
      expect.objectContaining({
        category: 'perf',
        code: 'rpc-slow',
        fields: { endpoint: 'slowThing', ms: 2000 },
      }),
      expect.objectContaining({
        category: 'network',
        code: 'rpc-failed',
        fields: expect.objectContaining({ endpoint: 'refused', code: 'not-found' }),
      }),
    ]);
  });

  it('drains each response so the request does not stay open', async () => {
    const responses: Response[] = [];
    recorder = createClientLogRecorder({
      fetch: (async () => {
        const response = new Response('{"ok":true}', { status: 200 });
        responses.push(response);
        return response;
      }) as unknown as typeof fetch,
    });
    recorder.record('action', 'click');
    await recorder.flush();
    expect(responses[0]?.bodyUsed).toBe(true);
  });

  it('splits a burst of large entries into requests under the Host body limit', async () => {
    const { recorder, sent } = harness();
    const bodies: number[] = [];
    for (let index = 0; index < 99; index += 1)
      recorder.record(
        'error',
        `burst-${index}`,
        Object.fromEntries(
          Array.from({ length: 20 }, (_, n) => [`f${n}`, `${index}`.padEnd(300, 'x')]),
        ),
        'error',
      );
    while (sent.reduce((total, batch) => total + batch.entries.length, 0) < 100) {
      const before = sent.length;
      await recorder.flush();
      if (sent.length === before) break;
    }
    for (const batch of sent) bodies.push(JSON.stringify(batch).length);
    expect(sent.length).toBeGreaterThan(1);
    expect(Math.max(...bodies)).toBeLessThan(64 * 1024);
    expect(
      sent.flatMap((batch) => batch.entries).filter((entry) => entry.code.startsWith('burst-')),
    ).toHaveLength(99);
  });

  it('keeps entries for retry when the Host is unreachable', async () => {
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(new Response('{}', { status: 200 }));
    recorder = createClientLogRecorder({ fetch: send as unknown as typeof fetch });
    recorder.record('action', 'click', { label: 'A' });
    await recorder.flush();
    await recorder.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(send.mock.calls[1]![1]!.body)).entries).toHaveLength(1);
  });
});

describe('diagnostic helpers', () => {
  it('flattens one level of nesting and drops functions', () => {
    expect(
      clientLogFields({ a: 1, b: { c: 'x', d: { e: 1 } }, f: () => 1, g: Number.NaN }),
    ).toEqual({ a: 1, 'b.c': 'x' });
  });

  it('labels a control only by aria-label or short plain text, never by title or rich content', () => {
    document.body.innerHTML = `
      <button id="plain">Export logs</button>
      <button id="titled" class="bh-dm-trace-line" title="secret post preview">
        <span>Tob</span><span>secret post preview</span>
      </button>
      <button id="long">${'secret '.repeat(10)}</button>`;
    const label = (id: string) => describeControl(document.getElementById(id)!)?.['label'];
    expect(label('plain')).toBe('Export logs');
    expect(label('titled')).toBeUndefined();
    expect(describeControl(document.getElementById('titled')!)?.['hook']).toBe('bh-dm-trace-line');
    expect(label('long')).toBeUndefined();
  });

  it('ignores clicks outside interactive controls', () => {
    document.body.innerHTML = '<p>text</p>';
    expect(describeControl(document.querySelector('p')!)).toBeUndefined();
  });
});

describe('Client state breadcrumbs', () => {
  it('records selection, load outcomes and an emptied conversation', async () => {
    const { recorder, entries } = harness(true);
    const channel = { id: 'c1' } as ClientState['conversation']['channel'];
    const base = {
      mode: 'bot',
      selection: undefined,
      status: 'ready',
      error: undefined,
      conversation: {
        status: 'idle',
        channel: undefined,
        messages: [],
        error: undefined,
        timeline: initialTimeline(),
      },
    } as unknown as ClientState;
    let state = base;
    const listeners = new Set<() => void>();
    const set = (next: ClientState) => {
      state = next;
      for (const listener of listeners) listener();
    };
    const off = watchClientLogState({
      getSnapshot: () => state,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    });
    set({ ...state, selection: { kind: 'channel', channelId: 'c1' } });
    set({ ...state, conversation: { ...state.conversation, status: 'loading', channel } });
    set({
      ...state,
      conversation: {
        ...state.conversation,
        status: 'ready',
        messages: [{}, {}] as unknown as ClientState['conversation']['messages'],
      },
    });
    set({ ...state, conversation: { ...state.conversation, messages: [] } });
    off();
    await recorder.flush();
    expect(
      entries()
        .filter((entry) => entry.code !== 'session-start')
        .map((entry) => entry.code),
    ).toEqual([
      'mode',
      'select',
      'conversation-loading',
      'conversation-ready',
      'conversation-emptied',
    ]);
  });
});
