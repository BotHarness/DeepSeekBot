import type { OutboxState } from '../../../core/src/messaging/outbound.js';

export interface ReachablePostRequest {
  id: string;
  group: string;
  text: string;
  state: OutboxState | 'response-lost';
  reason?: string;
}

const unsettled = (state: ReachablePostRequest['state']) =>
  ['pending', 'in-flight', 'unknown-outcome', 'response-lost'].includes(state);
const states = new Set([
  'pending',
  'in-flight',
  'unknown-outcome',
  'response-lost',
  'provider-accepted',
  'failed',
  'cancelled',
  'grant-revoked',
]);

export class ReachablePostRequests {
  readonly #key: string;
  readonly #storage: Storage | undefined;
  readonly #listeners = new Set<() => void>();
  #requests: ReachablePostRequest[] = [];
  #failed = false;

  constructor(scope: string, storage: Storage | undefined) {
    this.#key = `botharness.reachable-post.v1:${scope}`;
    this.#storage = storage;
    try {
      if (!storage) throw new Error('Post recovery storage is unavailable');
      const raw = storage.getItem(this.#key);
      if (raw === null) return;
      const saved: unknown = JSON.parse(raw);
      if (!Array.isArray(saved) || saved.length > 50) throw new Error('Invalid post recovery');
      this.#requests = saved.map((value) => {
        if (
          !value ||
          typeof value !== 'object' ||
          typeof value.id !== 'string' ||
          value.id.length < 8 ||
          value.id.length > 128 ||
          typeof value.group !== 'string' ||
          !value.group ||
          value.group.length > 512 ||
          typeof value.text !== 'string' ||
          !value.text.trim() ||
          value.text.length > 4000 ||
          !states.has(value.state) ||
          (value.reason !== undefined &&
            (typeof value.reason !== 'string' || value.reason.length > 128))
        )
          throw new Error('Invalid post recovery');
        return {
          id: value.id,
          group: value.group,
          text: value.text.trim(),
          state:
            value.state === 'pending' || value.state === 'in-flight'
              ? 'response-lost'
              : value.state,
          ...(value.reason === undefined ? {} : { reason: value.reason }),
        };
      });
    } catch {
      this.#failed = true;
    }
  }

  subscribe = (listener: () => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  get failed(): boolean {
    return this.#failed;
  }
  get last(): ReachablePostRequest | undefined {
    return this.#requests.at(-1);
  }
  read(group: string, text: string): ReachablePostRequest | undefined {
    return this.#requests.findLast((value) => value.group === group && value.text === text.trim());
  }

  #write(request: ReachablePostRequest, required = false): void {
    const values = [...this.#requests];
    const index = values.findIndex((value) => value.id === request.id);
    if (index >= 0) values[index] = request;
    else values.push(request);
    while (values.length > 50) {
      const settled = values.findIndex((value) => !unsettled(value.state));
      if (settled < 0) throw new Error('Post recovery is full; inspect Outbox');
      values.splice(settled, 1);
    }
    this.#requests = values;
    try {
      if (!this.#storage) throw new Error('Post recovery storage is unavailable');
      this.#storage.setItem(this.#key, JSON.stringify(values));
    } catch {
      this.#failed = true;
    }
    for (const listener of this.#listeners) listener();
    if (required && this.#failed) throw new Error('Post recovery is unavailable; inspect Outbox');
  }

  begin(group: string, text: string): ReachablePostRequest {
    if (this.#failed) throw new Error('Post recovery is unavailable; inspect Outbox');
    const previous = this.read(group, text);
    if (previous?.state === 'unknown-outcome') throw new Error('Unknown post must not be resent');
    const request: ReachablePostRequest = {
      id: previous && unsettled(previous.state) ? previous.id : crypto.randomUUID(),
      group,
      text: text.trim(),
      state: 'pending',
    };
    this.#write(request, true);
    return request;
  }

  finish(
    request: ReachablePostRequest,
    state: ReachablePostRequest['state'],
    reason?: string,
  ): void {
    const previous = this.#requests.find((value) => value.id === request.id);
    if (previous && (!unsettled(previous.state) || previous.state === 'unknown-outcome')) return;
    this.#write({ ...request, state, ...(reason === undefined ? {} : { reason }) });
  }
}

const stores = new Map<string, ReachablePostRequests>();
export function reachablePostRequests(scope: string | undefined): ReachablePostRequests {
  if (scope === undefined) return unavailable;
  let store = stores.get(scope);
  if (!store) {
    let storage: Storage | undefined;
    try {
      storage = sessionStorage;
    } catch {
      storage = undefined;
    }
    store = new ReachablePostRequests(scope, storage);
    stores.set(scope, store);
  }
  return store;
}
const unavailable = new ReachablePostRequests('unavailable', undefined);
