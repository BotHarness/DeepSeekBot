import { BridgeCallError } from './bridge-transport.js';

const ATTACHMENT_OPEN_TIMEOUT_MS = 4000;

export function createAttachmentOpenRequests() {
  const lifetime = new AbortController();
  let generation = new AbortController();
  const interrupted = () =>
    new BridgeCallError('attachment-open-interrupted', 'The Host connection changed.');

  return {
    reset() {
      const previous = generation;
      generation = new AbortController();
      previous.abort(interrupted());
    },
    dispose() {
      lifetime.abort(interrupted());
    },
    async run<T>(open: (signal: AbortSignal) => Promise<T>): Promise<T> {
      const request = new AbortController();
      const signal = AbortSignal.any([lifetime.signal, generation.signal, request.signal]);
      signal.throwIfAborted();
      let cancel: (() => void) | undefined;
      const timer = setTimeout(() => {
        request.abort(new BridgeCallError('attachment-open-timeout', 'The Host did not answer.'));
      }, ATTACHMENT_OPEN_TIMEOUT_MS);
      try {
        const result = await new Promise<T>((resolve, reject) => {
          cancel = () => {
            const reason: unknown = signal.reason;
            reject(
              reason instanceof Error
                ? reason
                : new Error('Attachment open cancelled', { cause: reason }),
            );
          };
          signal.addEventListener('abort', cancel, { once: true });
          void open(signal).then(resolve, reject);
        });
        signal.throwIfAborted();
        return result;
      } finally {
        clearTimeout(timer);
        if (cancel !== undefined) signal.removeEventListener('abort', cancel);
      }
    },
  };
}

export type AttachmentOpenRequests = ReturnType<typeof createAttachmentOpenRequests>;
