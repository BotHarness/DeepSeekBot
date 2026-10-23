import { AlertDialog, Host, RNHostView, Text, TextButton } from '@expo/ui/jetpack-compose';
import { height, fillMaxWidth, testID } from '@expo/ui/jetpack-compose/modifiers';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useDesignTheme } from '../design/theme';
import { formDialog } from '../design/tokens';
import { t } from '../strings';
import type { CreationFormProps } from './creation-form';

export function CreationForm({
  title,
  children,
  onDismiss,
  dismissLabel = t.cancel,
  action,
  nativeDialog = true,
}: CreationFormProps) {
  const theme = useDesignTheme();
  const window = useWindowDimensions();
  if (!nativeDialog) return <View style={{ flex: 1 }}>{children}</View>;
  return (
    <Host
      colorScheme={theme.scheme}
      seedColor={theme.color.accent}
      style={StyleSheet.absoluteFill}
      pointerEvents="box-none"
    >
      <AlertDialog onDismissRequest={onDismiss} modifiers={[testID('creation-form-dialog')]}>
        <AlertDialog.Title>
          <Text>{title}</Text>
        </AlertDialog.Title>
        <AlertDialog.Text>
          <RNHostView
            modifiers={[fillMaxWidth(), height(window.height * formDialog.contentHeightFraction)]}
          >
            <View style={{ flex: 1 }}>{children}</View>
          </RNHostView>
        </AlertDialog.Text>
        <AlertDialog.DismissButton>
          <TextButton onClick={onDismiss}>
            <Text>{dismissLabel}</Text>
          </TextButton>
        </AlertDialog.DismissButton>
        {action ? (
          <AlertDialog.ConfirmButton>
            <TextButton
              enabled={!action.disabled}
              onClick={action.onPress}
              modifiers={[testID(action.testID ?? 'creation-form-submit')]}
            >
              <Text>{action.label}</Text>
            </TextButton>
          </AlertDialog.ConfirmButton>
        ) : null}
      </AlertDialog>
    </Host>
  );
}
