import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import {
  DesktopViewError,
  createDesktopView,
  desktopInputCall,
  jpegEncoder,
  parseDesktopInput,
} from '../src/desktop-view.js';

const shot = (data: string) => ({
  content: [{ type: 'image', data, mimeType: 'image/png' }],
  structuredContent: { screenshot_width: 1440, screenshot_height: 900 },
});

function fakeDriver(screens: string[]) {
  const calls: { tool: string; args: Record<string, unknown> }[] = [];
  let index = 0;
  return {
    calls,
    async call(tool: string, args: Record<string, unknown>) {
      calls.push({ tool, args });
      if (tool !== 'get_desktop_state') return { content: [{ type: 'text', text: 'ok' }] };
      const data = screens[Math.min(index, screens.length - 1)]!;
      index += 1;
      return shot(data);
    },
  };
}

describe('desktop view input', () => {
  it('accepts the phone viewer input shapes and rejects anything else', () => {
    expect(parseDesktopInput({ kind: 'click', x: 10.4, y: 20 })).toEqual({
      kind: 'click',
      x: 10,
      y: 20,
      button: 'left',
      count: 1,
    });
    expect(parseDesktopInput({ kind: 'scroll', direction: 'down', amount: 99 })).toEqual({
      kind: 'scroll',
      direction: 'down',
      amount: 50,
    });
    expect(parseDesktopInput({ kind: 'key', key: 'l', modifiers: ['meta'] })).toMatchObject({
      modifiers: ['meta'],
    });
    for (const bad of [
      { kind: 'click', x: -1, y: 0 },
      { kind: 'click', x: 1, y: 1, button: 'middle' },
      { kind: 'type', text: '' },
      { kind: 'key', key: 'a', modifiers: ['hyper'] },
      { kind: 'drag' },
    ])
      expect(parseDesktopInput(bad)).toBeUndefined();
  });

  it('maps input to desktop-scope driver calls', () => {
    expect(
      desktopInputCall({ kind: 'click', x: 5, y: 6, button: 'right', count: 2 }, undefined),
    ).toEqual({
      tool: 'click',
      args: { scope: 'desktop', x: 5, y: 6, button: 'right', count: 2 },
    });
    expect(
      desktopInputCall({ kind: 'scroll', direction: 'up', amount: 3 }, { x: 40, y: 50 }),
    ).toEqual({
      tool: 'scroll',
      args: { scope: 'desktop', direction: 'up', amount: 3, x: 40, y: 50 },
    });
    expect(desktopInputCall({ kind: 'type', text: 'hi' }, undefined)).toEqual({
      tool: 'type_text',
      args: { scope: 'desktop', text: 'hi' },
    });
    expect(desktopInputCall({ kind: 'key', key: 'return', modifiers: [] }, undefined)).toEqual({
      tool: 'press_key',
      args: { scope: 'desktop', key: 'return' },
    });
    expect(
      desktopInputCall({ kind: 'key', key: 'l', modifiers: ['meta', 'shift'] }, undefined),
    ).toEqual({ tool: 'hotkey', args: { scope: 'desktop', keys: ['cmd', 'shift', 'l'] } });
  });
});

