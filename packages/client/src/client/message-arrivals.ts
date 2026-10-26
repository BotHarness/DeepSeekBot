import { useMemo, useState } from 'react';

const MAX_ANIMATED_ARRIVALS = 3;

export interface MessageArrivals {
  scope: string | undefined;
  seen: Set<string> | undefined;
  fresh: Set<string>;
}

export function trackMessageArrivals(
  state: MessageArrivals,
  scope: string | undefined,
  ids: readonly string[],
  ready: boolean,
): ReadonlySet<string> {
  if (state.scope !== scope) {
    state.scope = scope;
    state.seen = undefined;
    state.fresh = new Set();
  }
  if (state.seen === undefined) {
    if (ready) state.seen = new Set(ids);
    return state.fresh;
  }
  const seen = state.seen;
  const tail = ids.findLastIndex((id) => seen.has(id));
  const arrived = ids.filter((id, index) => index > tail && !seen.has(id));
  ids.forEach((id) => seen.add(id));
  if (arrived.length <= MAX_ANIMATED_ARRIVALS) arrived.forEach((id) => state.fresh.add(id));
  return state.fresh;
}

export function useMessageArrivals(
  scope: string | undefined,
  ids: readonly string[],
  ready: boolean,
): ReadonlySet<string> {
  const [state] = useState<MessageArrivals>(() => ({
    scope,
    seen: undefined,
    fresh: new Set(),
  }));
  return useMemo(() => trackMessageArrivals(state, scope, ids, ready), [state, scope, ids, ready]);
}
