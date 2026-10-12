import { MessagingProviderError } from './provider.js';

export async function boundedMessagingDelivery<T>(
  lifetime: AbortSignal,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const signal = AbortSignal.any([lifetime, AbortSignal.timeout(15000)]);
  let abort: (() => void) | undefined;
  try {
    signal.throwIfAborted();
    return await Promise.race([
      Promise.resolve().then(() => run(signal)),
      new Promise<never>((_, reject) => {
        abort = () => reject(new MessagingProviderError('provider-result-unknown', 'unknown'));
        signal.addEventListener('abort', abort, { once: true });
      }),
    ]);
  } finally {
    if (abort) signal.removeEventListener('abort', abort);
  }
}
