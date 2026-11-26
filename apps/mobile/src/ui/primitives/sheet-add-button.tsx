import { Pressable } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { PlusIcon } from '../shell/icons';
import type { MenuAction } from './action-menu-button';

export type SheetAddButtonProps = {
  label: string;
  actions: MenuAction[];
  testID?: string;
};

export function SheetAddButton({ label, actions, testID }: SheetAddButtonProps) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => actions[0]?.run()}
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.accent,
      }}
    >
      <PlusIcon color={theme.color.onAccent} size={theme.type.title.line} />
    </Pressable>
  );
}
