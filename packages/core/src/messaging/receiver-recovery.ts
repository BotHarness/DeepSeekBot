export type ReceptionRecovery =
  | {
      kind: 'retrying';
      reason: 'provider-unavailable';
      attempt: number;
      nextRetryAt: string;
    }
  | { kind: 'action-required'; reason: string };

interface RecoveryEntry {
  owner: object;
  state: ReceptionRecovery;
  timer?: ReturnType<typeof setTimeout>;
}

export class ReceiverRecovery {
  readonly #entries = new Map<string, RecoveryEntry>();

  constructor(private readonly changed: () => void) {}

  state(id: string): ReceptionRecovery | undefined {
    return this.#entries.get(id)?.state;
  }

  pending(id: string): boolean {
    return this.state(id)?.kind === 'retrying';
  }

  clear(id: string): void {
    const entry = this.#entries.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    this.#entries.delete(id);
    this.changed();
  }

  clearOwner(owner: object): void {
    for (const [id, entry] of this.#entries) if (entry.owner === owner) this.clear(id);
  }

  close(): void {
    for (const id of this.#entries.keys()) this.clear(id);
  }

  fail(
    id: string,
    owner: object,
    reason: string,
    attempt: number,
    retry: () => void,
  ): ReceptionRecovery {
    this.clear(id);
    if (reason !== 'provider-unavailable') {
      const state: ReceptionRecovery = { kind: 'action-required', reason };
      this.#entries.set(id, { owner, state });
      this.changed();
      return state;
    }
    const delay = Math.min(30_000, 250 * 2 ** Math.min(attempt, 7));
    const state: ReceptionRecovery = {
      kind: 'retrying',
      reason,
      attempt: attempt + 1,
      nextRetryAt: new Date(Date.now() + delay).toISOString(),
    };
    const entry: RecoveryEntry = { owner, state };
    entry.timer = setTimeout(() => {
      if (this.#entries.get(id) !== entry) return;
      this.#entries.delete(id);
      this.changed();
      retry();
    }, delay);
    entry.timer.unref();
    this.#entries.set(id, entry);
    this.changed();
    return state;
  }
}
