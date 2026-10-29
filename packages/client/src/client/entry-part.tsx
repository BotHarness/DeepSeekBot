import { memo, useRef, type ComponentType, type ReactElement } from 'react';
import { shallowEqual } from '@deepseek-ai/dsh-client-store';

type Callback = (...args: never[]) => unknown;

const CALLBACK = /^(on|set|request)[A-Z]/;

export function useStableProps<P extends object | undefined>(props: P): P {
  const latest = useRef(props);
  latest.current = props;
  const callbacks = useRef(new Map<string, Callback>());
  const previous = useRef<P>();
  if (props === undefined) {
    previous.current = props;
    return props;
  }
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(props)) {
    if (typeof value !== 'function' || !CALLBACK.test(key)) {
      next[key] = value;
      continue;
    }
    let callback = callbacks.current.get(key);
    if (callback === undefined) {
      callback = (...args: never[]) =>
        (latest.current as Record<string, Callback | undefined> | undefined)?.[key]?.(...args);
      callbacks.current.set(key, callback);
    }
    next[key] = callback;
  }
  if (previous.current !== undefined && shallowEqual(previous.current, next))
    return previous.current;
  previous.current = next as P;
  return next as P;
}

export const EntryPart = memo(function EntryPart<P extends object>({
  part: Part,
  props,
}: {
  part: ComponentType<P>;
  props: P;
}): ReactElement {
  return <Part {...props} />;
}) as <P extends object>(props: {
  part: ComponentType<P>;
  props: P;
  key?: string | undefined;
}) => ReactElement;
