import { useScopedState } from './scoped-state.js';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  type ReactElement,
} from 'react';
import { Button, Toast } from '@deepseek-ai/dsh-client-ui-primitives';
import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogView,
  ModelCatalogEntryView,
  ModelPlanStateView,
  ModelRouteView,
  ProfileActivity,
  WorkspaceGrantView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import type { ComposerContext, ComposerShortcut } from './composer-shortcuts.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanions } from './window-companions.js';
import { ModelPresetProfile } from './model-preset-profile.js';
import { modelPlanOf, rememberModelPlan, subscribeModelPlans } from './model-plan-store.js';
import {
  applyBotModelRoute,
  botEffortChoices,
  botModelChoices,
  type BotModelChoice,
} from './bot-model-route.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { useMountedResource } from './mounted-resource.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import {
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from './workspace-grant-events.js';
import { profileTokenChipText, profileTokenSummaryText } from './profile-token-summary.js';
import type { AveragePerfView } from './message-perf.js';
import { PROFILE_ACTIVITY_WEEKS } from './profile-cards-builtins.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { DmComposerUsagePopover } from './dm-composer-usage.js';
import { ComposerContextBar, type ComposerFooterHandle } from './composer-context-bar.js';
import { ChipButton } from './ds/chip-button.js';
import { ModelPicker } from './model-picker.js';
import { Note } from './ds/note.js';

const subscribeUnavailable = (): (() => void) => () => {};
const unavailableSnapshot = () => undefined;

export function useDmComposerContext({
  bot,
  channelId,
  actions,
  companion,
  activity,
  loading,
  t,
  onUsage,
  avgPerf,
}: {
  bot: BotSummary | undefined;
  channelId: string | undefined;
  actions: BridgeActions;
  companion: WindowCompanions | undefined;
  activity: ProfileActivity | undefined;
  loading: boolean;
  t: BotHarnessTranslate;
  onUsage(): void;
  avgPerf?: AveragePerfView | undefined;
}): ComposerContext | undefined {
  const footerSettings = useRef<ComposerFooterHandle>(null);
  const [panel, setPanel] = useScopedState<{
    slug: string;
    kind: 'model' | 'model-settings' | 'workspace';
  }>(channelId);
  const plan = useSyncExternalStore(
    subscribeModelPlans,
    () => modelPlanOf(bot?.slug),
    () => modelPlanOf(bot?.slug),
  );
  const [modelData, setModelData] = useScopedState<{
    slug: string;
    catalog: ModelCatalogView;
    state: ModelPlanStateView;
    inheritedRoute?: ModelRouteView;
    unavailable?: boolean;
  }>(channelId);
  const [modelBusy, setModelBusy] = useScopedState(channelId, false);
  const [modelError, setModelError] = useScopedState<string | undefined>(channelId, undefined);
  const companionState = useSyncExternalStore(
    companion?.subscribe ?? subscribeUnavailable,
    companion?.getSnapshot ?? unavailableSnapshot,
    companion?.getSnapshot ?? unavailableSnapshot,
  );
  const modelSlug = bot === undefined || bot.deleted ? undefined : bot.slug;
  const modelMount = useMountedResource<HTMLSpanElement>(() => {
    if (modelSlug === undefined) return;
    let active = true;
    let generation = 0;
    const refresh = (): void => {
      const current = ++generation;
      setModelData(undefined);
      void actions
        .modelPlanState(modelSlug)
        .then(async (state) => {
          if (!active || current !== generation) return;
          rememberModelPlan(modelSlug, state?.plan);
          const catalog = await actions.modelCatalog();
          if (!active || current !== generation) return;
          const route = catalog.default;
          const inheritedRoute =
            state?.plan === undefined &&
            state?.repair === undefined &&
            route !== undefined &&
            catalog.models.some(
              (entry) =>
                entry.provider === route.provider &&
                entry.model === route.model &&
                entry.credential === undefined,
            )
              ? route
              : undefined;
          setModelData({
            slug: modelSlug,
            catalog,
            state: state ?? {},
            ...(inheritedRoute === undefined ? {} : { inheritedRoute }),
          });
        })
        .catch((failure: unknown) => {
          if (active && current === generation) {
            setModelData({
              slug: modelSlug,
              catalog: { models: [] },
              state: {},
              unavailable: true,
            });
            setModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
          }
        });
    };
    refresh();
    const unsubscribe = subscribeModelPlans(() => {
      if (modelPlanOf(modelSlug) === undefined) refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [actions, channelId, modelSlug, plan?.revision]);
  if (bot === undefined || bot.deleted || channelId === undefined) return;
  const data = modelData?.slug === bot.slug ? modelData : undefined;
  const catalog = data?.catalog;
  const planState = data?.state;
  const modelStatus: 'loading' | 'ready' | 'unavailable' =
    data === undefined
      ? plan === undefined
        ? 'loading'
        : 'ready'
      : data.unavailable === true || data.state.repair !== undefined
        ? 'unavailable'
        : 'ready';
  const selected = companion?.get(bot.slug) !== undefined;
  const ready = companionState?.ready === true;
  const slug = bot.slug;
  const open = (kind: 'model' | 'model-settings' | 'workspace') => setPanel({ slug, kind });
  const route = plan?.orchestrator ?? data?.inheritedRoute;
  const defaultEffort = t('modelPreset.providerDefault');
  const applyModelRoute = (route: ModelRouteView): void => {
    if (planState === undefined || modelBusy) return;
    setModelBusy(true);
    void applyBotModelRoute(actions, slug, planState, route)
      .then((next) =>
        setModelData((current) =>
          current?.slug === slug
            ? { ...current, state: { revision: next.revision, plan: next } }
            : current,
        ),
      )
      .catch((failure: unknown) => {
        setModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
      })
      .finally(() => setModelBusy(false));
  };
  const routeChoice = (
    id: 'model' | 'effort',
    key: string,
    choice: BotModelChoice,
  ): ComposerShortcut => ({
    id,
    key,
    label: choice.label,
    selected: choice.current,
    disabled: modelStatus !== 'ready' || modelBusy || planState === undefined,
    run: () => applyModelRoute(choice.route),
  });
  const shortcuts: ComposerShortcut[] = [
    {
      id: 'model',
      scope: t('composerModel.scope'),
      label: t('composerModel.title'),
      icon: <ChannelSidebarIcon name="cpu" />,
      run: () => open('model'),
      choices: (argument) =>
        botModelChoices(route, catalog, defaultEffort, argument).map((choice) =>
          routeChoice('model', `model:${choice.route.provider}:${choice.route.model}`, choice),
        ),
    },
    {
      id: 'effort',
      scope: t('composerModel.scope'),
      label: t('composerCommand.effort'),
      icon: <ChannelSidebarIcon name="ruler" />,
      run: () => open('model'),
      choices: (argument) =>
        botEffortChoices(route, catalog, defaultEffort, argument).map((choice) =>
          routeChoice('effort', `effort:${choice.route.reasoningEffort ?? ''}`, choice),
        ),
    },
    {
      id: 'workspace',
      label: t('grant.addFolder'),
      icon: <ChannelSidebarIcon name="folder-key" />,
      run: () => open('workspace'),
    },
    {
      id: 'companion',
      icon: <ChannelSidebarIcon name="bot" />,
      label: `${t(selected ? 'companion.remove' : 'companion.show')} · ${bot.displayName}`,
      selected,
      disabled: !ready,
      reason: ready ? undefined : t('composerContext.companionUnavailable'),
      run: () => {
        if (companion?.getSnapshot().ready !== true) return;
        if (companion.get(bot.slug) !== undefined) companion.remove(bot.slug);
        else companion.select(bot.slug);
      },
    },
  ];
  return {
    target: bot.slug,
    shortcuts: [
      ...shortcuts,
      { id: 'footer', label: t('footer.settings'), run: () => footerSettings.current?.open() },
    ],
    content: (
      <>
        <span ref={modelMount} aria-hidden="true" style={{ display: 'contents' }} />
        <DmComposerContextView
          key={bot.slug}
          footerSettings={footerSettings}
          avgPerf={avgPerf}
          bot={bot}
          channelId={channelId}
          actions={actions}
          activity={activity?.slug === bot.slug ? activity : undefined}
          loading={loading}
          t={t}
          onUsage={onUsage}
          onOpen={open}
          panel={panel?.slug === bot.slug ? panel.kind : undefined}
          onClose={() => setPanel(undefined)}
          models={catalog?.models ?? []}
          modelStatus={modelStatus}
          route={route}
          modelBusy={modelBusy}
          applyModelRoute={applyModelRoute}
        />
        {modelError === undefined ? null : (
          <Toast
            key="dm-model-error"
            text={modelError}
            holdMs={6000}
            onDone={() => setModelError(undefined)}
          />
        )}
      </>
    ),
  };
}

function DmComposerContextView({
  footerSettings,
  bot,
  channelId,
  actions,
  activity,
  loading,
  t,
  onUsage,
  avgPerf,
  onOpen,
  panel,
  onClose,
  models,
  modelStatus,
  route,
  modelBusy,
  applyModelRoute,
}: {
  footerSettings?: Ref<ComposerFooterHandle>;
  bot: BotSummary;
  channelId: string;
  actions: BridgeActions;
  activity: ProfileActivity | undefined;
  loading: boolean;
  t: BotHarnessTranslate;
  onUsage(): void;
  avgPerf?: AveragePerfView | undefined;
  onOpen(kind: 'model' | 'model-settings' | 'workspace'): void;
  panel: 'model' | 'model-settings' | 'workspace' | undefined;
  onClose(): void;
  models: readonly ModelCatalogEntryView[];
  modelStatus: 'loading' | 'ready' | 'unavailable';
  route: ModelRouteView | undefined;
  modelBusy: boolean;
  applyModelRoute(route: ModelRouteView): void;
}): ReactElement {
  const [grants, setGrants] = useState<WorkspaceGrantView[]>();
  const [grantError, setGrantError] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const usageTrigger = useRef<HTMLButtonElement | null>(null);
  const usageMount = useMountedResource<HTMLButtonElement>((node) => {
    usageTrigger.current = node;
    return () => {
      usageTrigger.current = null;
      setUsageOpen(false);
    };
  }, []);
  const subscribeGrants = useCallback(
    (listener: () => void) => subscribeWorkspaceGrantChanges(bot.slug, listener),
    [bot.slug],
  );
  const revision = useSyncExternalStore(
    subscribeGrants,
    () => workspaceGrantRevision(bot.slug),
    () => 0,
  );
  const request = useRef(0);
  const grantMount = useMountedResource<HTMLButtonElement>(() => {
    const version = ++request.current;
    setGrantError(false);
    void actions.listWorkspaceGrants(bot.slug).then(
      (rows) => {
        if (request.current === version)
          setGrants(rows.filter((grant) => grant.revokedAt === undefined));
      },
      () => {
        if (request.current === version) setGrantError(true);
      },
    );
    return () => {
      request.current += 1;
    };
  }, [actions, bot.slug, revision]);
  const modelName = models.find(
    (entry) => entry.provider === route?.provider && entry.model === route?.model,
  )?.modelName;
  const modelLabel =
    (modelStatus === 'unavailable'
      ? t('composerContext.unavailable')
      : (modelName ?? route?.model)) ??
    t(
      modelStatus === 'loading'
        ? 'modelPreset.loading'
        : modelStatus === 'unavailable'
          ? 'composerContext.unavailable'
          : 'composerContext.noModel',
    );
  const workspaceLabel = grantError
    ? t('composerContext.unavailable')
    : grants === undefined
      ? t('composerContext.loading')
      : t('composerContext.workspaces', { count: grants.length });
  const usageLabel = t('composerContext.usage', {
    name: bot.displayName,
    weeks: activity?.weeks ?? PROFILE_ACTIVITY_WEEKS,
    count:
      loading && activity === undefined
        ? t('composerContext.loading')
        : profileTokenSummaryText(activity, t),
  });
  const compactUsage =
    loading && activity === undefined
      ? t('composerContext.loading')
      : profileTokenChipText(activity, t);
  return (
    <>
      <ComposerContextBar
        settingsRef={footerSettings}
        t={t}
        label={t('composerContext.label')}
        trailing={
          <ChipButton
            ref={usageMount}
            data-composer-chip="usage"
            icon={<ChannelSidebarIcon name="ruler" size={14} />}
            label={compactUsage}
            onClick={() => setUsageOpen((open) => !open)}
            aria-label={usageLabel}
            aria-haspopup="dialog"
            aria-expanded={usageOpen}
          />
        }
      >
        <ChipButton
          data-composer-chip="model"
          collapseLabel
          icon={<ChannelSidebarIcon name="cpu" size={14} />}
          label={modelLabel}
          title={modelLabel}
          onClick={() => onOpen('model')}
          aria-label={`${t('entry.model')} · ${bot.displayName} · ${modelLabel}`}
        />
        {avgPerf === undefined ? null : (
          <ChipButton
            data-composer-chip="avg-perf"
            icon={<ChannelSidebarIcon name="gauge" size={14} />}
            label={t('message.perf.speed', { tps: avgPerf.tokensPerSecond })}
            title={t('composerContext.avgPerf.title', { count: avgPerf.count })}
            tabIndex={-1}
            disabled
          />
        )}
        <ChipButton
          ref={grantMount}
          data-composer-chip="workspace"
          collapseLabel
          icon={<ChannelSidebarIcon name="folder-key" size={14} />}
          label={workspaceLabel}
          onClick={() => onOpen('workspace')}
          aria-label={`${t('entry.workspaceGrants')} · ${bot.displayName} · ${workspaceLabel}`}
        />
      </ComposerContextBar>
      {usageOpen ? (
        <DmComposerUsagePopover
          bot={bot}
          channelId={channelId}
          actions={actions}
          activity={activity}
          t={t}
          trigger={usageTrigger}
          onClose={() => setUsageOpen(false)}
          onDetails={() => {
            setUsageOpen(false);
            onUsage();
          }}
        />
      ) : null}
      {panel === undefined ? null : (
        <PanelDialog
          size="medium"
          fill
          title={`${t(panel === 'model' ? 'composerModel.title' : panel === 'model-settings' ? 'entry.model' : 'entry.workspaceGrants')} · ${bot.displayName}`}
          closeLabel={t('approval.cancel')}
          onClose={onClose}
        >
          {panel === 'model' ? (
            <>
              <ModelPicker
                title={t('composerModel.title')}
                hint={t('composerModel.scope')}
                choice={{
                  key: route === undefined ? '' : JSON.stringify([route.provider, route.model]),
                  effort: route?.reasoningEffort ?? '',
                }}
                catalog={models}
                options={models
                  .filter((entry) => entry.credential === undefined)
                  .map((entry) => ({
                    value: JSON.stringify([entry.provider, entry.model]),
                    label: entry.modelName,
                    hint: entry.providerName,
                  }))}
                onChange={(choice) => {
                  const entry = models.find(
                    (entry) => JSON.stringify([entry.provider, entry.model]) === choice.key,
                  );
                  if (entry === undefined) return;
                  const same = route?.provider === entry.provider && route.model === entry.model;
                  const effort = same
                    ? choice.effort
                    : botModelChoices(
                        route,
                        { models: [entry] },
                        t('modelPreset.providerDefault'),
                        '',
                      )[0]?.route.reasoningEffort;
                  applyModelRoute({
                    provider: entry.provider,
                    model: entry.model,
                    ...(effort ? { reasoningEffort: effort } : {}),
                  });
                }}
                disabled={modelBusy || modelStatus !== 'ready'}
                t={t}
              />
              <Note>{t('composerModel.nextTurn')}</Note>
              <Button variant="ghost" onClick={() => onOpen('model-settings')}>
                {t('composerModel.taskSettings')}
              </Button>
            </>
          ) : panel === 'model-settings' ? (
            <ModelPresetProfile slug={bot.slug} actions={actions} t={t} />
          ) : (
            <WorkspaceGrantsEntry
              scope="personabot"
              channelId={channelId}
              botSlug={bot.slug}
              botName={bot.displayName}
              actions={actions}
              t={t}
              composerOnly
            />
          )}
        </PanelDialog>
      )}
    </>
  );
}
