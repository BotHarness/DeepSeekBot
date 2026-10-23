import { useLayoutEffect, useRef } from 'react';

import { haptic } from './haptics';

export function useSelectionFeedback<T>(value: T, onChange: (next: T) => void) {
  const activations = useRef(new Map<T, { order: number; pending: boolean }>());
  const nextOrder = useRef(0);
  useLayoutEffect(() => {
    const accepted = activations.current.get(value);
    if (accepted === undefined) return;
    for (const [target, request] of activations.current) {
      if (request.order <= accepted.order) activations.current.delete(target);
    }
    haptic('selection');
  }, [value]);
  return (next: T) => {
    if (value === next || activations.current.get(next)?.pending) return;
    const request = { order: ++nextOrder.current, pending: true };
    activations.current.set(next, request);
    const refuse = () => {
      if (activations.current.get(next) === request) activations.current.delete(next);
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
