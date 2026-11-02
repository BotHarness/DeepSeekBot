import { parseLiveFrame } from '../channels/live-frames.js';
import { CliLiveError } from './cli-live-error.js';

export async function watchInbox(
  stream: (path: string) => Promise<Response>,
  read: () => Promise<unknown>,
  seconds: number,
): Promise<unknown> {
  const response = await stream('/api/botharness/stream?scope=roster');
  if (!response.body || !response.headers.get('content-type')?.includes('text/event-stream'))
    throw new CliLiveError(
      'host-query-unsupported',
      'The Host did not open the inbox event stream.',
    );
  const reader = response.body.getReader();
  let elapsed = false;
  let invalidations = 0;
  let failure: unknown;
  const timer = setTimeout(() => {
    elapsed = true;
    void reader.cancel().catch(() => {});
  }, seconds * 1000);
  const consuming = (async () => {
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) {
        if (!elapsed)
          throw new CliLiveError(
            'host-unreachable',
            'The inbox event stream ended before the observation completed.',
          );
        return;
      }
      buffer += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) !== -1) {
        const frame = parseLiveFrame(buffer.slice(0, end));
        buffer = buffer.slice(end + 2);
        if (frame?.event === 'human-attention/changed') invalidations++;
      }
      if (buffer.length > 1_048_576)
        throw new CliLiveError(
          'host-query-unsupported',
          'The inbox event frame exceeds the supported size.',
        );
    }
  })().catch((error) => {
    failure = error;
  });
  try {
    const initial = await read();
    await consuming;
    if (failure) throw failure;
    return { seconds, invalidations, initial, current: await read() };
  } finally {
    clearTimeout(timer);
    elapsed = true;
    await reader.cancel().catch(() => {});
    await consuming;
    reader.releaseLock();
  }
}
