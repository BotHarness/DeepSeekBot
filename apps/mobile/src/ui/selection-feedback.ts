import { useLayoutEffect, useRef } from 'react';

import { haptic } from './haptics';

export function useSelectionFeedback<T>(value: T, onChange: (next: T) => void) {
  const activations = useRef(new Map<T, { pending: boolean }>());
  useLayoutEffect(() => {
    if (activations.current.delete(value)) haptic('selection');
  }, [value]);
  return (next: T) => {
    if (value === next || activations.current.get(next)?.pending) return;
    const request = { pending: true };
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
