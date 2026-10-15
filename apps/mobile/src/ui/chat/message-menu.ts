import * as Clipboard from 'expo-clipboard';
import { ActionSheetIOS, Platform, Share, ToastAndroid } from 'react-native';

import { t } from '../strings';

export function copyMessage(text: string): void {
  void Clipboard.setStringAsync(text).then(
    () => {
      if (Platform.OS === 'android') ToastAndroid.show(t.copied, ToastAndroid.SHORT);
    },
    () => undefined,
  );
}

export function shareText(text: string): void {
  void Share.share({ message: text }).catch(() => undefined);
}

export function openMessageMenu(text: string): void {
  if (Platform.OS !== 'ios') {
    copyMessage(text);
    return;
  }
  ActionSheetIOS.showActionSheetWithOptions(
    { options: [t.copy, t.cancel], cancelButtonIndex: 1 },
    (index) => {
      if (index === 0) copyMessage(text);
    },
  );
}
