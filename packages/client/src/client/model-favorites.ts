import { useSyncExternalStore } from 'react';

import { modelChoiceKey, type ModelChoice } from '@botharness/host-client/model-catalog';

type Writer = (choice: ModelChoice, favorite: boolean) => Promise<ModelChoice[]>;

interface FavoritesState {
  readonly keys: ReadonlySet<string>;
  readonly order: readonly string[];
  readonly writable: boolean;
}

const EMPTY: FavoritesState = { keys: new Set(), order: [], writable: false };
let state = EMPTY;
let writer: Writer | undefined;
let pending = 0;
const listeners = new Set<() => void>();

function publish(list: readonly ModelChoice[]): void {
  const order = list.map(modelChoiceKey);
  state = { keys: new Set(order), order, writable: writer !== undefined };
  for (const listener of listeners) listener();
}

export function rememberModelFavorites(
  list: readonly ModelChoice[] | undefined,
  write: Writer | undefined,
): void {
  writer = list === undefined ? undefined : write;
  if (pending > 0) return;
  publish(list ?? []);
}

export async function setModelFavorite(choice: ModelChoice, favorite: boolean): Promise<void> {
  const write = writer;
  if (write === undefined) return;
  const key = modelChoiceKey(choice);
  const order = favorite
    ? state.order.includes(key)
      ? state.order
      : [...state.order, key]
    : state.order.filter((entry) => entry !== key);
  const previous = state;
  state = { keys: new Set(order), order, writable: true };
  for (const listener of listeners) listener();
  pending += 1;
  try {
    const next = await write(choice, favorite);
    pending -= 1;
    if (pending === 0) publish(next);
  } catch (error) {
    pending -= 1;
    if (pending === 0) {
      state = previous;
      for (const listener of listeners) listener();
    }
    throw error;
  }
}

export function useModelFavorites(): FavoritesState {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => EMPTY,
  );
}
