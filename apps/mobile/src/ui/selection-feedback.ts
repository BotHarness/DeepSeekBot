import { useLayoutEffect, useRef } from 'react';

import { haptic } from './haptics';

type Activation<T> = { target: T; order: number; pending: boolean };

export function useSelectionFeedback<T>(value: T, onChange: (next: T) => void) {
  const activations = useRef(new Map<T, Activation<T>>());
  const latest = useRef<Activation<T> | undefined>(undefined);
  const nextOrder = useRef(0);
  useLayoutEffect(() => {
    const accepted = activations.current.get(value);
    if (accepted === undefined) return;
    for (const [target, request] of activations.current) {
      if (request.order <= accepted.order) activations.current.delete(target);
    }
    if (latest.current !== undefined && latest.current.order <= accepted.order)
      latest.current = undefined;
    haptic('selection');
  }, [value]);
  return (next: T) => {
    if (value === next && (latest.current === undefined || latest.current.target === next)) return;
    if (latest.current?.target === next && latest.current.pending) return;
    const request = { target: next, order: ++nextOrder.current, pending: true };
    latest.current = request;
    activations.current.set(next, request);
    const refuse = () => {
      if (activations.current.get(next) === request) activations.current.delete(next);
      if (latest.current === request) {
        latest.current = undefined;
        for (const previous of activations.current.values())
          if (latest.current === undefined || previous.order > latest.current.order)
            latest.current = previous;
      }
    };
    try {
      void Promise.resolve(onChange(next)).then(() => {
        request.pending = false;
      }, refuse);
    } catch (error) {
      refuse();
      throw error;
    }
  };
}
