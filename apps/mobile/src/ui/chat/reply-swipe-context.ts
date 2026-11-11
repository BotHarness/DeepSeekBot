import { createContext, type ComponentType, type ReactNode } from 'react';

export type SwipeBlocker = ComponentType<{ children: ReactNode; blocking: boolean }>;

export const ReplySwipeBlocker = createContext<SwipeBlocker | undefined>(undefined);
