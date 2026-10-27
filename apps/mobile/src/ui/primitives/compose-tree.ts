import { createContext, useContext } from 'react';

export type ComposeTree = { fill: boolean };

export const ComposeTreeContext = createContext<ComposeTree | undefined>(undefined);

export function useComposeTree(): ComposeTree | undefined {
  return useContext(ComposeTreeContext);
}
