import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react';
import { Platform, Pressable, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { stopSession } from '@botharness/host-client/bot-control';
import { errorText } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import {
  sendOrchestratorMessage,
  sendSessionRequest,
  sessionOwner,
  setSessionArchived,
} from '@botharness/host-client/session-detail';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { sessionReadHost } from '../../host/session-detail';
import { loadAssignmentTimeline, type AssignmentTimeline } from '../../host/assignment-timeline';
import { useDesignTheme } from '../design/theme';
import { rowGlyph, space } from '../design/tokens';
import { ChatList, type ChatListHandle } from '../primitives/chat-list';
import { ReadFailure } from '../primitives/read-failure';
import { Text } from '../primitives/text';
import { ChevronDownIcon, ChevronUpIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { AssignmentDetail } from './assignment-screen';
import type { ChatHeaderMenu } from './chat-header-actions';
import { ChatHeaderRow } from './chat-header-row';
import { ChatTitleCapsule } from './chat-title-capsule';
import { useChannelViewport } from './channel-viewport';
import {
  ChatTimelineFrame,
  ChatTimelineLoading,
  ChatTimelineOverlays,
  chatLatestSpacer,
  chatStackOptions,
  chatTimelineListLayout,
  useChatInitialScroll,
  useChatTimelineChrome,
} from './chat-timeline-chrome';
import { Composer } from './composer';
import { ConversationTopBar } from './conversation-top-bar';
import {
  SessionModelChip,
  SessionModelPicker,
  useSessionModelControl,
} from './session-model-composer';
import { SessionTranscriptRow } from './session-transcript-row';
import { SheetFailed, SheetLoading, SheetNote } from './sheet';
import { useSessionTranscript } from './use-session-transcript';

function SessionHeader({
  title,
  menu,
  onHeight,
}: {
  title: string;
  menu?: ChatHeaderMenu | undefined;
  onHeight(height: number): void;
}) {
  const theme = useDesignTheme();
  const t = useStrings();
  const router = useRouter();
  const back = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  return (
    <>
      <Stack.Screen
        options={{
          ...chatStackOptions(theme.color.base),
          title,
          headerBackVisible: false,
          headerTitle: () => (
            <ChatHeaderRow
              back={{ label: t.back, testID: 'session-back-button', onPress: back }}
              title={
                <ChatTitleCapsule
                  title={title}
                  staticLabel
                  accessibilityLabel={title}
                  testID="session-header-title"
                />
              }
              menu={menu}
            />
          ),
        }}
      />
      {Platform.OS === 'android' ? (
        <ConversationTopBar
          variant="session"
          title={title}
          onBack={back}
          menu={menu}
          onHeight={onHeight}
        />
      ) : null}
    </>
  );
}

function SessionNotice({ title, children }: { title: string; children: ReactNode }) {
  const theme = useDesignTheme();
  const { headerOverlap, headerPadding, setMeasuredHeaderHeight } = useChatTimelineChrome();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.color.base,
        paddingTop: Math.max(headerOverlap, headerPadding),
      }}
    >
      {children}
      <SessionHeader title={title} onHeight={setMeasuredHeaderHeight} />
    </View>
  );
}

export function SessionDetailScreen() {
  const { hostId, slug, id, session, title } = useLocalSearchParams<{
    hostId?: string;
    slug?: string;
    id?: string;
    session?: string;
    title?: string;
  }>();
  const t = useStrings().sessionDetail;
  const { client, saved } = useHostSession(hostId);
  const [openedOn, setOpenedOn] = useState(saved?.hostId);
  if (openedOn === undefined && saved?.hostId !== undefined) setOpenedOn(saved.hostId);
  const sessionId = session ?? id;
  const matchingHost = (hostId ?? openedOn) === saved?.hostId;
  return client === undefined || !matchingHost || sessionId === undefined ? (
    <SessionNotice title={title ?? t.title}>
      <SheetNote>{t.unavailable}</SheetNote>
    </SessionNotice>
  ) : (
    <SessionTarget
      key={`${saved?.hostId}:${saved?.deviceId}:${slug}:${sessionId}`}
      client={client}
      slug={slug}
      id={sessionId}
      title={title}
    />
  );
}

