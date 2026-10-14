import { Linking } from 'react-native';
import { WebView } from 'react-native-webview';

import { staysInFullClient, type FullClientSource } from '../host/full-client';

export interface FullClientViewProps {
  route: string;
  source: FullClientSource;
  onLoaded(): void;
  onFailed(kind: 'refused' | 'unreachable'): void;
}

export function FullClientView({ route, source, onLoaded, onFailed }: FullClientViewProps) {
  return (
    <WebView
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
      onHttpError={(event) => {
        if (event.nativeEvent.statusCode === 401) onFailed('refused');
        else if (event.nativeEvent.statusCode >= 500) onFailed('unreachable');
      }}
      onError={() => onFailed('unreachable')}
      style={{ flex: 1, backgroundColor: 'transparent' }}
    />
  );
}
