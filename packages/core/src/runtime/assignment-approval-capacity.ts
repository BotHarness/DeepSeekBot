export const ASSIGNMENT_APPROVAL_WAIT_LIMIT = 32;

export type AssignmentExecutionWait = 'waiting-human' | 'waiting-capacity';

export interface AssignmentApprovalWaitLease {
  resume(): Promise<void>;
  release(): void;
}

type Execution = {
  sessionId: string;
  released: boolean;
  calls: Map<string, 'human' | 'capacity'>;
  prepared: Set<string>;
  tools: Set<symbol>;
  visibleState?: AssignmentExecutionWait | undefined;
  changedAt: number;
};

type Acquire = {
  execution: Execution;
  signal: AbortSignal;
  resolve(): void;
  reject(error: unknown): void;
  abort(): void;
};

export class AssignmentApprovalCapacity {
  readonly #executions = new Map<string, Execution>();
  readonly #acquires = new Set<Acquire>();
  readonly #valid: (sessionId: string) => boolean;
  readonly #available: () => boolean;
  readonly #releaseAllowed: (sessionId: string) => boolean;
  readonly #changed: (
    sessionId: string,
    state: AssignmentExecutionWait | undefined,
    durationMs: number,
  ) => void;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #closed = false;

  constructor(options: {
    valid(sessionId: string): boolean;
    available(): boolean;
    releaseAllowed?(sessionId: string): boolean;
    changed(
      sessionId: string,
      state: AssignmentExecutionWait | undefined,
      durationMs: number,
    ): void;
  }) {
    this.#valid = options.valid;
    this.#available = options.available;
    this.#releaseAllowed = options.releaseAllowed ?? (() => true);
    this.#changed = options.changed;
  }

  begin(sessionId: string, callId: string, signal: AbortSignal): AssignmentApprovalWaitLease {
    this.#requireValid(sessionId, signal);
    const execution = this.#execution(sessionId);
    if (execution.calls.has(callId) || execution.prepared.has(callId))
      throw new Error('Assignment approval already owns this call');
    const waiting = [...this.#executions.values()].filter(
      (entry) => entry.released || entry.calls.size > 0,
    ).length;
    if (
      !execution.released &&
      execution.calls.size === 0 &&
      waiting >= ASSIGNMENT_APPROVAL_WAIT_LIMIT
    )
      throw new Error('Assignment approval waiting capacity reached');
    execution.calls.set(callId, 'human');
    this.#releaseIfQuiescent(execution);
    let closed = false;
    return {
      resume: async () => {
        if (closed || !execution.calls.has(callId))
          throw new Error('Assignment approval wait is no longer live');
        execution.calls.set(callId, 'capacity');
        this.#notify(execution);
        do {
          await this.#acquire(execution, signal);
        } while (execution.released);
        this.#requireExecution(execution, signal);
        if (closed || !execution.calls.has(callId))
          throw new Error('Assignment approval wait was cancelled');
        execution.prepared.add(callId);
      },
      release: () => {
        if (closed) return;
        closed = true;
        execution.calls.delete(callId);
        this.#releaseIfQuiescent(execution);
      },
    };
  }

  state(sessionId: string): AssignmentExecutionWait | undefined {
    const execution = this.#executions.get(sessionId);
    if (!execution?.released) return undefined;
    return execution.calls.size === 0 ||
      [...execution.calls.values()].includes('capacity') ||
      [...this.#acquires].some((acquire) => acquire.execution === execution)
      ? 'waiting-capacity'
      : 'waiting-human';
  }

  released(sessionId: string): boolean {
    return this.#executions.get(sessionId)?.released === true;
  }

  stateForCall(sessionId: string, callId: string): AssignmentExecutionWait | undefined {
    return this.#executions.get(sessionId)?.calls.has(callId) ? this.state(sessionId) : undefined;
  }

  async ensure(sessionId: string, signal: AbortSignal): Promise<void> {
    const execution = this.#executions.get(sessionId);
    if (execution === undefined) return;
    do {
      await this.#acquire(execution, signal);
    } while (execution.released);
    this.#requireExecution(execution, signal);
  }

  async execute<T>(
    sessionId: string,
    callId: string,
    token: symbol,
    signal: AbortSignal,
    body: () => Promise<T>,
  ): Promise<T> {
    this.#requireValid(sessionId, signal);
    const execution = this.#execution(sessionId);
    do {
      await this.#acquire(execution, signal);
    } while (execution.released);
    this.#requireExecution(execution, signal);
    execution.prepared.delete(callId);
    execution.tools.add(token);
    try {
      return await body();
    } finally {
      execution.tools.delete(token);
      this.#releaseIfQuiescent(execution);
    }
  }

  settledTool(sessionId: string, callId: string): void {
    const execution = this.#executions.get(sessionId);
    if (execution === undefined) return;
    execution.prepared.delete(callId);
    this.#releaseIfQuiescent(execution);
  }

  changed(): void {
    for (const acquire of [...this.#acquires]) {
      try {
        this.#requireExecution(acquire.execution, acquire.signal);
        if (acquire.execution.released && !this.#available()) continue;
        acquire.execution.released = false;
        this.#removeAcquire(acquire);
        this.#notify(acquire.execution);
        acquire.resolve();
      } catch (error) {
        this.#removeAcquire(acquire);
        acquire.reject(error);
      }
    }
    if (this.#acquires.size > 0 && this.#timer === undefined) {
      this.#timer = setTimeout(() => {
        this.#timer = undefined;
        this.changed();
      }, 100);
      this.#timer.unref();
    } else if (this.#acquires.size === 0 && this.#timer !== undefined) {
      clearTimeout(this.#timer);
      this.#timer = undefined;
    }
  }

  forget(sessionId: string): void {
    for (const acquire of [...this.#acquires]) {
      if (acquire.execution.sessionId !== sessionId) continue;
      this.#removeAcquire(acquire);
      acquire.reject(new Error('Assignment execution ended before capacity was reacquired'));
    }
    this.#executions.delete(sessionId);
    this.changed();
  }

  close(): void {
    this.#closed = true;
    for (const sessionId of [...this.#executions.keys()]) this.forget(sessionId);
    clearTimeout(this.#timer);
    this.#timer = undefined;
  }

  #execution(sessionId: string): Execution {
    let execution = this.#executions.get(sessionId);
    if (execution === undefined) {
      execution = {
        sessionId,
        released: false,
        calls: new Map(),
        prepared: new Set(),
        tools: new Set(),
        changedAt: Date.now(),
      };
      this.#executions.set(sessionId, execution);
    }
    return execution;
  }

  #requireValid(sessionId: string, signal: AbortSignal): void {
    signal.throwIfAborted();
    if (this.#closed || !this.#valid(sessionId))
      throw new Error('Assignment approval execution authority is unavailable');
  }

  #requireExecution(execution: Execution, signal: AbortSignal): void {
    this.#requireValid(execution.sessionId, signal);
    if (this.#executions.get(execution.sessionId) !== execution)
      throw new Error('Assignment execution ended before capacity was reacquired');
  }

  #notify(execution: Execution): void {
    const state = this.state(execution.sessionId);
    if (state === execution.visibleState) return;
    const now = Date.now();
    const durationMs = Math.max(0, now - execution.changedAt);
    execution.changedAt = now;
    execution.visibleState = state;
    this.#changed(execution.sessionId, state, durationMs);
  }

  #releaseIfQuiescent(execution: Execution): void {
    if (this.#executions.get(execution.sessionId) !== execution) return;
    if (
      execution.calls.size > 0 &&
      execution.tools.size === 0 &&
      execution.prepared.size === 0 &&
      this.#releaseAllowed(execution.sessionId)
    )
      execution.released = true;
    this.#notify(execution);
    this.changed();
  }

  #acquire(execution: Execution, signal: AbortSignal): Promise<void> {
    this.#requireExecution(execution, signal);
    if (!execution.released) return Promise.resolve();
    if (this.#available()) {
      execution.released = false;
      this.#notify(execution);
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const acquire: Acquire = {
        execution,
        signal,
        resolve,
        reject,
        abort: () => {
          this.#removeAcquire(acquire);
          reject(
            signal.reason instanceof Error
              ? signal.reason
              : new Error('Assignment capacity wait cancelled', { cause: signal.reason }),
          );
          this.changed();
        },
      };
      this.#acquires.add(acquire);
      signal.addEventListener('abort', acquire.abort, { once: true });
      if (signal.aborted) acquire.abort();
      else {
        this.#notify(execution);
        this.changed();
      }
    });
  }

  #removeAcquire(acquire: Acquire): void {
    this.#acquires.delete(acquire);
    acquire.signal.removeEventListener('abort', acquire.abort);
  }
}
