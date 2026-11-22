import { showActionMenu } from '../primitives/app-dialog';
import type { MenuAction } from '../primitives/action-menu-button';
import { HeaderActionGroup, HeaderBackButton } from './header-chrome';

export type ChatHeaderAction = {
  icon: 'call' | 'more';
  label: string;
  testID: string;
  onPress(): void;
};

export type ChatHeaderMenu = {
  label: string;
  testID: string;
  items: readonly (MenuAction & { testID: string; disabled?: boolean })[];
};

export type ChatHeaderControls =
  | { kind: 'actions'; actions: readonly ChatHeaderAction[]; menu?: never }
  | { kind: 'menu'; menu: ChatHeaderMenu; actions?: never };

export type ChatHeaderActionsProps =
  | ChatHeaderControls
  | { kind: 'back'; back: Omit<ChatHeaderAction, 'icon'> };

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  if (props.kind === 'menu') {
    const { items, ...trigger } = props.menu;
    return (
      <HeaderActionGroup
        actions={[
          {
            ...trigger,
            icon: 'more',
            onPress: () =>
              showActionMenu(
                trigger.label,
                items
                  .filter((item) => !item.disabled)
                  .map((item) => ({
                    text: item.label,
                    icon: item.icon,
                    onPress: item.run,
                    ...(item.destructive ? { style: 'destructive' as const } : {}),
                  })),
              ),
          },
        ]}
      />
    );
  }
  return props.kind === 'back' ? (
    <HeaderBackButton onPress={props.back.onPress} />
  ) : (
    <HeaderActionGroup actions={props.actions} />
  );
}
