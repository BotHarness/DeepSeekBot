import { HeaderActionGroup, HeaderBackButton } from './header-chrome';

export type ChatHeaderAction = {
  icon: 'call' | 'more';
  label: string;
  testID: string;
  onPress(): void;
};

export type ChatHeaderActionsProps =
  | { actions: readonly ChatHeaderAction[] }
  | { back: Omit<ChatHeaderAction, 'icon'> };

export function ChatHeaderActions(props: ChatHeaderActionsProps) {
  return 'back' in props ? (
    <HeaderBackButton onPress={props.back.onPress} />
  ) : (
    <HeaderActionGroup actions={props.actions} />
  );
}
