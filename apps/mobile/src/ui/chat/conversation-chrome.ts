import { createContext, use, type ReactElement } from 'react';

export type ConversationChrome = {
  close(): void;
  closeLabel: string;
  trailing?: ReactElement;
};

export const ConversationChromeContext = createContext<ConversationChrome | undefined>(undefined);

export function useConversationChrome(): ConversationChrome | undefined {
  return use(ConversationChromeContext);
}
