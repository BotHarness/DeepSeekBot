import { describe, expect, it } from 'vitest';

import {
  createBrowserViewer,
  fittedFrame,
  moveCursor,
  pagePoint,
  scrollFor,
  stagePoint,
  type BrowserViewerState,
} from '../src/host/browser-viewer';
import type { HostApiAnswer, HostApiInit } from '../src/host/client';

type Call = { path: string; body?: Record<string, unknown> };

function host(answers: ((call: Call) => HostApiAnswer | Promise<HostApiAnswer>)[]) {
  const calls: Call[] = [];
  let next = 0;
  return {
    calls,
    client: {
      async api(path: string, init: HostApiInit = {}) {
        const call: Call = { path, ...(init.body === undefined ? {} : { body: init.body }) };
        calls.push(call);
        const answer = answers[Math.min(next, answers.length - 1)]!;
        next += 1;
        if (init.signal?.aborted === true) throw new Error('cancelled');
        return answer(call);
      },
    },
  };
}

const frame = (seq: number, mode = 'stream'): HostApiAnswer => ({
  status: 200,
  body: {
    ok: true,
    seq,
    mode,
    mimeType: 'image/jpeg',
    data: 'AAAA',
    viewport: { width: 1000, height: 500 },
  },
});

async function settle(
  viewer: { getState(): BrowserViewerState },
  check: (state: BrowserViewerState) => boolean,
) {
  for (let i = 0; i < 50; i += 1) {
    if (check(viewer.getState())) return viewer.getState();
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`state never settled: ${JSON.stringify(viewer.getState())}`);
}

describe('native Browser viewer', () => {
  it('reads the driver, then long-polls frames after the last sequence', async () => {
    let release: () => void = () => undefined;
    const parked = new Promise<HostApiAnswer>((resolve) => {
      release = () => resolve({ status: 204, body: null });
    });
    const h = host([
      () => ({ status: 200, body: { ok: true, takeover: true } }),
      () => frame(7),
      () => ({ status: 204, body: null }),
      () => parked,
    ]);
    const viewer = createBrowserViewer({ client: h.client, slug: 'ada', wait: async () => {} });
    viewer.start();
    const live = await settle(viewer, (state) => state.status === 'live' && h.calls.length >= 4);
    expect(live).toMatchObject({
      takeover: true,
      frame: { seq: 7, uri: 'data:image/jpeg;base64,AAAA', width: 1000, height: 500 },
    });
    expect(h.calls.map((call) => call.path)).toEqual([
      '/api/browser/observation?slug=ada',
      '/api/browser/frame?slug=ada',
      '/api/browser/frame?slug=ada&after=7',
      '/api/browser/frame?slug=ada&after=7',
    ]);
    viewer.stop();
    release();
  });

  it('says the Browser is not running and that Browser Access is off', async () => {
    const off = host([
      () => ({ status: 200, body: { ok: true, takeover: false } }),
      () => ({
        status: 403,
        body: { ok: false, error: 'Browser Access is off for this PersonaBot' },
      }),
    ]);
    const viewer = createBrowserViewer({ client: off.client, slug: 'ada', wait: async () => {} });
    viewer.start();
    expect(await settle(viewer, (state) => state.status === 'no-access')).toMatchObject({
      notice: 'Browser Access is off for this PersonaBot',
    });

    const idle = host([
      () => ({ status: 200, body: { ok: true, takeover: false } }),
      () => ({ status: 404, body: { ok: false, error: 'browser not running' } }),
    ]);
    const stopped = createBrowserViewer({
      client: idle.client,
      slug: 'ada',
      wait: () => new Promise(() => undefined),
    });
    stopped.start();
    await settle(stopped, (state) => state.status === 'not-running');
    stopped.stop();
  });

  it('pauses the Bot, sends Human input and notices when the Bot took control back', async () => {
    const h = host([
      () => ({ status: 200, body: { ok: true, takeover: true } }),
      () => ({ status: 200, body: { ok: true, url: 'https://a.test/', title: 'A' } }),
      () => ({ status: 409, body: { ok: false, error: 'Pause the bot before human input' } }),
    ]);
    const viewer = createBrowserViewer({ client: h.client, slug: 'ada' });
    await viewer.setTakeover(true);
    expect(viewer.getState()).toMatchObject({ takeover: true, switching: false });
    await viewer.send({ kind: 'click', x: 10, y: 20 });
    await viewer.send({ kind: 'type', text: 'hi' });
    expect(viewer.getState()).toMatchObject({
      takeover: false,
      notice: 'Pause the bot before human input',
    });
    expect(h.calls).toEqual([
      { path: '/api/browser/takeover', body: { slug: 'ada', active: true } },
      { path: '/api/browser/input', body: { kind: 'click', x: 10, y: 20, slug: 'ada' } },
      { path: '/api/browser/input', body: { kind: 'type', text: 'hi', slug: 'ada' } },
    ]);
  });
});

describe('touch mapping', () => {
  const page = { width: 1000, height: 500 };
  const stage = { width: 400, height: 400 };

  it('fits the page inside the stage and maps a touch to page pixels', () => {
    expect(fittedFrame(page, stage)).toEqual({ left: 0, top: 100, width: 400, height: 200 });
    expect(pagePoint({ x: 200, y: 200 }, page, stage)).toEqual({ x: 500, y: 250 });
    expect(pagePoint({ x: 10, y: 50 }, page, stage)).toBeUndefined();
  });

  it('keeps the mapping when zoomed and panned', () => {
    const zoom = { scale: 2, x: 100, y: 0 };
    const point = pagePoint({ x: 300, y: 200 }, page, stage, zoom)!;
    expect(point).toEqual({ x: 500, y: 250 });
    expect(stagePoint(point, page, stage, zoom)).toEqual({ x: 300, y: 200 });
  });

  it('moves the trackpad cursor in page pixels and keeps it on the page', () => {
    expect(moveCursor({ x: 500, y: 250 }, { x: 40, y: 0 }, page, stage)).toEqual({
      x: 600,
      y: 250,
    });
    expect(moveCursor({ x: 990, y: 5 }, { x: 40, y: -40 }, page, stage)).toEqual({ x: 1000, y: 0 });
  });

  it('turns a drag into a bounded scroll', () => {
    expect(scrollFor(-30)).toEqual({ direction: 'down', amount: 100 });
    expect(scrollFor(200)).toEqual({ direction: 'up', amount: 400 });
    expect(scrollFor(-5000)).toEqual({ direction: 'down', amount: 1500 });
  });
});
