import { useSyncExternalStore } from 'react';

import {
  applyModelFavoriteChanges,
  modelChoiceKey,
  serialWrites,
  type ModelChoice,
  type ModelFavoriteChange,
} from '@botharness/host-client/model-catalog';

type Writer = (choice: ModelChoice, favorite: boolean) => Promise<ModelChoice[]>;

interface FavoritesState {
  readonly keys: ReadonlySet<string>;
  readonly order: readonly string[];
  readonly writable: boolean;
}

interface Registration {
  readonly owner: unknown;
  write: Writer;
  readonly queue: Writer;
  confirmed: readonly ModelChoice[];
  changes: readonly ModelFavoriteChange[];
  lastWrite: number;
}

const EMPTY: FavoritesState = { keys: new Set(), order: [], writable: false };
let state = EMPTY;
let current: Registration | undefined;
let epoch = 0;
const listeners = new Set<() => void>();

function publish(): void {
  const registration = current;
  if (registration === undefined) state = EMPTY;
  else {
    const order = applyModelFavoriteChanges(registration.confirmed, registration.changes).map(
      modelChoiceKey,
    );
    state = { keys: new Set(order), order, writable: true };
  }
  for (const listener of listeners) listener();
}

export function modelFavoritesEpoch(): number {
  return epoch;
}

export function rememberModelFavorites(
  list: readonly ModelChoice[] | undefined,
  owner?: unknown,
  write?: Writer,
  seen: number = epoch,
): void {
  if (list === undefined || write === undefined) {
    current = undefined;
    publish();
    return;
  }
  const registration = current;
  if (registration !== undefined && registration.owner === owner) {
    registration.write = write;
    if (registration.changes.length > 0 || seen < registration.lastWrite) return;
    registration.confirmed = list;
    publish();
    return;
  }
  const next: Registration = {
    owner,
    write,
    queue: serialWrites((choice: ModelChoice, favorite: boolean) => next.write(choice, favorite)),
    confirmed: list,
    changes: [],
    lastWrite: -1,
  };
  current = next;
  publish();
}

export async function setModelFavorite(choice: ModelChoice, favorite: boolean): Promise<void> {
  const registration = current;
  if (registration === undefined) return;
  const change: ModelFavoriteChange = { choice, favorite };
  epoch += 1;
  registration.lastWrite = epoch;
  registration.changes = [...registration.changes, change];
  publish();
  try {
    registration.confirmed = await registration.queue(choice, favorite);
  } finally {
    registration.changes = registration.changes.filter((entry) => entry !== change);
    if (current === registration) publish();
  }
}

export function modelFavoritesSnapshot(): FavoritesState {
  return state;
}

export function useModelFavorites(): FavoritesState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    modelFavoritesSnapshot,
    () => EMPTY,
  );
}
