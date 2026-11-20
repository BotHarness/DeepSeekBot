import { createElement } from 'react';

export type WebViewMessageEvent = { nativeEvent: { data: string } };

export function WebView(props: Record<string, unknown>) {
  return createElement('WebView', props);
}
