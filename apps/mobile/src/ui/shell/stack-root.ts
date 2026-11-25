import { createContext, use } from 'react';

export const StackRoot = createContext(false);

export function useStackRoot(): boolean {
  return use(StackRoot);
}

export const TabRoot = createContext(false);

export function useTabRoot(): boolean {
  return use(TabRoot);
}
