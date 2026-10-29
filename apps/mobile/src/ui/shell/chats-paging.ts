import { createContext } from 'react';

export const ChatsPagingContext = createContext<((enabled: boolean) => void) | undefined>(
  undefined,
);
