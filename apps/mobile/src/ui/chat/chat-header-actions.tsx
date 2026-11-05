import { HeaderActionGroup } from './header-chrome';

export type ChatHeaderAction = {
  icon: 'call' | 'more';
  label: string;
  testID: string;
  onPress(): void;
};

export type ChatHeaderActionsProps = { actions: readonly ChatHeaderAction[] };

export function ChatHeaderActions({ actions }: ChatHeaderActionsProps) {
  return <HeaderActionGroup actions={actions} />;
}
