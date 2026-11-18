import type { EngineTurnLog } from './engine-log.js';
import type { EngineSession, EngineTurnEnd } from './engine-session.js';

export class AssignmentSteering {
  readonly #pending: string[] = [];
  #deliver: (() => void) | undefined;
  #inputRevision = 0;

  constructor(readonly canContinue: () => boolean) {}

  get inputRevision(): number {
    return this.#inputRevision;
  }

  offer(text: string): boolean {
    if (!this.canContinue()) return false;
    this.#pending.push(text);
    this.#deliver?.();
    return true;
  }

  takeInput(input: string): string {
    const next = this.#takeNext();
    if (next === undefined) return input;
    this.#inputRevision += 1;
    return `${input}\n\n${next}`;
  }

  async run<T>(
    input: string,
    send: (text: string, continuation: boolean) => Promise<T>,
    settle: () => void,
  ): Promise<T> {
    try {
      let next = input;
      let continuation = false;
      while (true) {
        const outcome = await send(next, continuation);
        const update = this.#takeNext();
        if (update === undefined || !this.canContinue()) return outcome;
        next = update;
        continuation = true;
        this.#inputRevision += 1;
      }
    } finally {
      settle();
    }
  }

  #takeNext(): string | undefined {
    if (this.#pending.length > 0) return this.#pending.splice(0).join('\n\n');
  }

  discard(): void {
    this.#pending.length = 0;
  }

  async duringTurn({
    sending,
    engine,
    signal,
    stop,
    log,
  }: {
    sending: Promise<EngineTurnEnd>;
    engine: EngineSession;
    signal: AbortSignal;
    stop: AbortController;
    log: EngineTurnLog;
  }) {
    let delivering: Promise<void> | undefined;
    let failure: { error: unknown } | undefined;
    let replacing = false;
    const replace = () => {
      replacing = true;
      stop.abort();
    };
    this.#deliver = () => {
      const text = this.#pending[0];
      if (delivering !== undefined || signal.aborted || text === undefined) return;
      if (engine.steer === undefined) {
        replace();
        return;
      }
      delivering = engine
        .steer(text)
        .then((delivered) => {
          if (delivered) {
            this.#pending.shift();
            this.#inputRevision += 1;
            log.input(text);
          } else replace();
        })
        .catch((error: unknown) => {
          failure = { error };
          stop.abort();
        })
        .finally(() => {
          delivering = undefined;
          this.#deliver?.();
        });
    };
    let end: EngineTurnEnd;
    try {
      this.#deliver();
      end = await sending;
    } finally {
      this.#deliver = undefined;
    }
    if (delivering !== undefined) await delivering;
    return { end, failure, replacing };
  }
}
