import type { EngineTurnLog } from './engine-log.js';
import type { EngineSession, EngineTurnEnd } from './engine-session.js';

export interface SteeringInput {
  text: string;
  requireAccess?(): void;
  settle?(delivered: boolean): void;
  fail?(error: unknown): void;
}

export class EngineSteering {
  readonly #pending: SteeringInput[] = [];
  #deliver: (() => void) | undefined;
  #inputRevision = 0;

  constructor(
    readonly canContinue: () => boolean,
    readonly replaceOnRefusal: boolean,
  ) {}

  get inputRevision(): number {
    return this.#inputRevision;
  }

  offer(text: string): boolean {
    if (!this.canContinue()) return false;
    this.#pending.push({ text });
    this.#deliver?.();
    return true;
  }

  steer(text: string, requireAccess: () => void): boolean | Promise<boolean> {
    if (!this.canContinue() || this.#deliver === undefined) return false;
    return new Promise((settle, fail) => {
      this.#pending.push({ text, requireAccess, settle, fail });
      this.#deliver?.();
    });
  }

  prepareInput(
    firstInput: string,
    updates: readonly SteeringInput[],
    priorReplies?: ReadonlySet<string>,
  ) {
    const valid = updates.filter((update) => {
      try {
        update.requireAccess?.();
        return true;
      } catch (error) {
        update.fail?.(error);
        return false;
      }
    });
    if (updates.length > 0 && valid.length === 0) return undefined;
    const text =
      updates.length === 0 ? firstInput : valid.map((update) => update.text).join('\n\n');
    const input = this.#takeInput(
      priorReplies?.size
        ? `[Host: Replies were already sent for these Source Events. Do not answer them again: ${[...priorReplies].join(', ')}.]\n\n${text}`
        : text,
    );
    return { input, updates: valid };
  }

  #takeInput(input: string): string {
    if (this.#pending.length === 0) return input;
    const updates = this.#pending.splice(0);
    this.#inputRevision += 1;
    return [input, ...updates.map((update) => update.text)].join('\n\n');
  }

  async run<T>(
    send: (updates: readonly SteeringInput[]) => Promise<T>,
    settle: () => void,
  ): Promise<T> {
    let updates: SteeringInput[] = [];
    try {
      while (true) {
        const outcome = await send(updates);
        for (const update of updates) update.settle?.(false);
        updates = this.#pending.splice(0);
        if (updates.length === 0 || !this.canContinue()) return outcome;
        this.#inputRevision += 1;
      }
    } finally {
      for (const update of updates) update.settle?.(false);
      this.discard();
      settle();
    }
  }

  discard(): void {
    for (const update of this.#pending.splice(0)) update.settle?.(false);
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
      const update = this.#pending[0];
      if (delivering !== undefined || signal.aborted || update === undefined) return;
      try {
        update.requireAccess?.();
      } catch (error) {
        this.#pending.shift();
        update.fail?.(error);
        this.#deliver?.();
        return;
      }
      if (engine.steer === undefined) {
        replace();
        return;
      }
      delivering = engine
        .steer(update.text)
        .then((delivered) => {
          if (delivered) {
            this.#pending.shift();
            this.#inputRevision += 1;
            log.input(update.text);
            update.settle?.(true);
          } else if (this.replaceOnRefusal) {
            replace();
          } else {
            this.#pending.shift();
            update.settle?.(false);
          }
        })
        .catch((error: unknown) => {
          if (update.fail !== undefined) {
            if (this.#pending[0] === update) this.#pending.shift();
            update.fail(error);
          } else {
            failure = { error };
            stop.abort();
          }
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
    if (!this.replaceOnRefusal && !replacing) this.discard();
    return { end, failure, replacing };
  }
}
