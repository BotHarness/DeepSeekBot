import { createContext } from 'react';

export const ChatsPagingContext = createContext<((enabled: boolean) => void) | undefined>(
  undefined,
);

export function chatsListSegments(segments: readonly string[]): boolean {
  const at = segments.indexOf('(home)');
  return at >= 0 && segments.slice(at + 1).every((segment) => segment === 'index');
}
