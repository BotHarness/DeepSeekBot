import { useMemo, useState } from 'react';

export type Arrivals = { seen: Set<string> | undefined; fresh: Set<string> };

export function trackArrivals(state: Arrivals, keys: readonly string[], ready: boolean) {
  if (state.seen === undefined) {
    if (ready) state.seen = new Set(keys);
    return state.fresh;
  }
  const seen = state.seen;
  const tail = keys.findLastIndex((key) => seen.has(key));
  keys.forEach((key, index) => {
    if (seen.has(key)) return;
    seen.add(key);
    if (index > tail) state.fresh.add(key);
  });
  return state.fresh;
}

export function useArrivals(keys: readonly string[], ready: boolean) {
  const [state] = useState<Arrivals>(() => ({ seen: undefined, fresh: new Set() }));
  return useMemo(() => trackArrivals(state, keys, ready), [state, keys, ready]);
}
