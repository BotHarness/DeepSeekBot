import { showActionMenu } from '../primitives/app-dialog';
import type { ChatHeaderMenu } from './chat-header-actions';
import { ChatTitleCapsule } from './chat-title-capsule';

export type SessionTitleMenuProps = {
  title: string;
  pending?: boolean;
  hint: string;
  menu?: ChatHeaderMenu | undefined;
};

export function SessionTitleMenu({ title, pending = false, hint, menu }: SessionTitleMenuProps) {
  if (menu === undefined)
    return (
      <ChatTitleCapsule
        title={title}
        pending={pending}
        kind="heading"
        accessibilityLabel={title}
        testID="session-header-title"
      />
    );
  return (
    <ChatTitleCapsule
      title={title}
      pending={pending}
      kind="button"
      accessibilityLabel={title}
      accessibilityHint={hint}
      testID="session-header-title"
      onPress={() =>
        showActionMenu(
          title,
          menu.items
            .filter((item) => !item.disabled)
            .map((item) => ({
              text: item.label,
              icon: item.icon,
              onPress: item.run,
              ...(item.destructive ? { style: 'destructive' as const } : {}),
            })),
        )
      }
    />
  );
}
