import { useCallback, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { GENUI_EXECUTION_LIMITS } from '../../../../../packages/core/src/channels/genui-execution-limits';
import {
  genuiDocumentPage,
  genuiNavigationAllowed,
  parseGenuiBridgeMessage,
  type GenuiDocument,
} from '../../genui/document';
import { genuiFrame, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';

type Status = 'loading' | 'ready' | 'failed';

let mounts = 0;

function GenuiFrame({ document, onFailure }: { document: GenuiDocument; onFailure(): void }) {
  const theme = useDesignTheme();
  const t = useStrings();
  const instanceId = useMemo(() => `genui-mobile-${++mounts}`, []);
  const [status, setStatus] = useState<Status>('loading');
  const [height, setHeight] = useState<number>(GENUI_EXECUTION_LIMITS.mirrorMinHeight);
  const failed = useRef(false);
  const settled = useRef(false);
  const failRef = useRef<() => void>(() => {});
  const fail = () => {
    if (failed.current) return;
    failed.current = true;
    settled.current = true;
    setStatus('failed');
    onFailure();
  };
  failRef.current = fail;
  const html = useMemo(() => {
    const { GENUI_RUNTIME } =
      require('../../genui/runtime.generated') as typeof import('../../genui/runtime.generated');
    return genuiDocumentPage(document, {
      instanceId,
      theme: theme.scheme,
      fontScale: theme.fontScale,
      runtimeBase64: GENUI_RUNTIME.base64,
    });
  }, [document, instanceId, theme.scheme, theme.fontScale]);
  const watchdog = useCallback((node: unknown): void | (() => void) => {
    if (node === null) return;
    const timer = setTimeout(() => {
      if (!settled.current) failRef.current();
    }, GENUI_EXECUTION_LIMITS.startupMs * 2);
    return () => clearTimeout(timer);
  }, []);
  const receive = (event: WebViewMessageEvent) => {
    const message = parseGenuiBridgeMessage(event.nativeEvent.data, instanceId);
    if (message === undefined || failed.current) return;
    if (message.type === 'ready') {
      settled.current = true;
      setStatus('ready');
    } else if (message.type === 'height') setHeight(message.height);
    else fail();
  };
  const visible = Math.min(height, genuiFrame.maxHeight);
  return (
    <View style={{ gap: space.x2 }}>
      <View
        style={{
          height: visible,
          borderRadius: radius.md,
          overflow: 'hidden',
          opacity: status === 'ready' ? 1 : 0,
        }}
        accessibilityLabel={document.title}
        testID="genui-document-frame"
        ref={watchdog}
      >
        <WebView
          source={{ html }}
          originWhitelist={['about:blank', 'about:srcdoc']}
          onShouldStartLoadWithRequest={(request) => genuiNavigationAllowed(request.url)}
          onMessage={receive}
          onError={fail}
          onHttpError={fail}
          onRenderProcessGone={fail}
          onContentProcessDidTerminate={fail}
          javaScriptEnabled
          javaScriptCanOpenWindowsAutomatically={false}
          setSupportMultipleWindows={false}
          domStorageEnabled={false}
          cacheEnabled={false}
          incognito
          allowFileAccess={false}
          allowFileAccessFromFileURLs={false}
          allowUniversalAccessFromFileURLs={false}
          allowsLinkPreview={false}
          allowsInlineMediaPlayback={false}
          mediaPlaybackRequiresUserAction
          dataDetectorTypes="none"
          textZoom={100}
          scrollEnabled={height > genuiFrame.maxHeight}
          nestedScrollEnabled={height > genuiFrame.maxHeight}
          style={{ backgroundColor: theme.color.surface }}
        />
      </View>
      {status === 'loading' ? (
        <Text variant="meta" tone="muted" accessibilityRole="progressbar">
          {t.genuiLoading}
        </Text>
      ) : null}
    </View>
  );
}

export function GenuiDocumentCard({ document }: { document: GenuiDocument }) {
  const t = useStrings();
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  return (
    <View style={{ gap: space.x3 }} testID="genui-document-card">
      <Text variant="body" strong>
        {document.title}
      </Text>
      {failed ? (
        <View style={{ gap: space.x2, alignItems: 'flex-start' }}>
          <Text variant="meta" tone="muted" accessibilityRole="alert">
            {t.genuiFailed}
          </Text>
          <Button
            label={t.genuiRetry}
            variant="text"
            testID="genui-document-retry"
            onPress={() => {
              setFailed(false);
              setAttempt((value) => value + 1);
            }}
          />
        </View>
      ) : (
        <GenuiFrame key={attempt} document={document} onFailure={() => setFailed(true)} />
      )}
      <Text variant="meta" tone="muted">
        {t.genuiReadOnly}
      </Text>
    </View>
  );
}
