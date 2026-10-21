import type { Ref } from 'react';
import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

import { staysInFullClient, type FullClientSource } from '../host/full-client';

export type FullClientWeb = { goBack(): void };

export interface FullClientViewProps {
  route: string;
  source: FullClientSource;
  onLoaded(): void;
  onFailed(kind: 'refused' | 'unreachable'): void;
  onCanGoBack?(canGoBack: boolean): void;
  ref?: Ref<FullClientWeb>;
}

export function FullClientView({
  route,
  source,
  onLoaded,
  onFailed,
  onCanGoBack,
  ref,
}: FullClientViewProps) {
  return (
    <WebView
      {...({ ref } as object)}
      source={source}
      sharedCookiesEnabled={false}
      originWhitelist={['https://*', 'http://*']}
      allowsBackForwardNavigationGestures
      setSupportMultipleWindows={false}
      onShouldStartLoadWithRequest={(request) => {
        if (staysInFullClient(route, request.url)) return true;
        if (/^https?:/u.test(request.url)) void Linking.openURL(request.url);
        return false;
      }}
      onLoadEnd={onLoaded}
      onNavigationStateChange={(state) => onCanGoBack?.(state.canGoBack)}
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode === 401) onFailed('refused');
        else if (event.nativeEvent.statusCode >= 500) onFailed('unreachable');
      }}
      onError={() => onFailed('unreachable')}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  );
}