function SessionTarget({
  client,
  slug,
  id,
  title,
}: {
  client: HostClient;
  slug: string | undefined;
  id: string;
  title: string | undefined;
}) {
  const t = useStrings().sessionDetail;
  const [owner, setOwner] = useState<string | null>();
  const [attempt, setAttempt] = useState(0);
  const online = useHostSnapshot(client).connection.status === 'connected';
  useFocusEffect(
    useCallback(() => {
      if (slug !== undefined || !online) return;
      const abort = new AbortController();
      void sessionOwner(sessionReadHost(client, abort.signal), id).then(
        (value) => {
          if (!abort.signal.aborted) setOwner(value?.botSlug ?? null);
        },
        () => {
          if (!abort.signal.aborted) setOwner(null);
        },
      );
      return () => abort.abort();
    }, [client, id, slug, online, attempt]),
  );

  const resolved = slug ?? owner;
  if (resolved == null)
    return (
      <SessionNotice title={title ?? t.title}>
        {resolved === null ? (
          <SheetFailed message={t.unavailable} onRetry={() => setAttempt((value) => value + 1)} />
        ) : online ? (
          <SheetLoading />
        ) : (
          <SheetNote>{t.unavailable}</SheetNote>
        )}
      </SessionNotice>
    );
  return (
    <SessionDetailBody client={client} slug={resolved} id={id} title={title} online={online} />
  );
}

type SessionCommand =
  | { kind: 'send'; text: string }
  | { kind: 'stop' }
  | { kind: 'archive'; archived: boolean };

