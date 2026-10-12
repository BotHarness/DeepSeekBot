import { useState, useSyncExternalStore, type ReactElement } from 'react';
import { Button, Checkbox, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import type { TutorialAction } from '../../../core/src/onboarding/types.js';
import type { BridgeActions } from './actions.js';
import { PersonaBotAvatar } from './avatar.js';
import { BotBannerArt, bannerOf } from './bot-banner.js';
import type { ModelCatalogEntryView, ModelRouteView } from './bridge.js';
import { errorMessage } from './bridge.js';
import { ModelPicker } from './model-picker.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { Modal } from './modal.js';
import { OnboardingMemory } from './onboarding-memory.js';
import { OnboardingAppBinding } from './onboarding-binding.js';
import { openModelsSettings } from './bot-settings-open.js';
import type { BotHarnessKey, BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { onboardingFor, requestBotCreation } from './onboarding.js';
import { store } from './store.js';
import type { WindowCompanions } from './window-companions.js';
import { startInternalTour, type InternalTourSpec } from './internal-tour.js';
import { OnboardingChecklist, markBotModeEntered } from './onboarding-checklist-view.js';
import { checklistSettled } from './onboarding-checklist.js';

export function OnboardingModelDialog({
  actions,
  slug,
  title,
  onClose,
  onConfirm,
  t,
  globalOnly = false,
  request,
}: {
  actions: BridgeActions;
  slug?: string;
  title: string;
  onClose(): void;
  onConfirm(route: ModelRouteView, globalDefault: boolean, revision: number): Promise<void>;
  t: BotHarnessTranslate;
  globalOnly?: boolean;
  request?: string | undefined;
}): ReactElement {
  const [models, setModels] = useState<ModelCatalogEntryView[]>([]);
  const [route, setRoute] = useState<ModelRouteView>();
  const [revision, setRevision] = useState(0);
  const [globalDefault, setGlobalDefault] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [loaded, setLoaded] = useState(false);
  const load = async (): Promise<void> => {
    setError(undefined);
    try {
      const [catalog, state] = await Promise.all([
        actions.modelCatalog(),
        slug ? actions.modelPlanState(slug) : Promise.resolve(undefined),
      ]);
      setModels(catalog.models);
      setRevision(state?.revision ?? state?.plan?.revision ?? 0);
      const selected = state?.plan?.orchestrator ?? catalog.default;
      setRoute(
        (previous) =>
          previous ??
          selected ??
          (catalog.models.find((model) => model.credential === undefined)
            ? {
                provider: catalog.models.find((model) => model.credential === undefined)!.provider,
                model: catalog.models.find((model) => model.credential === undefined)!.model,
              }
            : undefined),
      );
      setLoaded(true);
    } catch (cause) {
      setError(errorMessage(cause));
    }
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    void load();
  }, [actions, slug]);
  const selected = models.find(
    (model) => model.provider === route?.provider && model.model === route.model,
  );
  const confirm = async (): Promise<void> => {
    if (!route || busy || !selected || selected.credential !== undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      await onConfirm(route, globalDefault, revision);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      title={title}
      closeLabel={t('common.close')}
      onClose={onClose}
      footer={
        <Button
          variant="primary"
          disabled={busy || !selected || selected.credential !== undefined}
          onClick={() => void confirm()}
        >
          {t(globalOnly ? 'onboarding.saveDefault' : 'onboarding.saveModel')}
        </Button>
      }
    >
      <div ref={mount} className="bh-root bh-onboarding-model-form">
        {request ? (
          <div className="bh-onboarding-request">
            <span className="bh-note">{t('onboarding.requestLabel')}</span>
            <p>{request}</p>
          </div>
        ) : null}
        <ModelPicker
          title={t('onboarding.model')}
          hint={t(globalOnly ? 'onboarding.defaultDescription' : 'onboarding.modelHint')}
          choice={{
            key: route ? JSON.stringify([route.provider, route.model]) : '',
            effort: route?.reasoningEffort ?? '',
          }}
          catalog={models}
          options={models.map((model) => ({
            value: JSON.stringify([model.provider, model.model]),
            label: model.modelName,
            hint: model.providerName + (model.credential ? ' · ' + t('onboarding.needsKey') : ''),
          }))}
          onChange={({ key, effort }) => {
            const [provider, model] = JSON.parse(key) as [string, string];
            setRoute({ provider, model, ...(effort ? { reasoningEffort: effort } : {}) });
          }}
          disabled={busy}
          t={t}
        />
        {!loaded ? <p role="status">{t('modelPreset.loading')}</p> : null}
        <SidebarCardList label={t('failure.openModels')}>
          <SidebarCardRow
            icon="settings"
            title={t('failure.openModels')}
            meta={
              selected?.credential || (loaded && models.length === 0)
                ? t('onboarding.keyHint')
                : t('onboarding.providerSettingsHint')
            }
            disabled={busy}
            onClick={() => {
              onClose();
              openModelsSettings();
            }}
          />
        </SidebarCardList>
        <Button variant="ghost" disabled={busy} onClick={() => void load()}>
          {t('onboarding.refreshModels')}
        </Button>
        <div className="bh-onboarding-model-scope">
          {!globalOnly ? (
            <Checkbox
              checked={globalDefault}
              onChange={setGlobalDefault}
              label={t('onboarding.globalCheckbox')}
              disabled={busy}
            />
          ) : null}
          <p className="bh-note">{t('onboarding.globalHint')}</p>
        </div>
        {error ? (
          <p role="alert" className="bh-error">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function OnboardingWelcome({
  actions,
  channelId,
  t,
}: {
  actions: BridgeActions;
  channelId: string;
  t: BotHarnessTranslate;
}): ReactElement {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const client = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const channel =
    client.channels.find((candidate) => candidate.id === channelId) ??
    (client.conversation.channel?.id === channelId ? client.conversation.channel : undefined);
  const botSlug = channel?.botSlug;
  const bot =
    botSlug === undefined ? undefined : client.bots.find((entry) => entry.slug === botSlug);
  const botName = bot?.displayName ?? botSlug ?? t('onboarding.letter.defaultName');
  const [modelLabel, setModelLabel] = useState('');
  const [timeZone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
    } catch {
      return undefined;
    }
  });
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    void Promise.all([
      actions.modelCatalog(),
      botSlug ? actions.modelPlanState(botSlug) : Promise.resolve(undefined),
    ])
      .then(([catalog, plan]) => {
        const route = plan?.plan?.orchestrator ?? catalog.default;
        const model = catalog.models.find(
          (entry) => entry.provider === route?.provider && entry.model === route.model,
        );
        if (active)
          setModelLabel(
            route
              ? `${model?.modelName ?? route.model} · ${model?.providerName ?? route.provider}`
              : t('modelPreset.noPlan'),
          );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [actions, botSlug, state.modelOpen]);
  return (
    <div ref={mount} className="bh-onboarding-welcome" data-onboarding-welcome>
      <div className="bh-welcome-banner" aria-hidden="true">
        <BotBannerArt banner={bannerOf(bot?.banner, botName)} />
      </div>
      <div className="bh-welcome-identity">
        <span className="bh-welcome-avatar">
          <PersonaBotAvatar
            t={t}
            personaBotId={botSlug ?? ''}
            name={botName}
            src={bot?.avatar}
            appearance={bot?.appearance}
            avatarSeed={bot?.avatarSeed}
            size={56}
            indicator={false}
            still
          />
        </span>
        <span className="bh-welcome-identity-text">
          <span className="bh-welcome-name">{botName}</span>
          <span className="bh-welcome-roles">
            <Tag tone="outline">{t('onboarding.letter.tag')}</Tag>
            {(bot?.roles ?? []).map((role) => (
              <Tag key={role} tone="neutral">
                {role}
              </Tag>
            ))}
          </span>
        </span>
      </div>
      <div className="bh-welcome-letter">
        <strong>{t('onboarding.letter.greeting', { name: botName })}</strong>
        <p>{t('onboarding.letter.body')}</p>
        <p className="bh-welcome-signature">{t('onboarding.letter.signature')}</p>
      </div>
      <SidebarCardList className="bh-message-card-list" label={t('onboarding.prompt')}>
        {(
          [
            'onboarding.firstRequest',
            state.receipt?.newsAvailable === true
              ? 'onboarding.newsRequest'
              : 'onboarding.exampleRequest',
            'onboarding.dailyRequest',
            'onboarding.testRequest',
          ] as const
        ).map((key) => {
          const scheduled = key === 'onboarding.testRequest' || key === 'onboarding.dailyRequest';
          const prefix = key === 'onboarding.dailyRequest' ? 'daily' : 'reminder';
          return (
            <SidebarCardRow
              key={key}
              title={t(key)}
              meta={
                scheduled
                  ? timeZone
                    ? t(`onboarding.${prefix}Hint`, { timeZone })
                    : t('onboarding.reminderUnknownHint')
                  : undefined
              }
              disabled={state.busy || store.getSnapshot().conversation.sending}
              onClick={() =>
                void controller.request(
                  channelId,
                  scheduled
                    ? timeZone
                      ? t(`onboarding.${prefix}Body`, { timeZone })
                      : t(`onboarding.${prefix}UnknownBody`)
                    : key === 'onboarding.newsRequest'
                      ? t('onboarding.newsBody')
                      : t(key),
                )
              }
            />
          );
        })}
      </SidebarCardList>
      <p className="bh-note">{t('onboarding.freeform')}</p>
      <SidebarCardList className="bh-message-card-list" label={t('onboarding.model')}>
        <SidebarCardRow
          icon="bot"
          title={t('onboarding.chooseModel')}
          meta={modelLabel || t('modelPreset.loading')}
          disabled={state.busy}
          dialog
          onClick={() => {
            if (botSlug) controller.chooseModel(channelId, botSlug);
          }}
        />
      </SidebarCardList>
      <div className="bh-onboarding-actions">
        {state.pending?.channelId === channelId ? (
          <Button variant="outline" onClick={() => controller.reviewPending()}>
            {t('onboarding.unsent')}
          </Button>
        ) : null}
        <Button variant="outline" className="bh-onboarding-create" onClick={requestBotCreation}>
          {t('roster.menu.createBot')}
        </Button>
        <OnboardingMemory key={channelId} actions={actions} channelId={channelId} t={t} />
        <OnboardingAppBinding
          key={`binding-${channelId}`}
          actions={actions}
          channelId={channelId}
          t={t}
        />
      </div>
      <p className="bh-welcome-provenance">{t('onboarding.productMessage')}</p>
    </div>
  );
}

function onboardingTourSteps(t: BotHarnessTranslate): InternalTourSpec[] {
  return [
    {
      selector: '[data-onboarding-welcome]',
      title: t('onboarding.tour.welcome.title'),
      description: t('onboarding.tour.welcome.hint'),
    },
    {
      selector: '[data-bh-tour="roster"]',
      title: t('onboarding.tour.roster.title'),
      description: t('onboarding.tour.roster.hint'),
    },
    {
      selector: '[data-bh-tour="inbox"]',
      title: t('onboarding.tour.inbox.title'),
      description: t('onboarding.tour.inbox.hint'),
    },
    {
      selector: '[data-bh-tour="bot-settings"]',
      title: t('onboarding.tour.settings.title'),
      description: t('onboarding.tour.settings.hint'),
    },
    {
      selector: '[data-bh-tour="topbar"]',
      title: t('onboarding.tour.header.title'),
      description: t('onboarding.tour.header.hint'),
    },
    {
      selector: '[data-bh-tour="composer"]',
      title: t('onboarding.tour.composer.title'),
      description: t('onboarding.tour.composer.hint'),
    },
    {
      selector: '[data-bh-tour="channel-sidebar"]',
      title: t('onboarding.tour.sidebar.title'),
      description: t('onboarding.tour.sidebar.hint'),
    },
    {
      selector: '[data-bh-tour="companion"]',
      title: t('onboarding.tour.companion.title'),
      description: t('onboarding.tour.companion.hint'),
    },
    {
      selector: '[data-bh-tour="bot-mode"]',
      title: t('onboarding.tour.exit.title'),
      description: t('onboarding.tour.exit.hint'),
    },
  ];
}

export function OnboardingOverlay({
  actions,
  companion,
  t,
}: {
  actions: BridgeActions;
  companion?: WindowCompanions | undefined;
  t: BotHarnessTranslate;
}): ReactElement {
  const controller = onboardingFor(actions);
  controller.attachCompanion(companion);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const enter = (): Promise<void> =>
    controller.enter(companion).then(() => {
      void controller.refreshEvidence();
      const receipt = controller.getSnapshot().receipt;
      if (receipt !== undefined && !receipt.completed && receipt.tutorial === 'not-started')
        void controller.refresh(undefined, 'start', undefined, true);
    });
  const mount = useMountedResource<HTMLSpanElement>(() => {
    let active = true;
    let key = '';
    markBotModeEntered();
    void enter();
    const unsubscribe = store.subscribe(() => {
      const snapshot = store.getSnapshot();
      const channel = snapshot.conversation.channel;
      const next = `${channel?.id}:${snapshot.conversation.revision}:${snapshot.git?.available}`;
      if (!active || key === next || snapshot.mode !== 'bot') return;
      key = next;
      if (controller.getSnapshot().receipt && channel?.botSlug)
        void controller.refresh(channel.botSlug);
      else if (snapshot.git?.available && controller.getSnapshot().error === 'git-not-found')
        void controller.enter(companion);
    });
    const timer = setInterval(() => {
      if (active && store.getSnapshot().mode === 'bot' && !controller.getSnapshot().busy)
        void controller.refresh(store.getSnapshot().conversation.channel?.botSlug);
    }, 5000);
    const evidenceTimer = setInterval(() => {
      const snapshot = controller.getSnapshot();
      if (
        active &&
        store.getSnapshot().mode === 'bot' &&
        !checklistSettled(snapshot.receipt, snapshot.evidence)
      )
        void controller.refreshEvidence();
    }, 20_000);
    const unsubscribeCompanion = companion?.subscribe(() => controller.syncCompanionEvidence());
    return () => {
      active = false;
      controller.pauseGuide();
      controller.closeChecklist();
      unsubscribe();
      unsubscribeCompanion?.();
      clearInterval(timer);
      clearInterval(evidenceTimer);
    };
  }, [actions, companion]);
  const tourMount = useMountedResource<HTMLSpanElement>(() => {
    if (
      !state.guideOpen ||
      state.receipt?.tutorial !== 'active' ||
      state.modelOpen ||
      state.sendOpen
    )
      return;
    return startInternalTour(onboardingTourSteps(t), {
      closeLabel: t('common.close'),
      skipLabel: t('onboarding.skip'),
      previousLabel: t('onboarding.tour.previous'),
      nextLabel: t('onboarding.tour.next'),
      doneLabel: t('onboarding.tour.done'),
      onClosed: () => {
        controller.pauseGuide();
      },
      onFinished: () => {
        controller.finishTour();
      },
      onSkip: () => {
        void controller.refresh(undefined, 'skip');
      },
    });
  }, [
    state.guideOpen,
    state.receipt?.tutorial,
    state.receipt?.completed,
    state.modelOpen,
    state.sendOpen,
  ]);
  return (
    <>
      <span ref={mount} hidden aria-hidden="true" />
      <span ref={tourMount} hidden />
      <OnboardingChecklist actions={actions} t={t} />
      {state.error && !state.modelOpen && !state.sendOpen ? (
        <div role="alert" className="bh-root bh-onboarding-notice">
          <span className="bh-onboarding-notice-text">{state.error}</span>
          <Button variant="ghost" onClick={() => void enter()}>
            {t('onboarding.retryPrepare')}
          </Button>
        </div>
      ) : null}
      {state.modelOpen && state.modelTarget ? (
        <OnboardingModelDialog
          actions={actions}
          slug={state.modelTarget.slug}
          request={
            state.pending?.channelId === state.modelTarget.channelId
              ? state.pending.body
              : undefined
          }
          title={t('onboarding.modelTitle')}
          t={t}
          onClose={() => controller.closeModel()}
          onConfirm={(route, globalDefault, revision) =>
            controller.saveModel(route, globalDefault, revision)
          }
        />
      ) : null}
      {state.sendOpen && state.pending ? (
        <Modal
          open
          title={t('onboarding.sendTitle')}
          closeLabel={t('common.close')}
          onClose={() => controller.closeSend()}
          footer={
            <Button
              variant="primary"
              disabled={state.busy}
              onClick={() => void controller.sendPending()}
            >
              {t('onboarding.confirmSend')}
            </Button>
          }
        >
          <div className="bh-root bh-onboarding-model-form">
            <p className="bh-note">{t('onboarding.sendHint')}</p>
            <div className="bh-onboarding-request">
              <span className="bh-note">{t('onboarding.requestLabel')}</span>
              <p>{state.pending.body}</p>
            </div>
            <Button
              variant="outline"
              disabled={state.busy}
              onClick={() => controller.chooseModel(state.pending!.channelId, state.pending!.slug)}
            >
              {t('onboarding.chooseModel')}
            </Button>
            {state.error ? (
              <p role="alert" className="bh-error">
                {state.error}
              </p>
            ) : null}
          </div>
        </Modal>
      ) : null}
    </>
  );
}

export function OnboardingSetting({
  actions,
  closeBotSettings,
  t,
}: {
  actions: BridgeActions;
  closeBotSettings(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const controller = onboardingFor(actions);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  const receipt = state.receipt;
  const action: TutorialAction =
    receipt !== undefined && (receipt.completed || receipt.tutorial === 'skipped')
      ? 'restart'
      : receipt === undefined || receipt.tutorial === 'not-started'
        ? 'start'
        : 'continue';
  const label: BotHarnessKey =
    action === 'restart'
      ? 'onboarding.restart'
      : action === 'start'
        ? 'onboarding.start'
        : 'onboarding.continue';
  return (
    <div className="bh-settings-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('onboarding.settings.title')}</div>
        <div className="bh-settings-row-desc">{t('onboarding.settings.description')}</div>
      </div>
      <Button
        variant="outline"
        disabled={state.busy}
        onClick={() => {
          closeBotSettings();
          void controller.refresh(undefined, action, undefined, true);
        }}
      >
        {t(label)}
      </Button>
    </div>
  );
}

export function DefaultModelSettings({
  actions,
  t,
}: {
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const mount = useMountedResource<HTMLDivElement>(() => {
    void actions
      .modelCatalog()
      .then((catalog) =>
        setLabel(
          catalog.default
            ? `${catalog.default.provider} / ${catalog.default.model}`
            : t('modelPreset.noPlan'),
        ),
      );
  }, [actions]);
  return (
    <div ref={mount} className="bh-settings-row">
      <div className="bh-settings-row-text">
        <div className="bh-settings-row-title">{t('onboarding.defaultTitle')}</div>
        <div className="bh-settings-row-desc">{t('onboarding.defaultDescription')}</div>
      </div>
      <Button variant="outline" onClick={() => setOpen(true)}>
        {label || t('onboarding.model')}
      </Button>
      {open ? (
        <OnboardingModelDialog
          actions={actions}
          title={t('onboarding.defaultTitle')}
          t={t}
          globalOnly
          onClose={() => setOpen(false)}
          onConfirm={async (route) => {
            await actions.onboardingModel(undefined, 0, route, true);
            setLabel(`${route.provider} / ${route.model}`);
            setOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}
