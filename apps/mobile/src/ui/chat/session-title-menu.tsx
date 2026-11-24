import { showActionMenu } from '../primitives/app-dialog';
import type { ChatHeaderMenu } from './chat-header-actions';
import { ChatTitleCapsule } from './chat-title-capsule';
import { SessionPlaceLine } from './session-place-line';
import { sessionMenuHeader, sessionPlaceLabel, type SessionPlace } from './session-place';

export type SessionTitleMenuProps = {
  title: string;
  pending?: boolean;
  place?: SessionPlace | undefined;
  hint: string;
  menu?: ChatHeaderMenu | undefined;
};

export function SessionTitleMenu({
  title,
  pending = false,
  place,
  hint,
  menu,
}: SessionTitleMenuProps) {
  const subtitle = place === undefined ? undefined : <SessionPlaceLine place={place} />;
  if (menu === undefined)
    return (
      <ChatTitleCapsule
        title={title}
        pending={pending}
        {...(subtitle === undefined ? {} : { subtitle })}
        kind="heading"
        accessibilityLabel={sessionPlaceLabel(title, place)}
        testID="session-header-title"
      />
    );
  return (
    <ChatTitleCapsule
      title={title}
      pending={pending}
      {...(subtitle === undefined ? {} : { subtitle })}
      kind="button"
      accessibilityLabel={sessionPlaceLabel(title, place)}
      accessibilityHint={hint}
      testID="session-header-title"
      onPress={() =>
        showActionMenu(
          sessionMenuHeader(title, place),
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
