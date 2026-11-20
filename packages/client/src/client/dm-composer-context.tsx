import { turnTargetLabel } from '@botharness/host-client/turn-target';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { observeHostResource, observeResource } from './messaging-defaults-live.js';
import { useMessageHost } from './message-host.js';
import { useScopedState } from './scoped-state.js';
import {
  useCallback,
  useRef,
  useState,
  useSyncExternalStore,
  type Ref,
  type ReactElement,
} from 'react';
import { Toast } from './ds/toast.js';
import * as stylex from '@stylexjs/stylex';
import { space } from './ds/tokens.stylex.js';
import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogGroupView,
  ModelPresetView,
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
  applyBotModelGroup,
  applyBotModelPreset,
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
import { profileTokenSummaryText } from './profile-token-summary.js';
import type { AveragePerfView } from './message-perf.js';
import { PROFILE_ACTIVITY_WEEKS } from './profile-cards-builtins.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { DmComposerUsagePopover } from './dm-composer-usage.js';
import { BotPromptViewer, type BotPromptView } from './bot-prompt-viewer.js';
import { ComposerContextBar, type ComposerFooterHandle } from './composer-context-bar.js';
import { ChipButton } from './ds/chip-button.js';
import { EngineBrandIcon, ModelBrandIcon, modelBrand, modelShortName } from './model-brand.js';
import {
  ModelMenu,
  catalogMenuItems,
  groupMenuId,
  groupMenuKey,
  presetMenuId,
  presetMenuItems,
} from './model-menu.js';
import { ContextRing } from './context-ring.js';

const styles = stylex.create({});

const subscribeUnavailable = (): (() => void) => () => {};
const unavailableSnapshot = () => undefined;

