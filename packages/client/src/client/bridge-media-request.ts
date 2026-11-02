let active = 0;
const waiting: (() => void)[] = [];

export async function boundedBridgeMediaRequest<T>(
  signal: AbortSignal,
  task: () => Promise<T>,
): Promise<T> {
  if (active >= 3)
    await new Promise<void>((resolve, reject) => {
      const abort = () => {
        const index = waiting.indexOf(ready);
        if (index >= 0) waiting.splice(index, 1);
        reject(signal.reason);
      };
      const ready = () => {
        signal.removeEventListener('abort', abort);
        active++;
        resolve();
      };
      waiting.push(ready);
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted) abort();
    });
  else active++;
  try {
    signal.throwIfAborted();
    return await task();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
