import { Keyboard } from 'react-native';

export function pressLink(open: (url: string) => void, url: string) {
  if (Keyboard.isVisible()) {
    Keyboard.dismiss();
    return;
  }
  open(url);
}