describe('desktop view frames', () => {
  it('publishes a frame only when the screen changes', async () => {
    const driver = fakeDriver(['a', 'a', 'a', 'b']);
    const view = createDesktopView({
      driver,
      isRunning: () => true,
      intervalMs: 0,
      waitMs: 1000,
      encode: async () => undefined,
    });
    const first = await view.next(undefined);
    expect(first).toMatchObject({
      seq: 1,
      data: 'a',
      width: 1440,
      height: 900,
    });
    const second = await view.next(first!.seq);
    expect(second).toMatchObject({ seq: 2, data: 'b' });
    expect(driver.calls[0]).toEqual({
      tool: 'get_desktop_state',
      args: { max_image_dimension: 1600, session: 'phone-viewer' },
    });
    expect(view.stats()).toMatchObject({
      captures: 4,
      unchanged: 2,
      published: 2,
    });
  });

  it('sends a changed screen as JPEG and keeps PNG when encoding fails', async () => {
    const png = await sharp({
      create: { width: 64, height: 40, channels: 3, background: '#3366cc' },
    })
      .png()
      .toBuffer();
    const encoded = await jpegEncoder(png);
    expect(encoded?.mimeType).toBe('image/jpeg');
    expect(encoded?.bytes.subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]));
    expect(await jpegEncoder(Buffer.from('not an image'))).toBeUndefined();

    const view = createDesktopView({
      driver: fakeDriver([png.toString('base64')]),
      isRunning: () => true,
      intervalMs: 0,
    });
    expect(await view.next(undefined)).toMatchObject({
      seq: 1,
      mimeType: 'image/jpeg',
      data: encoded?.bytes.toString('base64'),
    });

    const fallback = createDesktopView({
      driver: fakeDriver(['a']),
      isRunning: () => true,
      encode: async () => undefined,
    });
    expect(await fallback.next(undefined)).toMatchObject({ data: 'a', mimeType: 'image/png' });
  });

  it('keeps a shared capture alive when one poller gives up', async () => {
    let release: (() => void) | undefined;
    const signals: (AbortSignal | undefined)[] = [];
    const view = createDesktopView({
      driver: {
        async call(_tool: string, _args: Record<string, unknown>, signal?: AbortSignal) {
          signals.push(signal);
          await new Promise<void>((resolve) => {
            release = resolve;
          });
          return shot('a');
        },
      },
      isRunning: () => true,
      intervalMs: 0,
      encode: async () => undefined,
    });
    const leaving = new AbortController();
    const first = view.next(undefined, leaving.signal);
    const second = view.next(undefined);
    await new Promise((resolve) => setTimeout(resolve, 0));
    leaving.abort();
    expect(await first).toBeUndefined();
    release?.();
    expect(await second).toMatchObject({ seq: 1, data: 'a' });
    expect(signals).toEqual([undefined]);
  });

  it('answers with no frame when the screen stays the same until the wait ends', async () => {
    const view = createDesktopView({
      driver: fakeDriver(['a']),
      isRunning: () => true,
      intervalMs: 5,
      waitMs: 30,
    });
    const first = await view.next(undefined);
    expect(await view.next(first!.seq)).toBeUndefined();
  });

  it('remembers the last click for a scroll without a position', async () => {
    const driver = fakeDriver(['a']);
    const view = createDesktopView({ driver, isRunning: () => true });
    view.setPaused(true);
    await view.input({ kind: 'click', x: 7, y: 8, button: 'left', count: 1 });
    await view.input({ kind: 'scroll', direction: 'down', amount: 2 });
    expect(driver.calls.at(-1)).toEqual({
      tool: 'scroll',
      args: { scope: 'desktop', direction: 'down', amount: 2, x: 7, y: 8, session: 'phone-viewer' },
    });
  });

  it('refuses while the Computer is stopped and reports driver refusals', async () => {
    const stopped = createDesktopView({
      driver: fakeDriver(['a']),
      isRunning: () => false,
    });
    await expect(stopped.next(undefined)).rejects.toMatchObject({
      code: 'not-running',
    });
    const refusing = createDesktopView({
      driver: {
        call: async () => ({
          isError: true,
          content: [{ type: 'text', text: 'no display' }],
        }),
      },
      isRunning: () => true,
    });
    refusing.setPaused(true);
    const error = await refusing.next(undefined).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(DesktopViewError);
    expect(error).toMatchObject({
      code: 'capture-failed',
      message: 'no display',
    });
    await expect(refusing.input({ kind: 'type', text: 'hi' })).rejects.toMatchObject({
      code: 'input-failed',
    });
  });

  it('takes Human input only while paused, and the pause lapses without the viewer', async () => {
    let clock = 1000;
    const driver = fakeDriver(['a']);
    const view = createDesktopView({
      driver,
      isRunning: () => true,
      pauseLeaseMs: 100,
      now: () => clock,
    });
    await expect(view.input({ kind: 'type', text: 'secret' })).rejects.toMatchObject({
      code: 'not-paused',
    });
    expect(view.setPaused(true)).toBe(true);
    clock += 80;
    await view.input({ kind: 'type', text: 'secret' });
    clock += 80;
    expect(view.isPaused()).toBe(true);
    clock += 101;
    expect(view.isPaused()).toBe(false);
    expect(view.setPaused(true)).toBe(true);
    expect(view.setPaused(false)).toBe(false);
    expect(driver.calls.filter((call) => call.tool === 'type_text')).toHaveLength(1);
  });
});
