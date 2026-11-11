import { createContext, type ComponentType, type ReactNode } from 'react';

export type SwipeBlocker = ComponentType<{ children: ReactNode }>;

export const ReplySwipeBlocker = createContext<SwipeBlocker | undefined>(undefined);
