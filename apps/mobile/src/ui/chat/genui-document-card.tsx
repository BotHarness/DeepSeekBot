import {
  use,
  useCallback,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentRef,
} from 'react';
import { Platform, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { GENUI_EXECUTION_LIMITS } from '../../../../../packages/core/src/channels/genui-execution-limits';
import {
  genuiDocumentPage,
  genuiNavigationAllowed,
  genuiDocumentReply,
  genuiHeightKey,
  genuiRestoreMessage,
  genuiTextScale,
  parseGenuiBridgeMessage,
  rememberedGenuiHeight,
  rememberGenuiHeight,
  type GenuiDocument,
  type GenuiDocumentReply,
} from '../../genui/document';
import { genuiDocumentView, type GenuiDocumentViewModel } from '../../genui/view';
import { genuiFrame, radius, space } from '../design/tokens';
import { useDesignTheme } from '../design/theme';
import { Button } from '../primitives/button';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { GenuiReplies, GenuiViewHost, type GenuiReplySend } from './genui-view-client';

type Status = 'loading' | 'ready' | 'failed';

let mounts = 0;

function GenuiFrame({
  document,
  messageId,
  view,
  onReady,
  onFailure,
}: {
  document: GenuiDocument;
  messageId: string;
  view: GenuiDocumentViewModel;
  onReady(): void;
  onFailure(): void;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const instanceId = useMemo(() => `genui-mobile-${++mounts}`, []);
  const [initial] = useState(() => view.getSnapshot().state);
  const [status, setStatus] = useState<Status>('loading');
  const pageZoom = Platform.OS === 'ios';
  const zoom = pageZoom ? genuiTextScale(theme.fontScale) : 1;
  const heightKey = genuiHeightKey(messageId, document, theme.fontScale);
  const [height, setHeight] = useState<number>(
    () => rememberedGenuiHeight(heightKey) ?? GENUI_EXECUTION_LIMITS.mirrorMinHeight,
  );
  const web = useRef<ComponentRef<typeof WebView>>(null);
  const failed = useRef(false);
  const settled = useRef(false);
  const synced = useRef(JSON.stringify(initial));
  const failRef = useRef<() => void>(() => {});
  const fail = () => {
    if (failed.current) return;
    failed.current = true;
    settled.current = true;
    setStatus('failed');
    onFailure();
  };
  failRef.current = fail;
  const sync = useCallback(() => {
    if (failed.current || !settled.current) return;
    const state = view.getSnapshot().state;
    const identity = JSON.stringify(state);
    if (identity === synced.current) return;
    const data = genuiRestoreMessage(instanceId, document, state);
    if (data === undefined) return;
    synced.current = identity;
    web.current?.postMessage(data);
  }, [document, instanceId, view]);
  const html = useMemo(() => {
    const { GENUI_RUNTIME } =
      require('../../genui/runtime.generated') as typeof import('../../genui/runtime.generated');
    return genuiDocumentPage(document, {
      instanceId,
      theme: theme.scheme,
      fontScale: theme.fontScale,
      pageZoom,
      runtimeBase64: GENUI_RUNTIME.base64,
      state: initial,
    });
  }, [document, instanceId, theme.scheme, theme.fontScale, pageZoom, initial]);
  const attach = useCallback(
    (node: unknown): void | (() => void) => {
      if (node === null) return;
      const timer = setTimeout(() => {
        if (!settled.current) failRef.current();
      }, GENUI_EXECUTION_LIMITS.startupMs * 2);
      const unsubscribe = view.subscribe(sync);
      return () => {
        clearTimeout(timer);
        unsubscribe();
      };
    },
    [view, sync],
  );
  const receive = (event: WebViewMessageEvent) => {
    const message = parseGenuiBridgeMessage(event.nativeEvent.data, instanceId, document);
    if (message === undefined || failed.current) return;
    if (message.type === 'ready') {
      settled.current = true;
      setStatus('ready');
      onReady();
      sync();
    } else if (message.type === 'height') {
      const visible = Math.ceil(message.height * zoom);
      rememberGenuiHeight(heightKey, visible);
      setHeight(visible);
    } else if (message.type === 'state') {
      const identity = JSON.stringify(message.state);
      if (identity === synced.current) return;
      synced.current = identity;
      view.edit(message.state);
    } else fail();
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
        ref={attach}
      >
        <WebView
          ref={web}
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

function ViewControls({ view, stateful }: { view: GenuiDocumentViewModel; stateful: boolean }) {
  const t = useStrings();
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  if (!snapshot.available)
    return (
      <Text variant="meta" tone="muted" accessibilityRole="alert">
        {t.genuiUnavailable}
      </Text>
    );
  if (!stateful) return null;
  const status = snapshot.status;
  const label =
    status === 'saving'
      ? t.genuiSaving
      : status === 'save-error'
        ? t.genuiSaveError
        : status === 'load-error'
          ? t.genuiLoadError
          : status === 'conflict' || status === 'conflict-ready' || status === 'resolving'
            ? t.genuiConflict
            : status === 'loading'
              ? t.genuiLoading
              : t.genuiSaved;
  const alert = status === 'save-error' || status === 'load-error' || status === 'conflict';
  return (
    <View style={{ gap: space.x2, alignItems: 'flex-start' }}>
      <Text
        variant="meta"
        tone="muted"
        accessibilityRole={alert ? 'alert' : undefined}
        accessibilityLiveRegion="polite"
        testID="genui-document-status"
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.x2 }}>
        {status === 'conflict' ? (
          <>
            <Button
              label={t.genuiUseSaved}
              variant="text"
              testID="genui-document-use-saved"
              onPress={() => void view.reload()}
            />
            <Button
              label={t.genuiKeepMine}
              variant="text"
              testID="genui-document-keep-mine"
              onPress={() => void view.keepDraft()}
            />
          </>
        ) : null}
        {status === 'save-error' || status === 'conflict-ready' ? (
          <Button
            label={t.genuiSave}
            variant="text"
            testID="genui-document-save"
            onPress={() => void view.save()}
          />
        ) : null}
        {status === 'load-error' ? (
          <Button
            label={t.genuiReload}
            variant="text"
            testID="genui-document-reload"
            onPress={() => void view.reload()}
          />
        ) : null}
        {status === 'ready' || status === 'saving' ? (
          <Button
            label={t.genuiReset}
            variant="text"
            testID="genui-document-reset"
            onPress={view.reset}
          />
        ) : null}
      </View>
    </View>
  );
}

function Replies({
  document,
  messageId,
  view,
  send,
  ready,
}: {
  document: GenuiDocument;
  messageId: string;
  view: GenuiDocumentViewModel;
  send: GenuiReplySend;
  ready: boolean;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const [sent, setSent] = useState<Partial<Record<GenuiDocumentReply['intent'], string>>>({});
  const blocked = !ready || !snapshot.available || !['ready', 'saving'].includes(snapshot.status);
  const submit = (intent: GenuiDocumentReply['intent']) => {
    if (blocked) return;
    let reply: GenuiDocumentReply;
    try {
      reply = genuiDocumentReply(document, messageId, intent, snapshot.state);
    } catch {
      return;
    }
    const body =
      intent === 'continue'
        ? t.genuiContinueBody(document.title)
        : t.genuiRefreshBody(document.title);
    const payload = JSON.stringify({ reply, body });
    if (sent[intent] === payload) return;
    send(body, reply);
    setSent((previous) => ({ ...previous, [intent]: payload }));
  };
  const justSent = Object.values(sent).length > 0;
  return (
    <View style={{ gap: space.x2, alignItems: 'flex-start' }}>
      <View
        style={{
          flexDirection: theme.fontScale > 1.3 ? 'column' : 'row',
          flexWrap: 'wrap',
          gap: space.x2,
        }}
      >
        <Button
          label={t.genuiContinue}
          tone="primary"
          disabled={blocked}
          testID="genui-document-continue"
          onPress={() => submit('continue')}
        />
        <Button
          label={t.genuiRefresh}
          disabled={blocked}
          testID="genui-document-refresh"
          onPress={() => submit('refresh')}
        />
      </View>
      {justSent ? (
        <Text variant="meta" tone="muted" accessibilityLiveRegion="polite">
          {t.genuiSent}
        </Text>
      ) : null}
    </View>
  );
}

export function GenuiDocumentCard({
  document,
  channelId,
  messageId,
}: {
  document: GenuiDocument;
  channelId?: string | undefined;
  messageId: string;
}) {
  const t = useStrings();
  const client = use(GenuiViewHost);
  const view = useMemo(
    () =>
      genuiDocumentView(
        document,
        channelId ?? '',
        messageId,
        channelId === undefined ? undefined : client,
      ),
    [document, channelId, messageId, client],
  );
  const snapshot = useSyncExternalStore(view.subscribe, view.getSnapshot, view.getSnapshot);
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const send = use(GenuiReplies);
  return (
    <View style={{ gap: space.x3 }} testID="genui-document-card">
      <Text variant="body" strong>
        {document.title}
      </Text>
      {!snapshot.available ? null : failed ? (
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
        <GenuiFrame
          key={attempt}
          document={document}
          messageId={messageId}
          view={view}
          onReady={() => setReady(true)}
          onFailure={() => {
            setReady(false);
            setFailed(true);
          }}
        />
      )}
      <ViewControls
        view={view}
        stateful={document.stateContract !== undefined && client !== undefined}
      />
      {send === undefined || !snapshot.available ? null : (
        <Replies
          document={document}
          messageId={messageId}
          view={view}
          send={send}
          ready={ready && !failed}
        />
      )}
    </View>
  );
}
