import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { stopSession } from '@botharness/host-client/bot-control';
import { errorText } from '@botharness/host-client/bot-settings';
import type { HostClient } from '@botharness/host-client/client';
import {
  sendOrchestratorMessage,
  sendSessionRequest,
  sessionOwner,
  type SessionTranscriptItem,
} from '@botharness/host-client/session-detail';
import { useHostSession, useHostSnapshot } from '../../host/host-session';
import { sessionReadHost } from '../../host/session-detail';
import { loadAssignmentTimeline, type AssignmentTimeline } from '../../host/assignment-timeline';
import { useDesignTheme } from '../design/theme';
import { rowGlyph, space } from '../design/tokens';
import { Text } from '../primitives/text';
import { ChevronDownIcon, ChevronUpIcon } from '../shell/icons';
import { useStrings } from '../strings';
import { AssignmentDetail } from './assignment-screen';
import { Composer } from './composer';
import {
  SessionModelChip,
  SessionModelPicker,
  useSessionModelControl,
} from './session-model-composer';
import { SessionTranscriptRow } from './session-transcript-row';
import { SheetFailed, SheetLoading, SheetNote } from './sheet';
import { useSessionTranscript } from './use-session-transcript';

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
    <>
      <Stack.Screen options={{ title: title ?? t.title }} />
      <SheetNote>{t.unavailable}</SheetNote>
    </>
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
      <>
        <Stack.Screen options={{ title: title ?? t.title }} />
        {resolved === null ? (
          <SheetFailed message={t.unavailable} onRetry={() => setAttempt((value) => value + 1)} />
        ) : online ? (
          <SheetLoading />
        ) : (
          <SheetNote>{t.unavailable}</SheetNote>
        )}
      </>
    );
  return (
    <SessionDetailBody client={client} slug={resolved} id={id} title={title} online={online} />
  );
}

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
  const bottom = useSafeAreaInsets().bottom;
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
  const list = useRef<FlatList<SessionTranscriptItem>>(null);
  const pinned = useRef(true);
  const scrolled = useRef(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [assignment, setAssignment] = useState<AssignmentTimeline>();
  useFocusEffect(
    useCallback(() => {
      if (!online || role !== 'assignment') return;
      let active = true;
      void loadAssignmentTimeline(client, slug, id).then(
        (value) => {
          if (active) setAssignment(value);
        },
        () => {},
      );
      return () => {
        active = false;
      };
    }, [client, id, online, role, slug, view.running]),
  );
  const sessionTitle =
    assignment?.assignment.title ??
    title ??
    (role === 'orchestrator'
      ? t.sessionOrchestrator
      : role === 'assignment'
        ? t.sessionAssignment
        : t.sessionDetail.title);

  return (
    <>
      <Stack.Screen options={{ title: sessionTitle }} />
      {transcript === undefined ? (
        view.error !== undefined ? (
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
        )
      ) : (
        <KeyboardAvoidingView
          style={{ flex: 1, backgroundColor: theme.color.surface }}
          behavior="padding"
          keyboardVerticalOffset={-Math.max(0, bottom - space.x3)}
        >
          <FlatList
            ref={list}
            testID="session-transcript"
            data={view.items}
            keyExtractor={(item, index) =>
              item.kind === 'tool' ? `tool:${item.id}` : `${item.kind}:${index}`
            }
            contentInsetAdjustmentBehavior="automatic"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ rowGap: space.x3, paddingVertical: space.x4 }}
            scrollEventThrottle={16}
            onScrollBeginDrag={() => {
              scrolled.current = true;
            }}
            onScroll={({ nativeEvent: { contentSize, layoutMeasurement, contentOffset } }) => {
              if (!scrolled.current) return;
              pinned.current =
                contentSize.height - layoutMeasurement.height - contentOffset.y <=
                layoutMeasurement.height / 8;
            }}
            onContentSizeChange={() => {
              if (pinned.current && !detailsOpen)
                requestAnimationFrame(() => {
                  if (pinned.current) list.current?.scrollToEnd({ animated: false });
                });
            }}
            ListHeaderComponent={
              <>
                {role === 'assignment' && assignment !== undefined ? (
                  <>
                    <Pressable
                      testID="session-assignment-details"
                      accessibilityRole="button"
                      accessibilityLabel={t.sessionDetail.assignmentDetails}
                      accessibilityState={{ expanded: detailsOpen }}
                      onPress={() => {
                        pinned.current = false;
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
                      <AssignmentDetail
                        timeline={assignment}
                        showTitle={false}
                        showAskInChat={false}
                      />
                    ) : null}
                  </>
                ) : null}
                {transcript.omitted === 0 ? null : (
                  <SheetNote>{t.sessionDetail.omitted(transcript.omitted)}</SheetNote>
                )}
              </>
            }
            ListEmptyComponent={<SheetNote>{t.sessionDetail.empty}</SheetNote>}
            renderItem={({ item, index }) => (
              <SessionTranscriptRow item={item} id={`${id}:${index}`} catalog={model.catalog} />
            )}
          />
          <SessionComposer
            client={client}
            slug={slug}
            id={id}
            role={transcript.role}
            running={view.running}
            online={online}
            refresh={view.refresh}
            model={model}
          />
          <SessionModelPicker control={model} />
        </KeyboardAvoidingView>
      )}
    </>
  );
}

export function SessionComposer({
  client,
  slug,
  id,
  role,
  running,
  online,
  refresh,
  model,
}: {
  client: Pick<HostClient, 'call'>;
  slug: string;
  id: string;
  role: 'assignment' | 'orchestrator';
  running: boolean;
  online: boolean;
  refresh(): void;
  model: ReturnType<typeof useSessionModelControl>;
}) {
  const t = useStrings();
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<'send' | 'stop'>();
  const [error, setError] = useState<string>();
  const pending = useRef(false);
  async function run(action: 'send' | 'stop') {
    const text = draft.trim();
    if (
      !online ||
      pending.current ||
      (action === 'send' && (text === '' || model.saving !== undefined || model.visible))
    )
      return;
    pending.current = true;
    setBusy(action);
    setError(undefined);
    try {
      if (action === 'stop') await stopSession(client, { botSlug: slug, sessionId: id });
      else {
        if (role === 'assignment') await sendSessionRequest(client, slug, id, text, running);
        else await sendOrchestratorMessage(client, slug, id, text);
        setDraft((current) => (current === draft ? '' : current));
      }
      refresh();
    } catch (cause) {
      setError(
        action === 'stop'
          ? t.sessionStopFailed(errorText(cause))
          : t.sessionDetail.sendFailed(errorText(cause)),
      );
    } finally {
      pending.current = false;
      setBusy(undefined);
    }
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
      onSend={() => void run('send')}
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
        stopping: busy === 'stop' || !online,
        onStop: running ? () => void run('stop') : undefined,
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
