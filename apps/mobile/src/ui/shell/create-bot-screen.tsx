import {
  Stack,
  router,
  useFocusEffect,
  useLocalSearchParams,
  useNavigation,
  useIsFocused,
} from 'expo-router';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AppState, Platform, View, type ViewInstance } from 'react-native';
import { useHostSession, useHostSessions } from '../../host/host-session';
import { liveGlance } from '../../host/host-glance';
import { botCreation, useBotCreation } from '../../host/native-bot-creation';
import { enterBotCreation, type CreationEntrySource } from '../../host/bot-creation-entry';
import type { BotCreationDraft } from '../../host/bot-creation';
import { editCreationTags } from '../../host/bot-creation-tags';
import {
  creationStepReady,
  creationSteps,
  defaultEnvironment,
  isCreationFlow,
  sourceFlow,
  type CreationFlow,
  type EnvironmentChoice,
} from '../../host/bot-creation-steps';
import { botCreationTargets } from '../../host/bot-creation-targets';
import { createCreationVisibility } from '../../host/bot-creation-visibility';
import { hostLooks } from '../../host/native-host-look';
import { shownHostName } from '../design/host-look';
import { space } from '../design/tokens';
import { useSheetContent } from '../primitives/sheet-content';
import { KeyboardFormScroll } from '../primitives/keyboard-form';
import { KeyboardFormFooter } from '../primitives/keyboard-form-footer';
import { Button } from '../primitives/creation-button';
import { Text } from '../primitives/text';
import { CreationField as TextField } from '../primitives/creation-field';
import { CreationTagsField } from '../primitives/creation-tags-field';
import { EnvironmentList } from '../primitives/environment-list';
import { StepBar, type StepBarProps } from '../primitives/step-bar';
import { creationCopy as copy, creationError } from './bot-creation-copy';
import { CreationAvatar } from './creation-avatar';
import { CreationHeader } from './creation-header';
import { openCreatedBot } from './open-created-bot';
import { useMounted } from '../mounted';
import { useStrings } from '../strings';
import { useDesignTheme } from '../design/theme';

const SLOW_MS = 5000;

function entryFlow(source: CreationEntrySource): CreationFlow {
  return source;
}

function flowTitle(flow: CreationFlow) {
  return flow === 'zip'
    ? copy.fromZip
    : flow === 'git'
      ? copy.fromGit
      : flow === 'marketplace'
        ? copy.importTitle
        : copy.title;
}

export const CreationContext = createContext<ReturnType<typeof useCreationModel> | undefined>(
  undefined,
);

export function CreateBotScreen(props: { initialSource?: CreationEntrySource } = {}) {
  const shared = useContext(CreationContext);
  return shared ? <CreationStepContent index={0} /> : <LegacyCreateBotScreen {...props} />;
}

export function CreateBotStepScreen() {
  const shared = useContext(CreationContext);
  const { step } = useLocalSearchParams<{ step?: string }>();
  const index = Math.max(1, Number.parseInt(step ?? '1', 10) || 1);
  return shared ? <CreationStepContent index={index} /> : <LegacyCreateBotStepScreen />;
}

function LegacyCreateBotScreen(props: { initialSource?: CreationEntrySource } = {}) {
  useStrings();
  const { ready, mount } = useSheetContent();
  return (
    <View ref={mount} style={{ flex: 1 }}>
      <Stack.Screen options={{ title: flowTitle(entryFlow(props.initialSource ?? 'blank')) }} />
      {ready ? <CreationStep index={0} initialSource={props.initialSource ?? 'blank'} /> : null}
    </View>
  );
}

function LegacyCreateBotStepScreen() {
  useStrings();
  const { flow, step } = useLocalSearchParams<{ flow?: string; step?: string }>();
  const index = Math.max(1, Number.parseInt(step ?? '1', 10) || 1);
  return <CreationStep index={index} {...(isCreationFlow(flow) ? { flow } : {})} />;
}

