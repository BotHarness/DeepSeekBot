import type { RefCallback } from 'react';

const none: RefCallback<unknown> = () => undefined;

export function usePredictiveBack(): RefCallback<unknown> {
  return none;
}
