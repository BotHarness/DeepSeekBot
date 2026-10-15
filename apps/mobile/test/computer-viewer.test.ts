import { describe, expect, it } from 'vitest';

import type { HostApiAnswer, HostApiInit } from '../src/host/client';
import {
  addedText,
  createComputerViewer,
  typedInputs,
  wheelInput,
  WHEEL_STEP,
  type ComputerViewerState,
} from '../src/host/computer-viewer';

type Call = { path: string; body?: Record<string, unknown> };

function host(answers: ((call: Call) => HostApiAnswer | Promise<HostApiAnswer>)[]) {
  const calls: Call[] = [];
  let next = 0;
  return {
    calls,
    client: {
      async api(path: string, init: HostApiInit = {}) {
        const call: Call = {
          path,
          ...(init.body === undefined ? {} : { body: init.body }),
        };
        calls.push(call);
        const answer = answers[Math.min(next, answers.length - 1)]!;
        next += 1;
        if (init.signal?.aborted === true) throw new Error('cancelled');
        return answer(call);
      },
    },
  };
}

const frame = (seq: number): HostApiAnswer => ({
  status: 200,
  body: {
    ok: true,
    target: 'local',
    seq,
    mimeType: 'image/png',
    data: 'cG5n',
    width: 1440,
    height: 900,
  },
});

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function watch(
  viewer: ReturnType<typeof createComputerViewer>,
  until: (state: ComputerViewerState) => boolean,
) {
  return new Promise<ComputerViewerState>((resolve) => {
    const stop = viewer.subscribe(() => {
      const state = viewer.getState();
      if (until(state)) {
        stop();
        resolve(state);
      }
    });
  });
}

