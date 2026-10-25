import { Link, type Href, type LinkMenuActionProps } from 'expo-router';
import type { ReactElement } from 'react';
import { Platform } from 'react-native';

export const conversationPeek = Platform.OS === 'ios';

export type ConversationPeekAction = {
  key: string;
  label: string;
  icon?: NonNullable<LinkMenuActionProps['icon']>;
  destructive?: boolean;
  run(): void;
};

export function ConversationPeek({
  href,
  children,
  actions = [],
}: {
  href: Href;
  children: ReactElement;
  actions?: readonly ConversationPeekAction[];
}) {
  return (
    <Link href={href} asChild>
      <Link.Trigger>{children}</Link.Trigger>
      <Link.Preview />
      {actions.length > 0 ? (
        <Link.Menu>
          {actions.map((action) => (
            <Link.MenuAction
              key={action.key}
              {...(action.icon ? { icon: action.icon } : {})}
              destructive={action.destructive === true}
              onPress={action.run}
            >
              {action.label}
            </Link.MenuAction>
          ))}
        </Link.Menu>
      ) : null}
    </Link>
  );
}
