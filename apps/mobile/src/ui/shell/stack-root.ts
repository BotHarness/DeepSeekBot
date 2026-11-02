import { createContext, use } from 'react';

export const StackRoot = createContext(false);

export function useStackRoot(): boolean {
  return use(StackRoot);
}
