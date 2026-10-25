import { Link, type Href } from 'expo-router';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';
import type { ItemMenuAction } from '../primitives/item-menu';

export const conversationPeek = Platform.OS === 'ios';

export function ConversationPeek({
  href,
  children,
  actions = [],
}: {
  href: Href;
  children: ReactElement;
  actions?: readonly ItemMenuAction[];
}) {
  return (
    <Link href={href} asChild>
      <Link.Trigger>{children}</Link.Trigger>
      <Link.Preview />
      <Link.Menu>
        {actions.map((action) => (
          <Link.MenuAction
            key={action.key}
            destructive={action.destructive === true}
            onPress={action.run}
          >
            {action.label}
          </Link.MenuAction>
        ))}
      </Link.Menu>
    </Link>
  );
}
