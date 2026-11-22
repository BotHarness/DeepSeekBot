import { showAppDialog } from '../primitives/app-dialog';
import type { MenuAction } from '../primitives/action-menu-button';
import { useStrings } from '../strings';
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
  items: readonly MenuAction[];
};

export type ChatHeaderActionsProps =
  | { actions: readonly ChatHeaderAction[] }
  | { menu: ChatHeaderMenu }
  | { back: Omit<ChatHeaderAction, 'icon'> };

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  const t = useStrings();
  if ('menu' in props) {
    const { items, ...trigger } = props.menu;
    return (
      <HeaderActionGroup
        actions={[
          {
            ...trigger,
            icon: 'more',
            onPress: () =>
              showAppDialog(trigger.label, undefined, [
                ...items.map((item) => ({
                  text: item.label,
                  onPress: item.run,
                  ...(item.destructive ? { style: 'destructive' as const } : {}),
                })),
                { text: t.cancel, style: 'cancel' },
              ]),
          },
        ]}
      />
    );
  }
  return 'back' in props ? (
    <HeaderBackButton onPress={props.back.onPress} />
  ) : (
    <HeaderActionGroup actions={props.actions} />
  );
}
