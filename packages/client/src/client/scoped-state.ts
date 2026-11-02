import { useState, type Dispatch, type SetStateAction } from 'react';

type Scope = string | undefined;

export function useScopedState<T>(
  scope: Scope,
  initial: T | (() => T),
): [T, Dispatch<SetStateAction<T>>];
export function useScopedState<T = undefined>(
  scope: Scope,
): [T | undefined, Dispatch<SetStateAction<T | undefined>>];
export function useScopedState<T>(scope: Scope, initial?: T | (() => T)) {
  const fresh = () => ({
    scope,
    generation: {},
    value: typeof initial === 'function' ? (initial as () => T)() : initial,
  });
  const [stored, setStored] = useState(fresh);
  const current = stored.scope === scope ? stored : fresh();
  if (current !== stored) setStored(current);
  const setValue: Dispatch<SetStateAction<T | undefined>> = (next) => {
    setStored((previous) =>
      previous.generation !== current.generation
        ? previous
        : {
            ...previous,
            value:
              typeof next === 'function'
                ? (next as (value: T | undefined) => T | undefined)(previous.value)
                : next,
          },
    );
  };
  return [current.value, setValue] as const;
}

export function useScopedRef<T>(scope: Scope, initial: T): { current: T } {
  return useScopedState(scope, () => ({ current: initial }))[0];
}
