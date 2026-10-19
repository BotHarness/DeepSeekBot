import { Link, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

export const conversationPeek = Platform.OS === 'ios';

export function ConversationPeek({ href, children }: { href: Href; children: ReactElement }) {
  return (
    <Link href={href} asChild>
      <Link.Trigger>{children}</Link.Trigger>
      <Link.Preview />
    </Link>
  );
}
