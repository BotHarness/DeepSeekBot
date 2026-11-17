import type { AssignmentDetail } from './bot-runtime.js';

export interface AssignmentWaitOutcome {
  outcome: 'report' | 'settled' | 'timeout';
  assignment: AssignmentDetail;
  reportId?: string;
  inboxIds?: string[];
  resolveHint?: string;
}

export function waitForAssignment(options: {
  read(): { assignment: AssignmentDetail; reportId: string | undefined };
  subscribe(changed: () => void): () => void;
  begin(): () => void;
  signal: AbortSignal;
  timeoutMs: number;
}): Promise<AssignmentWaitOutcome> {
  options.signal.throwIfAborted();
  if (!Number.isInteger(options.timeoutMs) || options.timeoutMs < 1 || options.timeoutMs > 120000)
    throw new Error('Assignment wait timeout must be an integer between 1 and 120000 ms');
  const initial = options.read();
  if (initial.assignment.activity !== 'working')
    return Promise.resolve({ outcome: 'settled', assignment: initial.assignment });
  return new Promise<AssignmentWaitOutcome>((resolve, reject) => {
    let finished = false;
    let unsubscribe = () => {};
    let release = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = () => {
      unsubscribe();
      release();
      if (timer !== undefined) clearTimeout(timer);
      options.signal.removeEventListener('abort', abort);
    };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const check = (timeout = false) => {
      if (finished) return;
      try {
        const current = options.read();
        const outcome =
          current.reportId !== initial.reportId
            ? 'report'
            : current.assignment.activity !== 'working'
              ? 'settled'
              : timeout
                ? 'timeout'
                : undefined;
        if (outcome === undefined) return;
        finished = true;
        cleanup();
        resolve({
          outcome,
          assignment: current.assignment,
          ...(current.reportId === undefined ? {} : { reportId: current.reportId }),
        });
      } catch (error) {
        fail(error);
      }
    };
    const abort = () => fail(options.signal.reason ?? new Error('Assignment wait cancelled'));
    try {
      unsubscribe = options.subscribe(() => queueMicrotask(() => check()));
      release = options.begin();
      options.signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => check(true), options.timeoutMs);
      if (options.signal.aborted) abort();
      else check();
    } catch (error) {
      fail(error);
    }
  });
}