const compactTokens = new Intl.NumberFormat('en', {
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function useDmComposerContext({
  scopeKey,
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
  scopeKey?: string | undefined;
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
    kind: 'model' | 'workspace';
  }>(scopeKey ?? channelId);
  const subscribePlans = useCallback(
    (listener: () => void) => subscribeModelPlans(listener, actions),
    [actions],
  );
  const plan = useSyncExternalStore(
    subscribePlans,
    () => modelPlanOf(bot?.slug, actions),
    () => modelPlanOf(bot?.slug, actions),
  );
  const [modelData, setModelData] = useScopedState<{
    slug: string;
    catalog: ModelCatalogView;
    presets?: ModelPresetView[];
    state: ModelPlanStateView;
    inheritedRoute?: ModelRouteView;
    unavailable?: boolean;
  }>(scopeKey ?? channelId);
  const [modelBusy, setModelBusy] = useScopedState(scopeKey ?? channelId, false);
  const [modelError, setModelError] = useScopedState<string | undefined>(
    scopeKey ?? channelId,
    undefined,
  );
  const companionState = useSyncExternalStore(
    companion?.subscribe ?? subscribeUnavailable,
    companion?.getSnapshot ?? unavailableSnapshot,
    companion?.getSnapshot ?? unavailableSnapshot,
  );
  const modelHost = useMessageHost()?.client;
  const modelSlug = bot === undefined || bot.deleted ? undefined : bot.slug;
  const modelMount = useMountedResource<HTMLSpanElement>(() => {
    if (modelSlug === undefined) return;
    let active = true;
    let generation = 0;
    let hasGroup = false;
    const refresh = (): void => {
      const current = ++generation;
      setModelData(undefined);
      void actions
        .modelPlanState(modelSlug)
        .then(async (state) => {
          if (!active || current !== generation) return;
          rememberModelPlan(modelSlug, state?.plan, actions);
          const [catalog, presets] = await Promise.all([
            actions.modelCatalog(),
            Promise.resolve()
              .then(() => actions.modelPresets())
              .catch((): ModelPresetView[] => []),
          ]);
          if (!active || current !== generation) return;
          hasGroup =
            (state?.plan === undefined
              ? catalog.defaultGroupId
              : state.plan.orchestratorGroupId) !== undefined;
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
            presets,
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
      if (modelPlanOf(modelSlug, actions) === undefined) refresh();
    }, actions);
    const stop = observeResource(
      (change) => change.resource === 'bot-context' && change.slug === modelSlug,
      async () => {
        if (!hasGroup) return;
        const current = generation;
        const state = await actions.modelPlanState(modelSlug);
        if (!active || current !== generation) return;
        setModelData((value) =>
          value?.slug !== modelSlug ? value : { ...value, state: state ?? value.state },
        );
      },
      undefined,
      undefined,
      false,
      modelHost,
    );
    return () => {
      active = false;
      stop();
      unsubscribe();
    };
  }, [actions, channelId, modelSlug, plan?.revision, modelHost]);
  if (bot === undefined || bot.deleted || channelId === undefined) return;
  const data = modelData?.slug === bot.slug ? modelData : undefined;
  const catalog = data?.catalog;
  const planState = data?.state;
  const modelStatus: 'loading' | 'ready' | 'unavailable' =
    data === undefined
      ? plan?.orchestrator === undefined
        ? 'loading'
        : 'ready'
      : data.unavailable === true || data.state.repair !== undefined
        ? 'unavailable'
        : 'ready';
  const selected = companion?.get(bot.slug) !== undefined;
  const ready = companionState?.ready === true;
  const slug = bot.slug;
  const open = (kind: 'model' | 'workspace') => setPanel({ slug, kind });
  const route = plan?.orchestrator ?? data?.inheritedRoute;
  const defaultEffort = t('modelPreset.providerDefault');
  const applyModelRoute = (route: ModelRouteView): void => {
    if (planState === undefined || modelBusy) return;
    setModelBusy(true);
    void applyBotModelRoute(actions, slug, planState, route)
      .then((next) =>
        setModelData((current) =>
          current?.slug === slug && (current.state.revision ?? 0) <= next.revision
            ? { ...current, state: { revision: next.revision, plan: next } }
            : current,
        ),
      )
      .catch((failure: unknown) => {
        setModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
      })
      .finally(() => setModelBusy(false));
  };
  const applyModelGroup = (groupId: string): void => {
    if (planState === undefined || modelBusy) return;
    setModelBusy(true);
    void applyBotModelGroup(actions, slug, planState, groupId)
      .then((next) =>
        setModelData((current) =>
          current?.slug === slug && (current.state.revision ?? 0) <= next.revision
            ? { ...current, state: { revision: next.revision, plan: next } }
            : current,
        ),
      )
      .catch((failure: unknown) => {
        setModelError(t('modelPreset.changeFailed', { error: errorMessage(failure) }));
      })
      .finally(() => setModelBusy(false));
  };
  const applyModelPresetChoice = (presetId: string): void => {
    if (planState === undefined || modelBusy) return;
    setModelBusy(true);
    void applyBotModelPreset(actions, slug, presetId)
      .then((next) =>
        setModelData((current) =>
          current?.slug === slug && (current.state.revision ?? 0) <= next.revision
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
          key={scopeKey ?? bot.slug}
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
          groups={catalog?.groups ?? []}
          presets={data?.presets ?? []}
          sourcePresetId={plan?.sourcePresetId}
          groupId={plan == null ? catalog?.defaultGroupId : plan.orchestratorGroupId}
          currentTarget={planState?.currentTarget}
          modelStatus={modelStatus}
          route={route}
          modelBusy={modelBusy || planState === undefined || modelStatus !== 'ready'}
          onChooseModel={applyModelRoute}
          onChooseGroup={applyModelGroup}
          onChoosePreset={applyModelPresetChoice}
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
  groups,
  presets,
  sourcePresetId,
  groupId,
  currentTarget,
  modelStatus,
  route,
  modelBusy,
  onChooseModel,
  onChooseGroup,
  onChoosePreset,
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
  onOpen(kind: 'model' | 'workspace'): void;
  panel: 'model' | 'workspace' | undefined;
  onClose(): void;
  models: readonly ModelCatalogEntryView[];
  groups: readonly ModelCatalogGroupView[];
  presets: readonly ModelPresetView[];
  sourcePresetId: string | undefined;
  groupId: string | undefined;
  currentTarget: TurnTarget | undefined;
  modelStatus: 'loading' | 'ready' | 'unavailable';
  route: ModelRouteView | undefined;
  modelBusy: boolean;
  onChooseModel(route: ModelRouteView): void;
  onChooseGroup(groupId: string): void;
  onChoosePreset(presetId: string): void;
}): ReactElement {
  const modelTrigger = useRef<HTMLButtonElement>(null);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [grants, setGrants] = useState<WorkspaceGrantView[]>();
  const [grantError, setGrantError] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [inspect, setInspect] = useState<{ slug: string; view: BotPromptView }>();
  const [reading, setContext] = useState<{
    slug: string;
    value: Awaited<ReturnType<BridgeActions['botContext']>>;
  }>();
  const context = reading?.slug === bot.slug ? reading.value : undefined;
  const usageTrigger = useRef<HTMLButtonElement | null>(null);
  const host = useMessageHost()?.client;
  const usageMount = useMountedResource<HTMLButtonElement>(
    (node) => {
      usageTrigger.current = node;
      let active = true;
      const stop = observeHostResource(
        (change) => change.resource === 'bot-context' && change.slug === bot.slug,
        async () => {
          const value = await actions.botContext(bot.slug);
          if (active) setContext({ slug: bot.slug, value });
        },
        host,
      );
      return () => {
        active = false;
        stop();
        usageTrigger.current = null;
        setUsageOpen(false);
      };
    },
    [actions, bot.slug, host],
  );
  const subscribeGrants = useCallback(
    (listener: () => void) => subscribeWorkspaceGrantChanges(bot.slug, listener, actions),
    [bot.slug, actions],
  );
  const revision = useSyncExternalStore(
    subscribeGrants,
    () => workspaceGrantRevision(bot.slug, actions),
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
  const brand = modelBrand({ provider: route?.provider, model: route?.model, name: modelName });
  const runner = bot.orchestratorRunner;
  const runnerBrand =
    runner === undefined
      ? undefined
      : modelBrand({
          provider: runner.engine,
          model: runner.model ?? runner.engine,
          name: runner.model ?? runner.displayName,
        });
  const runnerChipLabel =
    runner === undefined
      ? ''
      : runner.model === undefined
        ? runner.displayName
        : modelShortName(runner.model, runnerBrand);
  const runnerLabel =
    runner === undefined
      ? ''
      : runner.account === undefined
        ? t('composerContext.runner', { engine: runner.displayName })
        : t('composerContext.runnerAccount', {
            engine: runner.displayName,
            account: runner.account,
          });
  const currentEntry = models.find(
    (entry) => entry.provider === route?.provider && entry.model === route?.model,
  );
  const group = groups.find((entry) => entry.id === groupId);
  const executed =
    group === undefined || currentTarget === undefined
      ? undefined
      : turnTargetLabel(currentTarget, models);
  const chipName = executed?.name ?? (group === undefined ? modelLabel : group.name);
  const modelEfforts =
    currentEntry === undefined || group !== undefined
      ? undefined
      : [
          { value: '', label: t('modelPreset.providerDefault') },
          ...currentEntry.efforts
            .filter((effort) => effort.id !== '')
            .map((effort) => ({ value: effort.id, label: effort.name })),
        ];
  const modelChipLabel =
    modelStatus === 'unavailable' || (modelName ?? route?.model) === undefined
      ? modelLabel
      : modelShortName(modelLabel, brand);
  const chipLabel = executed?.short ?? group?.name ?? modelChipLabel;
  const workspaceCount = grantError || grants === undefined ? undefined : String(grants.length);
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
  const shortTokens = (tokens: number) => compactTokens.format(tokens);
  const usageShare =
    context === undefined || context.usedTokens === null || context.contextWindow <= 0
      ? undefined
      : `${String(Math.min(100, Math.round((context.usedTokens / context.contextWindow) * 100)))}%`;
  const compactUsage =
    context === undefined
      ? '— / —'
      : t('composerContext.contextWindow', {
          used: context.usedTokens === null ? '?' : shortTokens(context.usedTokens),
          capacity: shortTokens(context.contextWindow),
        });
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
            icon={
              <ContextRing
                used={context?.usedTokens ?? null}
                capacity={context?.contextWindow ?? 0}
                threshold={context?.thresholdTokens}
              />
            }
            label={usageShare ?? compactUsage}
            onClick={() => setUsageOpen((open) => !open)}
            aria-label={`${compactUsage}. ${usageLabel}`}
            title={`${compactUsage}. ${usageLabel}`}
            aria-haspopup="dialog"
            aria-expanded={usageOpen}
          />
        }
      >
        {runner === undefined ? (
          <ChipButton
            data-composer-chip="model"
            collapseLabel
            icon={
              executed?.external ? (
                <EngineBrandIcon brand={executed.brand} />
              ) : (
                <ModelBrandIcon
                  brand={executed?.brand ?? (group === undefined ? brand : undefined)}
                />
              )
            }
            label={chipLabel}
            title={[
              group?.name === chipName ? undefined : group?.name,
              chipName,
              executed?.external ? t('engine.externalLabel') : undefined,
            ]
              .filter(Boolean)
              .join(' · ')}
            ref={modelTrigger}
            onClick={() =>
              modelStatus === 'unavailable' || models.length === 0
                ? onOpen('model')
                : setModelMenuOpen((open) => !open)
            }
            aria-haspopup="dialog"
            aria-expanded={modelMenuOpen}
            aria-label={`${t('entry.model')} · ${bot.displayName} · ${chipName}`}
          />
        ) : (
          <ChipButton
            data-composer-chip="model"
            data-runner={runner.engine}
            collapseLabel
            icon={<EngineBrandIcon brand={runnerBrand} />}
            label={runnerChipLabel}
            title={runner.model === undefined ? runnerLabel : `${runnerLabel} · ${runner.model}`}
            tabIndex={-1}
            disabled
            aria-label={`${t('entry.model')} · ${bot.displayName} · ${runnerLabel}`}
          />
        )}
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
          label={workspaceCount ?? workspaceLabel}
          title={workspaceLabel}
          onClick={() => onOpen('workspace')}
          aria-label={`${t('entry.workspaceGrants')} · ${bot.displayName} · ${workspaceLabel}`}
        />
      </ComposerContextBar>
      {modelMenuOpen ? (
        <ModelMenu
          label={`${t('entry.model')} · ${bot.displayName}`}
          items={[
            ...presetMenuItems(presets, models, groups, sourcePresetId || undefined, t),
            ...catalogMenuItems(
              models,
              t,
              groups,
              groupId === undefined || currentTarget === undefined
                ? undefined
                : { groupId, target: currentTarget },
            ),
          ]}
          value={
            group !== undefined
              ? groupMenuKey(group.id)
              : route === undefined
                ? ''
                : JSON.stringify([route.provider, route.model])
          }
          onSelect={(key) => {
            const chosenPreset = presetMenuId(key);
            if (chosenPreset !== undefined) {
              if (!modelBusy) onChoosePreset(chosenPreset);
              return;
            }
            const chosenGroup = groupMenuId(key);
            if (chosenGroup !== undefined) {
              if (!modelBusy && chosenGroup !== group?.id) onChooseGroup(chosenGroup);
              return;
            }
            const entry = models.find(
              (item) => JSON.stringify([item.provider, item.model]) === key,
            );
            if (entry === undefined || modelBusy) return;
            const same =
              group === undefined &&
              entry.provider === route?.provider &&
              entry.model === route.model;
            const reasoningEffort = same ? route.reasoningEffort : entry.defaultEffort;
            onChooseModel({
              provider: entry.provider,
              model: entry.model,
              ...(reasoningEffort === undefined || reasoningEffort === ''
                ? {}
                : { reasoningEffort }),
            });
          }}
          busy={modelBusy}
          efforts={modelEfforts}
          effort={route?.reasoningEffort ?? ''}
          onEffort={(effort) => {
            if (route === undefined || modelBusy) return;
            onChooseModel({
              provider: route.provider,
              model: route.model,
              ...(effort === '' ? {} : { reasoningEffort: effort }),
            });
          }}
          onSettings={() => onOpen('model')}
          anchorRef={modelTrigger}
          onClose={() => setModelMenuOpen(false)}
          t={t}
        />
      ) : null}
      {usageOpen ? (
        <DmComposerUsagePopover
          context={context}
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
          onInspect={(view) => {
            setUsageOpen(false);
            setInspect({ slug: bot.slug, view });
          }}
        />
      ) : null}
      {inspect?.slug === bot.slug ? (
        <BotPromptViewer
          slug={bot.slug}
          displayName={bot.displayName}
          view={inspect.view}
          actions={actions}
          t={t}
          onClose={() => setInspect(undefined)}
        />
      ) : null}
      {panel === 'model' ? (
        <ModelPresetProfile
          key={bot.slug}
          slug={bot.slug}
          actions={actions}
          t={t}
          onClose={onClose}
        />
      ) : panel === 'workspace' ? (
        <PanelDialog
          size="medium"
          fill
          title={`${t('entry.workspaceGrants')} · ${bot.displayName}`}
          closeLabel={t('approval.cancel')}
          onClose={onClose}
        >
          <WorkspaceGrantsEntry
            scope="personabot"
            channelId={channelId}
            botSlug={bot.slug}
            botName={bot.displayName}
            actions={actions}
            t={t}
            composerOnly
          />
        </PanelDialog>
      ) : null}
    </>
  );
}
