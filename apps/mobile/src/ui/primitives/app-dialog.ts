import { ActionSheetIOS, Alert, Keyboard, Platform } from 'react-native';

import { appDialogs, type DialogAction } from './dialog-state';
import { t } from '../strings';

export function showAppDialog(
  title: string,
  message: string | undefined,
  actions: readonly DialogAction[],
): void {
  if (Platform.OS === 'android') {
    Keyboard.dismiss();
    appDialogs.open(title, message, actions);
    return;
  }
  Alert.alert(
    title,
    message,
    actions.map(({ onPress, text, style }) => ({
      text,
      ...(style === undefined ? {} : { style }),
      ...(onPress === undefined
        ? {}
        : {
            onPress: () => {
              void Promise.resolve(onPress()).catch(() => undefined);
            },
          }),
    })),
  );
}

export function confirmDestructive(
  title: string,
  message: string | undefined,
  action: string,
  onConfirm: () => unknown,
): void {
  showAppDialog(title, message, [
    { text: t.cancel, style: 'cancel' },
    { text: action, style: 'destructive', onPress: onConfirm },
  ]);
}

export function showActionMenu(title: string, actions: readonly DialogAction[]): void {
  const ordered = [
    ...actions.filter((action) => action.style !== 'destructive'),
    ...actions.filter((action) => action.style === 'destructive'),
  ];
  if (Platform.OS === 'ios') {
    const destructive = ordered.findIndex((action) => action.style === 'destructive');
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...ordered.map((action) => action.text), t.cancel],
        ...(destructive === -1 ? {} : { destructiveButtonIndex: destructive }),
        cancelButtonIndex: ordered.length,
      },
      (index) => {
        const onPress = ordered[index]?.onPress;
        if (onPress) void Promise.resolve(onPress()).catch(() => undefined);
      },
    );
    return;
  }
  showAppDialog(title, undefined, [{ text: t.cancel, style: 'cancel' }, ...ordered]);
}
