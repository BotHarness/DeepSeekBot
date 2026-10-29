import { Pressable } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { radius } from '../design/tokens';
import { CheckIcon } from '../shell/icons';
import type { CreationConfirmProps } from './creation-confirm';

export type SheetSaveButtonProps = CreationConfirmProps;

export function SheetSaveButton(props: SheetSaveButtonProps) {
  const theme = useDesignTheme();
  return (
    <Pressable
      testID={props.testID}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: props.disabled || props.busy, busy: props.busy }}
      disabled={props.disabled || props.busy}
      onPress={props.onPress}
      style={{
        width: theme.touch,
        height: theme.touch,
        borderRadius: radius.round,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: theme.color.accent,
      }}
    >
      <CheckIcon color={theme.color.onAccent} size={theme.type.title.line} />
    </Pressable>
  );
}
