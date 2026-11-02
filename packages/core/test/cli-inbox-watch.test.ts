import { expect, it, vi } from 'vitest';
import { runInboxCommand } from '../src/bots/cli-inbox.js';
import { watchInbox } from '../src/bots/cli-inbox-watch.js';

it('subscribes before baseline, reports real invalidations, and releases the stream with one result', async () => {
  vi.useFakeTimers();
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const cancel = vi.fn();
  const order: string[] = [];
  const stream = vi.fn(async () => {
    order.push('subscribe');
    return new Response(
      new ReadableStream({
        start(c) {
          controller = c;
        },
        cancel,
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  });
  const read = vi.fn(async () => {
    order.push('read');
    return { items: read.mock.calls.length === 1 ? [] : [{ id: 'canonical' }] };
  });
  try {
    const result = watchInbox(stream, read, 1);
    await vi.advanceTimersByTimeAsync(1);
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode('event: human-attention/'));
    controller.enqueue(encoder.encode('changed\ndata: {}\n\nevent: roster/latest\ndata: {}\n\n'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(await result).toEqual({
      seconds: 1,
      invalidations: 1,
      initial: { items: [] },
      current: { items: [{ id: 'canonical' }] },
    });
    expect(order).toEqual(['subscribe', 'read', 'read']);
    expect(cancel).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it('refuses an early disconnect instead of reporting a successful observation', async () => {
  const stream = async () =>
    new Response(
      new ReadableStream({
        start(c) {
          c.close();
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  await expect(watchInbox(stream, async () => ({}), 1)).rejects.toMatchObject({
    code: 'host-unreachable',
  });
});

it('validates bounds and filters before connecting', async () => {
  const connect = vi.fn();
  await expect(
    runInboxCommand('inbox-watch', [], { 'watch-seconds': '61' }, connect),
  ).rejects.toMatchObject({ code: 'usage' });
  await expect(
    runInboxCommand('inbox-watch', [], { category: 'bogus' }, connect),
  ).rejects.toMatchObject({ code: 'usage' });
  expect(connect).not.toHaveBeenCalled();
});