export function useCreationModel({
  index,
  initialSource = 'blank',
  flow: routeFlow,
  initialEntry,
  presented = true,
}: {
  index: number;
  initialSource?: CreationEntrySource;
  flow?: CreationFlow;
  initialEntry?: { hostId?: string | undefined; entry?: string | undefined };
  presented?: boolean;
}) {
  const t = useStrings();
  const localEntry = useLocalSearchParams<{ hostId?: string; entry?: string }>();
  const { hostId, entry } = useRef(initialEntry ?? localEntry).current;
  const navigation = useNavigation('/');
  const initialIndex = useRef(index).current;
  const entering = initialIndex === 0;
  const { hosts } = useHostSession();
  const feeds = useHostSessions();
  const theme = useDesignTheme();
  const state = useBotCreation();
  const first = index === 0;
  const [entryReady, setEntryReady] = useState(presented && !entering);
  const visibility = useRef(createCreationVisibility(AppState.currentState === 'active')).current;
  const ready = useRef(presented && !entering);
  const choices: EnvironmentChoice[] = hosts.map((host) => {
    const feed = feeds.find((candidate) => candidate.saved.hostId === host.hostId);
    return {
      hostId: host.hostId,
      status: feed ? liveGlance(feed.snapshot.connection, feed.attention).status : 'checking',
    };
  });
  const choicesRef = useRef(choices);
  choicesRef.current = choices;
  const mounted = useMounted<ViewInstance>(() => {
    if (!presented) return;
    let live = true;
    const subscription = AppState.addEventListener('change', (state) =>
      visibility.appState(state === 'active'),
    );
    const off = botCreation.subscribe(() => {
      const current = botCreation.getSnapshot();
      if (
        ready.current &&
        current.receipt?.status === 'created' &&
        !current.busy &&
        visibility.takeAutoOpen()
      )
        void openCreatedBot(visibility.lease());
    });
    if (!entering) {
      ready.current = true;
      setEntryReady(true);
    }
    if (entering)
      void botCreation.ready.then(async () => {
        if (!live) return;
        const stillHere = visibility.lease();
        await enterBotCreation(
          botCreation,
          initialSource,
          entry === 'all'
            ? { kind: 'all' }
            : entry === 'host' && hostId
              ? { kind: 'host', hostId }
              : { kind: 'resume' },
          (last) => defaultEnvironment(choicesRef.current, last),
        );
        if (!live) return;
        ready.current = true;
        setEntryReady(true);
        const current = botCreation.getSnapshot();
        if (visibility.visible() && current.record.kind === 'submitted') {
          if (
            stillHere() &&
            current.record.mutationStarted &&
            current.receipt?.status !== 'created'
          )
            visibility.arm();
          void botCreation.resume();
        }
      });
    return () => {
      live = false;
      if (entering) ready.current = false;
      off();
      subscription.remove();
      visibility.blur();
    };
  }, [entry, hostId, visibility, initialSource, entering, initialIndex, presented]);
  useFocusEffect(
    useCallback(() => {
      visibility.focus();
      const current = botCreation.getSnapshot();
      if (ready.current && current.record.kind === 'submitted') {
        if (current.record.mutationStarted && current.receipt?.status !== 'created')
          visibility.arm();
        void botCreation.resume();
      }
      return () => {
        visibility.blur();
      };
    }, [visibility, presented]),
  );
  const draft = state.record.kind === 'draft' ? state.record.draft : undefined;
  const submitted = state.record.kind === 'submitted';
  const source =
    draft?.source ??
    (state.record.kind === 'submitted' ? state.record.operation.source : undefined);
  const flow =
    routeFlow ?? (entryReady ? (sourceFlow(source) ?? entryFlow(initialSource)) : initialSource);
  const steps = creationSteps(flow);
  const position = Math.min(index, steps.length - 1);
  const step = steps[position]!;
  const last = position === steps.length - 1;
  const importing = flow !== 'blank';
  const gitSource = draft?.source?.kind === 'git' ? draft.source : undefined;
  const targetId =
    state.record.kind === 'submitted' ? state.record.operation.hostId : state.record.draft.hostId;
  const target = hosts.find((host) => host.hostId === targetId);
  const hostName = (id: string) => {
    const host = hosts.find((candidate) => candidate.hostId === id);
    return host
      ? shownHostName(hostLooks.look(host.hostId), host.hostName)
      : copy.targetUnavailable;
  };
  const edit = (patch: Partial<BotCreationDraft>) => {
    if (draft) void botCreation.edit({ ...draft, ...patch });
  };
  const known = useRef<readonly string[] | undefined>(undefined);
  const hostKey = hosts.map((host) => host.hostId).join('\n');
  const pairedMount = useMounted<ViewInstance>(() => {
    const ids = hostKey ? hostKey.split('\n') : [];
    const previous = known.current;
    known.current = ids;
    if (!presented || !entryReady) return;
    const current = botCreation.getSnapshot().record;
    if (!previous || current.kind !== 'draft' || ids.includes(current.draft.hostId)) return;
    const added = ids.find((id) => !previous.includes(id));
    if (added) void botCreation.edit({ ...current.draft, hostId: added });
  }, [hostKey, presented, entryReady]);
  const waiting = state.busy && submitted;
  const [slow, setSlow] = useState(false);
  const slowMount = useMounted<ViewInstance>(() => {
    setSlow(false);
    if (!waiting) return;
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [waiting]);
  const working = useRef(false);
  const exit = () => navigation.goBack();
  const next = async () => {
    if (working.current || state.busy || !draft) return;
    working.current = true;
    const stillHere = visibility.lease();
    try {
      if (step === 'git' || step === 'zip') {
        await botCreation.preview();
        if (!stillHere() || botCreation.getSnapshot().error) return;
      }
      router.push({
        pathname: '/create-bot-step',
        params: { flow, step: String(index + 1) },
      });
    } finally {
      working.current = false;
    }
  };
  const submit = async () => {
    if (working.current || state.busy) return;
    working.current = true;
    visibility.arm();
    const stillHere = visibility.lease();
    try {
      const current = botCreation.getSnapshot().record;
      const pending = current.kind === 'draft' ? current.draft : undefined;
      if (pending?.source && pending.source.preview?.hostId !== pending.hostId) {
        await botCreation.preview();
        if (!ready.current || !stillHere() || botCreation.getSnapshot().error) return;
      }
      await botCreation.submit();
    } finally {
      working.current = false;
    }
  };
  const openResult = () => openCreatedBot(visibility.lease());
  const title =
    flow === 'git' && gitSource?.origin === 'marketplace' ? copy.importTitle : flowTitle(flow);
  const error = state.error
    ? state.error === 'git-source-changed' && gitSource?.origin === 'marketplace'
      ? t.marketplace.stale
      : creationError(state.error)
    : undefined;
  const editable =
    draft !== undefined && entryReady && !state.busy && state.error !== 'storage-invalid';
  const submitDisabled =
    !editable ||
    !draft.displayName.trim() ||
    !creationStepReady('environment', draft, choices) ||
    (draft.source?.kind === 'git' && !draft.source.gitUrl.trim()) ||
    (importing && !draft.source);
  const busyLabel = importing ? copy.importingShort : copy.creatingShort;
  const bar: StepBarProps | undefined =
    !state.loaded || !entryReady
      ? undefined
      : draft
        ? {
            primary: last
              ? {
                  testID: 'create-bot-submit',
                  label: state.busy
                    ? draft.source && draft.source.preview?.hostId !== draft.hostId
                      ? copy.checkingSource
                      : busyLabel
                    : importing
                      ? copy.importShort
                      : copy.createShort,
                  busy: state.busy,
                  disabled: submitDisabled,
                  onPress: () => void submit(),
                }
              : {
                  testID: 'create-bot-next',
                  label:
                    state.busy && (step === 'git' || step === 'zip')
                      ? copy.checkingSource
                      : copy.next,
                  busy: state.busy,
                  disabled: !editable || !creationStepReady(step, draft, choices),
                  onPress: () => void next(),
                },
            back: first
              ? undefined
              : { testID: 'create-bot-back', label: t.stepBar.back, onPress: () => router.back() },
            step: last ? undefined : { index: position + 1, total: steps.length },
            error,
          }
        : submitted
          ? {
              primary:
                state.error === 'git-source-changed'
                  ? {
                      testID: 'import-bot-choose-source-again',
                      label: copy.chooseSourceAgain,
                      onPress: () => void botCreation.newAfterSourceChanged(),
                    }
                  : state.error === 'creation-identity-unavailable'
                    ? {
                        testID: 'create-bot-new-after-unavailable',
                        label: copy.newAfterUnavailable,
                        onPress: () => void botCreation.newAfterUnavailable(),
                      }
                    : state.receipt?.status === 'created'
                      ? {
                          testID: 'create-bot-open',
                          label: copy.open,
                          onPress: () => void openResult(),
                        }
                      : state.busy
                        ? {
                            testID: 'create-bot-submit',
                            label: busyLabel,
                            busy: true,
                            onPress: () => {},
                          }
                        : {
                            testID: 'create-bot-retry',
                            label:
                              state.record.kind === 'submitted' && state.record.mutationStarted
                                ? copy.retry
                                : copy.retryShort,
                            onPress: () => void submit(),
                          },
              note: slow ? copy.slow : undefined,
              error,
            }
          : undefined;
  return {
    t,
    theme,
    state,
    draft,
    entryReady,
    flow,
    steps,
    position,
    step,
    last,
    importing,
    gitSource,
    hosts,
    choices,
    hostName,
    edit,
    source,
    target,
    targetId,
    title,
    exit,
    bar,
    mounted,
    pairedMount,
    slowMount,
  };
}

function CreationStep(props: Parameters<typeof useCreationModel>[0]) {
  const model = useCreationModel(props);
  const {
    t,
    theme,
    state,
    draft,
    steps,
    position,
    importing,
    title,
    exit,
    bar,
    mounted,
    pairedMount,
    slowMount,
  } = model;
  const { index } = props;
  return (
    <CreationContext.Provider value={model}>
      <View
        ref={mounted}
        style={{
          flex: 1,
          backgroundColor: Platform.OS === 'android' ? theme.color.base : theme.overlay.fill,
        }}
      >
        <Stack.Screen
          options={{
            headerShown: Platform.OS !== 'android',
            presentation: 'card',
            contentStyle: {
              backgroundColor: Platform.OS === 'android' ? theme.color.base : theme.overlay.fill,
            },
            title,
            headerBackVisible: false,
            ...(Platform.OS === 'ios'
              ? {
                  unstable_headerLeftItems: () => [
                    {
                      type: 'button' as const,
                      label: t.close,
                      identifier: 'create-bot-close',
                      icon: { type: 'sfSymbol' as const, name: 'xmark' as const },
                      onPress: exit,
                    },
                  ],
                }
              : {}),
          }}
        />
        <CreationHeader
          title={title}
          name={
            draft?.displayName ??
            (state.record.kind === 'submitted' ? state.record.operation.input.displayName : '')
          }
          avatar={
            draft?.avatar ?? (state.record.kind === 'submitted' ? state.record.avatar : undefined)
          }
          imported={importing}
          step={{ index: position + 1, total: steps.length }}
          progress={
            draft
              ? position / steps.length
              : state.receipt?.status === 'created'
                ? 1
                : state.busy
                  ? undefined
                  : (steps.length - 1) / steps.length
          }
          onClose={exit}
        />
        <View ref={pairedMount} style={{ flex: 1 }}>
          <CreationStepContent index={index} />
        </View>
        <View ref={slowMount}>
          {bar ? (
            <KeyboardFormFooter>
              <StepBar {...bar} />
            </KeyboardFormFooter>
          ) : null}
        </View>
      </View>
    </CreationContext.Provider>
  );
}

function CreationStepContent({ index }: { index: number }) {
  const focused = useIsFocused();
  const model = useContext(CreationContext);
  if (!model) throw new Error('Creation step requires its flow owner');
  const {
    t,
    state,
    draft,
    entryReady,
    flow,
    importing,
    gitSource,
    hosts,
    choices,
    hostName,
    edit,
    source,
    target,
    targetId,
  } = model;
  const steps = creationSteps(flow);
  const position = Math.min(index, steps.length - 1);
  const step = steps[position]!;
  const last = position === steps.length - 1;
  return (
    <KeyboardFormScroll
      enabled={focused}
      mode={Platform.OS === 'ios' ? 'layout' : 'insets'}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={{ padding: space.x5, gap: space.x5 }}
    >
      {!state.loaded || !entryReady ? (
        <Text>{copy.working}</Text>
      ) : draft ? (
        <>
          <Text variant="title" strong>
            {importing && step === 'persona' ? copy.prompt.importDetails : copy.prompt[step]}
          </Text>
          {step === 'environment' ? (
            hosts.length === 0 ? (
              <View style={{ gap: space.x3 }}>
                <Text strong>{copy.noEnvironments}</Text>
                <Text tone="muted">{copy.noEnvironmentsHint}</Text>
                <Button
                  label={copy.addEnvironment}
                  testID="create-bot-pair"
                  tone="primary"
                  onPress={() => router.push('/pair')}
                />
              </View>
            ) : (
              <>
                <EnvironmentList
                  title={copy.destination}
                  value={draft.hostId}
                  disabled={state.busy}
                  options={botCreationTargets(
                    hosts.map((host) => ({ hostId: host.hostId, name: hostName(host.hostId) })),
                  ).map((option) => {
                    const status =
                      choices.find((choice) => choice.hostId === option.value)?.status ??
                      'checking';
                    return {
                      ...option,
                      detail:
                        status === 'online'
                          ? t.hostOnline
                          : status === 'offline'
                            ? t.hostOffline
                            : t.hostChecking,
                      disabled: status === 'offline',
                    };
                  })}
                  onChange={(hostId) => edit({ hostId })}
                />
                <Button
                  label={copy.addEnvironment}
                  variant="text"
                  testID="create-bot-pair"
                  onPress={() => router.push('/pair')}
                />
              </>
            )
          ) : null}
          {step === 'git' && gitSource ? (
            <TextField
              testID="import-bot-git-url"
              accessibilityLabel={copy.gitUrl}
              value={gitSource.gitUrl}
              onChangeText={(gitUrl) => edit({ source: { kind: 'git', gitUrl } })}
              editable={!state.busy}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          ) : null}
          {step === 'zip' ? (
            <>
              {draft.source?.kind === 'zip' ? (
                <View style={{ gap: space.x2 }}>
                  <Text strong>{copy.zipFile}</Text>
                  <Text selectable>{draft.source.fileName}</Text>
                  <Text tone="muted">{copy.zipSize(draft.source.sizeBytes)}</Text>
                </View>
              ) : null}
              <Button
                label={draft.source?.kind === 'zip' ? copy.chooseAnotherZip : copy.chooseZip}
                testID="import-bot-zip-pick"
                tone={draft.source?.kind === 'zip' ? 'secondary' : 'primary'}
                disabled={state.busy}
                onPress={() => void botCreation.beginZip()}
              />
              {state.transfer ? (
                <Text accessibilityLiveRegion="polite">
                  {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
                </Text>
              ) : null}
            </>
          ) : null}
          {step === 'identity' ? (
            <CreationAvatar
              avatar={draft.avatar}
              name={draft.displayName.trim()}
              imported={importing}
              disabled={state.busy}
              onChange={(avatar) => edit({ avatar })}
            />
          ) : null}
          {step === 'identity' ? (
            <TextField
              testID="create-bot-name"
              accessibilityLabel={copy.name}
              value={draft.displayName}
              onChangeText={(displayName) => edit({ displayName })}
              editable={!state.busy}
              maxLength={120}
            />
          ) : null}
          {step === 'confirm' ? (
            <View style={{ gap: space.x2 }}>
              <Text strong>{copy.source}</Text>
              <Text selectable>{gitSource?.gitUrl}</Text>
              {gitSource?.listingId ? (
                <Button
                  label={t.marketplace.refreshListing}
                  testID="import-bot-refresh-listing"
                  disabled={state.busy}
                  onPress={() =>
                    router.push({
                      pathname: '/marketplace-bot',
                      params: { id: gitSource.listingId!, entry: 'refresh' },
                    })
                  }
                />
              ) : null}
              <Text strong>{copy.destination}</Text>
              <Text selectable>{hostName(draft.hostId)}</Text>
              <Text strong>{copy.name}</Text>
              <Text selectable>{draft.displayName}</Text>
            </View>
          ) : null}
          {step === 'persona' && flow === 'blank' ? (
            <TextField
              testID="create-bot-persona"
              accessibilityLabel={copy.persona}
              placeholder={copy.personaHint}
              value={draft.persona}
              onChangeText={(persona) => edit({ persona })}
              multiline
              editable={!state.busy}
            />
          ) : null}
          {step === 'persona' || step === 'confirm' ? (
            <>
              <TextField
                testID="create-bot-bio"
                accessibilityLabel={copy.bio}
                value={draft.description}
                onChangeText={(description) => edit({ description })}
                multiline
                editable={!state.busy}
              />
              <CreationTagsField
                value={draft}
                disabled={state.busy}
                onChange={(action) =>
                  void botCreation.edit((current) => ({
                    ...current,
                    ...editCreationTags(current, action),
                  }))
                }
              />
              <Text tone="muted">{copy.model}</Text>
            </>
          ) : null}
          {last && state.transfer ? (
            <Text accessibilityLiveRegion="polite">
              {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
            </Text>
          ) : null}
        </>
      ) : state.record.kind === 'submitted' ? (
        <View style={{ gap: space.x5 }}>
          <Text variant="title" strong>
            {state.record.operation.input.displayName}
          </Text>
          {source ? (
            <Text selectable>{source.kind === 'zip' ? source.fileName : source.gitUrl}</Text>
          ) : null}
          {state.transfer ? (
            <Text accessibilityLiveRegion="polite">
              {copy.zipProgress(state.transfer.bytes, state.transfer.total)}
            </Text>
          ) : null}
          <Text
            selectable
          >{`${copy.destination}: ${target ? hostName(target.hostId) : copy.targetUnavailable}`}</Text>
          <Text tone="muted">
            {state.record.mutationStarted ? copy.targetFixed : copy.beforeSend}
          </Text>
          {state.receipt || state.record.mutationStarted ? (
            <Text accessibilityLiveRegion="polite">
              {state.busy
                ? importing
                  ? copy.importing
                  : copy.creating
                : state.receipt?.status === 'created'
                  ? copy.completed
                  : state.receipt
                    ? copy.accepted
                    : copy.uncertain}
            </Text>
          ) : null}
          {source?.kind === 'zip' &&
          (state.error === 'zip-file-missing' ||
            state.error === 'zip-file-changed' ||
            state.error === 'zip-file-read') ? (
            <Button
              label={copy.restoreZip}
              testID="import-bot-zip-restore"
              disabled={state.busy}
              onPress={() => void botCreation.restoreZip()}
            />
          ) : null}
          {state.error === 'git-source-changed' ||
          state.error === 'creation-identity-unavailable' ? (
            <Text>{copy.previousKept}</Text>
          ) : null}
          {state.receipt?.status === 'created' ? (
            <Button
              label={source ? copy.importAnother : copy.another}
              testID="create-bot-another"
              onPress={() => void botCreation.another(targetId)}
            />
          ) : null}
          {!state.record.mutationStarted && !state.receipt && !state.busy ? (
            <Button
              label={copy.edit}
              testID="create-bot-edit"
              onPress={() => void botCreation.editBeforeSend()}
            />
          ) : null}
        </View>
      ) : null}
    </KeyboardFormScroll>
  );
}
