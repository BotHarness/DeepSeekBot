import { createContext, useContext } from 'react';

export const FloatingTabInset = createContext(0);

export function useFloatingTabInset(): number {
  return useContext(FloatingTabInset);
}