export function SessionDetailBody({
  client,
  slug,
  id,
  title,
  online,
}: {
  client: HostClient;
  slug: string;
  id: string;
  title?: string | undefined;
  online: boolean;
}) {
  const t = useStrings();
  const theme = useDesignTheme();
  const view = useSessionTranscript(client, slug, id, online);
  const transcript = view.transcript;
  const role = transcript?.role;
  const model = useSessionModelControl({
    slug,
    sessionId: id,
    host: client,
    enabled: online && role !== undefined,
    running: view.running,
    target: transcript?.currentTarget,
  });
  const chrome = useChatTimelineChrome();
  const { headerOverlap, headerPadding, nativeSpacer, setMeasuredHeaderHeight } = chrome;
  const android = Platform.OS === 'android';
  const rows = useMemo(
    () =>
      view.items.map((item, index) => ({
        item,
        index,
        id: item.kind === 'tool' ? `tool:${item.id}` : `${item.kind}:${index}`,
        ...(item.kind === 'reply' ? { author: 'bot' as const } : {}),
      })),
    [view.items],
  );
  const list = useRef<ChatListHandle<(typeof rows)[number]>>(null);
  const attachList = useCallback((node: typeof list.current) => {
    list.current = node;
  }, []);
  const data = useMemo(() => (android ? rows.toReversed() : rows), [android, rows]);
  const latest = useChannelViewport(
    list,
    rows,
    undefined,
    headerOverlap,
    transcript !== undefined && rows.length === 0,
    0,
    android,
  );
  const { key, ...initialScrollProps } = useChatInitialScroll(true, rows.length);
  const { composerHeight, viewportHeight } = latest;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [assignmentRead, setAssignmentRead] = useState<{
    timeline?: AssignmentTimeline;
    error?: string;
    loading: boolean;
  }>({ loading: false });
  const [assignmentAttempt, setAssignmentAttempt] = useState(0);
  const assignment = assignmentRead.timeline;
  const [busy, setBusy] = useState<SessionCommand['kind']>();
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (!online || role !== 'assignment') return;
      const abort = new AbortController();
      setAssignmentRead((current) => ({ ...current, loading: true }));
      void loadAssignmentTimeline(sessionReadHost(client, abort.signal), slug, id).then(
        (timeline) => {
          if (!abort.signal.aborted) setAssignmentRead({ timeline, loading: false });
        },
        (error: unknown) => {
          if (!abort.signal.aborted)
            setAssignmentRead((current) => ({
              ...current,
              error: errorText(error),
              loading: false,
            }));
        },
      );
      return () => abort.abort();
    }, [client, id, online, role, slug, view.running, assignmentAttempt]),
  );
  const sessionTitle =
    assignment?.assignment.title ||
    (role === 'assignment' ? title : undefined) ||
    transcript?.displayTitle ||
    title ||
    id;

  async function run(command: SessionCommand): Promise<boolean> {
    if (!online || role === undefined || pending.current) return false;
    pending.current = true;
    setBusy(command.kind);
    setError(undefined);
    try {
      switch (command.kind) {
        case 'stop':
          await stopSession(client, { botSlug: slug, sessionId: id });
          break;
        case 'archive':
          await setSessionArchived(client, slug, id, command.archived);
          setAssignmentAttempt((attempt) => attempt + 1);
          break;
        case 'send':
          if (role === 'assignment')
            await sendSessionRequest(client, slug, id, command.text, view.running);
          else await sendOrchestratorMessage(client, slug, id, command.text);
          latest.jumpToLatest();
          break;
      }
      view.refresh();
      return true;
    } catch (cause) {
      const message = errorText(cause);
      setError(
        {
          send: t.sessionDetail.sendFailed,
          stop: t.sessionStopFailed,
          archive: t.sessionDetail.archiveFailed,
        }[command.kind](message),
      );
      return false;
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
  }

  const stop = () => void run({ kind: 'stop' });
  const canArchive =
    !view.running &&
    assignment !== undefined &&
    assignment.assignment.activity !== 'working' &&
    assignment.assignment.activity !== 'stopping';
  const isArchived = assignment?.assignment.archivedAt !== undefined;
  const menu: ChatHeaderMenu | undefined =
    online && role !== undefined
      ? {
          label: t.sessionDetail.options,
          testID: 'session-options',
          items: [
            ...(view.running ? [{ label: t.sessionStop, icon: 'stop' as const, run: stop }] : []),
            ...(canArchive
              ? [
                  {
                    label: isArchived ? t.sessionDetail.unarchive : t.sessionDetail.archive,
                    icon: isArchived ? ('unarchive' as const) : ('archive' as const),
                    run: () => void run({ kind: 'archive', archived: !isArchived }),
                  },
                ]
              : []),
            { label: t.sessionModel.choice, icon: 'model', run: model.show },
          ],
        }
      : undefined;

  if (transcript === undefined)
    return (
      <SessionNotice title={sessionTitle}>
        {view.error !== undefined ? (
          <SheetFailed
            message={
              view.error === 'unavailable'
                ? t.sessionDetail.unavailable
                : t.sessionDetail.loadFailed
            }
            onRetry={view.retry}
          />
        ) : online ? (
          <SheetLoading />
        ) : (
          <SheetNote>{t.sessionDetail.unavailable}</SheetNote>
        )}
      </SessionNotice>
    );

  const oldest = (
    <>
      {role === 'assignment' &&
      online &&
      assignment === undefined &&
      assignmentRead.error === undefined ? (
        <SheetLoading />
      ) : null}
      {role === 'assignment' && assignment !== undefined ? (
        <>
          <Pressable
            testID="session-assignment-details"
            accessibilityRole="button"
            accessibilityLabel={t.sessionDetail.assignmentDetails}
            accessibilityState={{ expanded: detailsOpen }}
            onPress={() => {
              latest.hold();
              setDetailsOpen((open) => !open);
            }}
            style={{
              minHeight: theme.touch,
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: space.x5,
              gap: space.x2,
            }}
          >
            <Text variant="meta" tone="muted">
              {t.sessionDetail.assignmentDetails}
            </Text>
            {detailsOpen ? (
              <ChevronUpIcon size={rowGlyph.size} color={theme.color.muted} />
            ) : (
              <ChevronDownIcon size={rowGlyph.size} color={theme.color.muted} />
            )}
          </Pressable>
          {detailsOpen ? (
            <AssignmentDetail timeline={assignment} showTitle={false} showAskInChat={false} />
          ) : null}
        </>
      ) : null}
      {transcript.omitted === 0 ? null : (
        <SheetNote>{t.sessionDetail.omitted(transcript.omitted)}</SheetNote>
      )}
      {rows.length === 0 ? <SheetNote>{t.sessionDetail.empty}</SheetNote> : null}
    </>
  );
  const newest = (
    <>
      {role === 'assignment' && assignmentRead.error !== undefined ? (
        <View style={{ paddingHorizontal: space.x5 }}>
          <ReadFailure
            title={t.sessionDetail.assignmentFailed}
            detail={assignmentRead.error}
            onRetry={() => setAssignmentAttempt((attempt) => attempt + 1)}
            busy={online && assignmentRead.loading}
            disabled={!online}
          />
        </View>
      ) : null}
      {chatLatestSpacer(latest, nativeSpacer)}
    </>
  );

  return (
    <View style={{ flex: 1 }}>
      <ChatTimelineFrame
        latest={latest}
        nativeSpacer={nativeSpacer}
        backgroundColor={theme.color.base}
        composer={
          <SessionComposer
            online={online}
            busy={busy}
            error={error}
            onStop={view.running ? stop : undefined}
            onSend={(text) => run({ kind: 'send', text })}
            model={model}
          />
        }
      >
        <Animated.View style={{ flex: 1 }} onLayout={latest.onViewportLayout}>
          <ChatList
            key={key}
            {...initialScrollProps}
            ref={attachList}
            testID="session-transcript"
            data={data}
            keyExtractor={(row) => row.id}
            renderScrollComponent={latest.renderScrollComponent}
            {...chatTimelineListLayout({
              ...chrome,
              viewportHeight,
              composerHeight,
              ready: latest.ready || rows.length === 0,
            })}
            {...latest.listProps}
            onScrollToIndexFailed={latest.retry}
            scrollEventThrottle={android && !latest.ready ? 16 : 32}
            ListHeaderComponent={android ? newest : oldest}
            ListFooterComponent={android ? oldest : newest}
            renderItem={({ item: row }) => (
              <View style={{ paddingBottom: space.x3 }}>
                <SessionTranscriptRow
                  item={row.item}
                  id={`${id}:${row.index}`}
                  catalog={model.catalog}
                />
              </View>
            )}
          />
          <Animated.View
            pointerEvents="box-none"
            style={[
              { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
              latest.overlayStyle,
            ]}
          >
            {!latest.ready && rows.length > 0 ? (
              <ChatTimelineLoading
                latest={latest}
                headerPadding={headerPadding}
                composerHeight={composerHeight}
              />
            ) : null}
            <ChatTimelineOverlays
              color={theme.color.base}
              headerOverlap={headerOverlap}
              headerPadding={headerPadding}
              nativeSpacer={nativeSpacer}
              latest={latest}
              composerHeight={composerHeight}
            />
          </Animated.View>
        </Animated.View>
      </ChatTimelineFrame>
      <SessionHeader title={sessionTitle} menu={menu} onHeight={setMeasuredHeaderHeight} />
      <SessionModelPicker control={model} />
    </View>
  );
}

function SessionComposer({
  online,
  busy,
  error,
  onStop,
  onSend,
  model,
}: {
  busy: SessionCommand['kind'] | undefined;
  error: string | undefined;
  online: boolean;
  onStop: (() => void) | undefined;
  onSend(text: string): Promise<boolean>;
  model: ReturnType<typeof useSessionModelControl>;
}) {
  const [draft, setDraft] = useState('');
  async function send() {
    const text = draft.trim();
    if (text === '' || model.saving !== undefined || model.visible) return;
    if (await onSend(text)) setDraft((current) => (current === draft ? '' : current));
  }

  return (
    <Composer
      value={draft}
      disabled={!online || busy !== undefined}
      files={[]}
      canAttach={false}
      dictation="idle"
      canDictate={false}
      onChange={setDraft}
      onSend={() => void send()}
      onPick={() => {}}
      onRemove={() => {}}
      onDictate={() => {}}
      onStopDictation={() => {}}
      onCancelDictation={() => {}}
      above={
        error === undefined ? null : (
          <View style={{ paddingHorizontal: space.x3, paddingBottom: space.x2 }}>
            <Text accessibilityRole="alert" tone="danger" variant="meta">
              {error}
            </Text>
          </View>
        )
      }
      sessionControls={{
        blocksSend: model.visible || model.saving !== undefined,
        stopping: busy !== undefined || !online,
        onStop,
        render: (width) => (
          <SessionModelChip
            control={model}
            width={width}
            disabled={!online || busy !== undefined}
          />
        ),
      }}
    />
  );
}
