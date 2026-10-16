import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogEntryView,
  ModelRouteView,
  ProfileActivity,
  WorkspaceGrantView,
} from './bridge.js';
import type { ComposerContext } from './composer-shortcuts.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanions } from './window-companions.js';
import { ModelPresetProfile } from './model-preset-profile.js';
import { modelPlanOf, rememberModelPlan, subscribeModelPlans } from './model-plan-store.js';
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
import { useMobileBotViewport } from './mobile-viewport.js';
import { ComposerContextBar } from './composer-context-bar.js';
import { ChipButton } from './ds/chip-button.js';

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
  const [panel, setPanel] = useState<{ slug: string; kind: 'model' | 'workspace' }>();
  const companionState = useSyncExternalStore(
    companion?.subscribe ?? subscribeUnavailable,
    companion?.getSnapshot ?? unavailableSnapshot,
    companion?.getSnapshot ?? unavailableSnapshot,
  );
  if (bot === undefined || bot.deleted || channelId === undefined) return;
  const selected = companion?.get(bot.slug) !== undefined;
  const ready = companionState?.ready === true;
  const open = (kind: 'model' | 'workspace') => setPanel({ slug: bot.slug, kind });
  return {
    target: bot.slug,
    shortcuts: [
      {
        id: 'model',
        label: t('entry.model'),
        icon: <ChannelSidebarIcon name="cpu" />,
        run: () => open('model'),
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
    ],
    content: (
      <DmComposerContextView
        key={bot.slug}
        bot={bot}
        channelId={channelId}
        actions={actions}
        activity={activity?.slug === bot.slug ? activity : undefined}
        loading={loading}
        t={t}
        onUsage={onUsage}
        avgPerf={avgPerf}
        onOpen={open}
        panel={panel?.slug === bot.slug ? panel.kind : undefined}
        onClose={() => setPanel(undefined)}
      />
    ),
  };
}

function DmComposerContextView({
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
}: {
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
}): ReactElement {
  const mobile = useMobileBotViewport();
  const plan = useSyncExternalStore(
    subscribeModelPlans,
    () => modelPlanOf(bot.slug),
    () => modelPlanOf(bot.slug),
  );
  const [modelStatus, setModelStatus] = useState<'loading' | 'ready' | 'unavailable'>(
    plan === undefined ? 'loading' : 'ready',
  );
  const [grants, setGrants] = useState<WorkspaceGrantView[]>();
  const [inheritedRoute, setInheritedRoute] = useState<ModelRouteView>();
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
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
  const modelMount = useMountedResource<HTMLButtonElement>(() => {
    let active = true;
    let generation = 0;
    const refresh = (): void => {
      const current = ++generation;
      setModelStatus('loading');
      void actions
        .modelPlanState(bot.slug)
        .then(async (state) => {
          if (!active || current !== generation) return;
          rememberModelPlan(bot.slug, state?.plan);
          if (state?.repair !== undefined) {
            setModelStatus('unavailable');
            return;
          }
          const catalog = await actions.modelCatalog();
          if (!active || current !== generation) return;
          setModels(catalog.models);
          if (state?.plan === undefined) {
            const route = catalog.default;
            setInheritedRoute(
              route !== undefined &&
                catalog.models.some(
                  (entry) =>
                    entry.provider === route.provider &&
                    entry.model === route.model &&
                    entry.credential === undefined,
                )
                ? route
                : undefined,
            );
          } else setInheritedRoute(undefined);
          setModelStatus('ready');
        })
        .catch(() => {
          if (active && current === generation) setModelStatus('unavailable');
        });
    };
    refresh();
    const unsubscribe = subscribeModelPlans(() => {
      if (modelPlanOf(bot.slug) === undefined) refresh();
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [actions, bot.slug, plan?.revision]);
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
  const route = plan?.orchestrator ?? inheritedRoute;
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
        t={t}
        compact={mobile}
        label={t('composerContext.label')}
        trailing={
          mobile ? null : (
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
          )
        }
      >
        <ChipButton
          ref={modelMount}
          data-composer-chip="model"
          icon={<ChannelSidebarIcon name="cpu" size={14} />}
          label={modelLabel}
          title={modelLabel}
          onClick={() => onOpen('model')}
          aria-label={`${t('entry.model')} · ${bot.displayName} · ${modelLabel}`}
        />
        {mobile || avgPerf === undefined ? null : (
          <ChipButton
            data-composer-chip="avg-perf"
            icon={<ChannelSidebarIcon name="gauge" size={14} />}
            label={`${avgPerf.estimated ? '≈ ' : ''}${t('composerContext.avgPerf', { tps: avgPerf.tokensPerSecond })}`}
            title={t('composerContext.avgPerf.title', { count: avgPerf.count })}
            tabIndex={-1}
            disabled
          />
        )}
        {mobile ? null : (
          <ChipButton
            ref={grantMount}
            data-composer-chip="workspace"
            icon={<ChannelSidebarIcon name="folder-key" size={14} />}
            label={workspaceLabel}
            onClick={() => onOpen('workspace')}
            aria-label={`${t('entry.workspaceGrants')} · ${bot.displayName} · ${workspaceLabel}`}
          />
        )}
      </ComposerContextBar>
      {!mobile && usageOpen ? (
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
          title={`${t(panel === 'model' ? 'entry.model' : 'entry.workspaceGrants')} · ${bot.displayName}`}
          closeLabel={t('approval.cancel')}
          onClose={onClose}
        >
          {panel === 'model' ? (
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
