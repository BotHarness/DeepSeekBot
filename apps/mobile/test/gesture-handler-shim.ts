import { Fragment, createElement, type ReactNode } from 'react';

const chain: Record<string, unknown> = new Proxy(
  {},
  { get: (_target, key) => (key === 'then' ? undefined : () => chain) },
);

export const Gesture = new Proxy({}, { get: () => () => chain });
export const GestureDetector = ({ children }: { children?: ReactNode }) =>
  createElement(Fragment, null, children);
export const GestureHandlerRootView = ({ children }: { children?: ReactNode }) =>
  createElement(Fragment, null, children);