describe('Computer viewer', () => {
  it('long-polls desktop frames after the last sequence it saw', async () => {
    const fake = host([() => frame(1), () => ({ status: 204, body: undefined }), () => frame(2)]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
    });
    const second = watch(viewer, (state) => state.frame?.seq === 2);
    viewer.start();
    const state = await second;
    viewer.stop();
    expect(state).toMatchObject({
      status: 'live',
      control: false,
      frame: {
        seq: 2,
        uri: 'data:image/png;base64,cG5n',
        width: 1440,
        height: 900,
      },
    });
    expect(fake.calls.slice(0, 3).map((call) => call.path)).toEqual([
      '/api/computer/frame',
      '/api/computer/frame?after=1',
      '/api/computer/frame?after=1',
    ]);
  });

  it('shows a stopped Computer and starts over when it comes back', async () => {
    const fake = host([
      () => ({
        status: 409,
        body: { ok: false, code: 'not-running', error: 'stopped' },
      }),
      () => frame(5),
    ]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
    });
    const stopped = watch(viewer, (state) => state.status === 'not-running');
    viewer.start();
    await stopped;
    await watch(viewer, (state) => state.status === 'live');
    viewer.stop();
    expect(fake.calls[1]!.path).toBe('/api/computer/frame');
  });

  it('pauses the Bot on the first input, hands back when idle and when the screen closes', async () => {
    const fake = host([
      async (call) => {
        if (call.path === '/api/computer/input') return { status: 200, body: { ok: true } };
        if (call.path === '/api/computer/takeover')
          return { status: 200, body: { ok: true, paused: call.body?.['active'] === true } };
        await new Promise((resolve) => setTimeout(resolve, 5));
        return frame(1);
      },
    ]);
    const viewer = createComputerViewer({
      client: fake.client,
      wait: async () => undefined,
      releaseMs: 20,
    });
    viewer.start();
    await watch(viewer, (state) => state.status === 'live');
    await viewer.send({ kind: 'click', x: 3, y: 4 });
    expect(viewer.getState().control).toBe(true);
    await watch(viewer, (state) => !state.control);
    await viewer.send({ kind: 'click', x: 5, y: 6 });
    viewer.stop();
    await settle();
    expect(fake.calls.filter((call) => !call.path.startsWith('/api/computer/frame'))).toEqual([
      { path: '/api/computer/takeover', body: { active: true } },
      { path: '/api/computer/input', body: { kind: 'click', x: 3, y: 4 } },
      { path: '/api/computer/takeover', body: { active: false } },
      { path: '/api/computer/takeover', body: { active: true } },
      { path: '/api/computer/input', body: { kind: 'click', x: 5, y: 6 } },
      { path: '/api/computer/takeover', body: { active: false } },
    ]);
    expect(viewer.getState().control).toBe(false);
  });

  it('pauses again and resends when the pause lapsed on the Host', async () => {
    let refused = false;
    const fake = host([
      (call) => {
        if (call.path === '/api/computer/takeover')
          return { status: 200, body: { ok: true, paused: call.body?.['active'] === true } };
        if (call.path !== '/api/computer/input') return frame(1);
        if (refused) return { status: 200, body: { ok: true } };
        refused = true;
        return { status: 409, body: { ok: false, code: 'not-paused', error: 'Pause first' } };
      },
    ]);
    const viewer = createComputerViewer({ client: fake.client, wait: async () => undefined });
    viewer.start();
    await watch(viewer, (state) => state.status === 'live');
    await viewer.setControl(true);
    await viewer.send({ kind: 'type', text: 'a' });
    viewer.stop();
    expect(
      fake.calls.filter((call) => !call.path.startsWith('/api/computer/frame')).map((c) => c.path),
    ).toEqual([
      '/api/computer/takeover',
      '/api/computer/input',
      '/api/computer/takeover',
      '/api/computer/input',
      '/api/computer/takeover',
    ]);
    expect(viewer.getState().notice).toBeUndefined();
  });

  it('sends input one at a time, in the order it was given', async () => {
    let release: () => void = () => {};
    const slowFirst = new Promise<void>((resolve) => {
      release = resolve;
    });
    let inputs = 0;
    const fake = host([
      async (call) => {
        if (call.path === '/api/computer/takeover')
          return { status: 200, body: { ok: true, paused: true } };
        if (call.path !== '/api/computer/input') {
          await new Promise((resolve) => setTimeout(resolve, 5));
          return frame(1);
        }
        inputs += 1;
        if (inputs === 1) await slowFirst;
        return { status: 200, body: { ok: true } };
      },
    ]);
    const viewer = createComputerViewer({ client: fake.client, wait: async () => undefined });
    viewer.start();
    await watch(viewer, (state) => state.status === 'live');
    await viewer.setControl(true);
    const typed = viewer.send({ kind: 'type', text: 'hi' });
    const chord = viewer.send({ kind: 'key', key: 'a', modifiers: ['meta'] });
    await settle();
    const sent = () => fake.calls.filter((call) => call.path === '/api/computer/input');
    expect(sent()).toHaveLength(1);
    release();
    await Promise.all([typed, chord]);
    viewer.stop();
    expect(sent().map((call) => call.body)).toEqual([
      { kind: 'type', text: 'hi' },
      { kind: 'key', key: 'a', modifiers: ['meta'] },
    ]);
  });
});

describe('Computer pointer and keys', () => {
  it('turns wheel travel into notches scrolled under the pointer', () => {
    expect(wheelInput(WHEEL_STEP - 1)).toBeUndefined();
    expect(wheelInput(-WHEEL_STEP * 2.5, { x: 10.4, y: 20.6 })).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 2,
      x: 10,
      y: 21,
    });
    expect(wheelInput(WHEEL_STEP * 100)).toEqual({ kind: 'scroll', direction: 'up', amount: 15 });
  });

  it('types plain text, and turns text into chords while a modifier is latched', () => {
    expect(typedInputs('', ['meta'])).toEqual([]);
    expect(typedInputs('Hello', [])).toEqual([{ kind: 'type', text: 'Hello' }]);
    expect(typedInputs('C', ['meta', 'shift'])).toEqual([
      { kind: 'key', key: 'c', modifiers: ['meta', 'shift'] },
    ]);
  });

  it('reads each keystroke as the text added to the hidden field', () => {
    expect(addedText('', 'H')).toBe('H');
    expect(addedText('He', 'Hel')).toBe('l');
    expect(addedText('Hel', 'He')).toBe('');
    expect(addedText('abc', 'x')).toBe('');
  });
});
