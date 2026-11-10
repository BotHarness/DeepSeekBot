import type { ViewInstance } from 'react-native';

export function measureMessageView(
  view: ViewInstance | null,
  callback: (x: number, y: number, width: number, height: number) => void,
) {
  view?.measureInWindow(callback);
}
