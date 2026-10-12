import { useCallback, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import type { BridgeActions } from './actions.js';
import type { ModelRouteView, ProfileActivity, WorkspaceGrantView } from './bridge.js';
import type { ComposerContext } from './composer-shortcuts.js';
import type { BotSummary } from './store.js';
import type { BotHarnessTranslate } from './locale.js';
import type { WindowCompanions } from './window-companions.js';
import { ModelPresetProfile } from './model-preset-profile.js';
import { modelPlanOf, rememberModelPlan, subscribeModelPlans } from './model-plan-store.js';
import { Modal } from './modal.js';
import { useMountedResource } from './mounted-resource.js';
import { WorkspaceGrantsEntry } from './workspace-grants-entry.js';
import {
  subscribeWorkspaceGrantChanges,
  workspaceGrantRevision,
} from './workspace-grant-events.js';
import { profileTokenSummaryText } from './profile-token-summary.js';
import { PROFILE_ACTIVITY_WEEKS } from './profile-cards-builtins.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import { DmComposerUsagePopover } from './dm-composer-usage.js';

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
}: {
  bot: BotSummary | undefined;
  channelId: string | undefined;
  actions: BridgeActions;
  companion: WindowCompanions | undefined;
  activity: ProfileActivity | undefined;
  loading: boolean;
  t: BotHarnessTranslate;
  onUsage(): void;
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
  onOpen(kind: 'model' | 'workspace'): void;
  panel: 'model' | 'workspace' | undefined;
  onClose(): void;
}): ReactElement {
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
  const [grantError, setGrantError] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const usageTrigger = useRef<HTMLButtonElement>(null);
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
    setModelStatus('loading');
    void actions
      .modelPlanState(bot.slug)
      .then(async (state) => {
        if (!active) return;
        rememberModelPlan(bot.slug, state?.plan);
        if (state?.repair !== undefined) {
          setModelStatus('unavailable');
          return;
        }
        if (state?.plan === undefined) {
          const catalog = await actions.modelCatalog();
          if (!active) return;
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
        if (active) setModelStatus('unavailable');
      });
    return () => {
      active = false;
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
  const modelLabel =
    (modelStatus === 'unavailable'
      ? t('composerContext.unavailable')
      : (plan?.orchestrator?.model ??
        (inheritedRoute === undefined
          ? undefined
          : `${inheritedRoute.model} · ${t('onboarding.inherit')}`))) ??
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
      : t('composerContext.tokens', { count: profileTokenSummaryText(activity, t, true) });
  return (
    <>
      <div className="bh-composer-context" aria-label={t('composerContext.label')}>
        <div className="bh-composer-context-left">
          <button
            ref={modelMount}
            type="button"
            onClick={() => onOpen('model')}
            aria-label={`${t('entry.model')} · ${bot.displayName} · ${modelLabel}`}
          >
            <ChannelSidebarIcon name="cpu" size={14} />
            <span>{modelLabel}</span>
          </button>
          <button
            ref={grantMount}
            type="button"
            onClick={() => onOpen('workspace')}
            aria-label={`${t('entry.workspaceGrants')} · ${bot.displayName} · ${workspaceLabel}`}
          >
            <ChannelSidebarIcon name="folder-key" size={14} />
            <span>{workspaceLabel}</span>
          </button>
        </div>
        <button
          ref={usageTrigger}
          type="button"
          className="bh-composer-usage"
          onClick={() => setUsageOpen((open) => !open)}
          aria-label={usageLabel}
          aria-haspopup="dialog"
          aria-expanded={usageOpen}
        >
          <ChannelSidebarIcon name="ruler" size={14} />
          <span>{compactUsage}</span>
        </button>
      </div>
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
        <Modal
          open
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
        </Modal>
      )}
    </>
  );
}
