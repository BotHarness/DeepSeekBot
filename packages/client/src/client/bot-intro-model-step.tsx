import { providerBrand } from '@botharness/host-client/shared/model-brand';
import type { ModelProvidersView } from '@botharness/host-client/model-providers';
import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import { Button } from './ds/button.js';
import { ChoiceButton } from './ds/choice-button.js';
import { ReadFailure } from './ds/read-failure.js';
import { bridgeHost, type BridgeCall } from './bridge.js';
import { engineModelKey, useSubscriptionEngines } from './engine-choice.js';
import { engineName } from './session-engine.js';
import { engineMenuItems } from './model-menu.js';
import { ModelBrandIcon } from './model-brand.js';
import { AddModelProvider, ModelProviderSubscriptions } from './model-providers-settings.js';
import { canManageModelProviders } from './team-bridge.js';
import { useState, type Dispatch, type ReactElement, type SetStateAction } from 'react';
import * as stylex from '@stylexjs/stylex';
import type { BridgeActions } from './actions.js';
import { errorMessage, type ModelCatalogView, type ModelRouteView } from './bridge.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import { space as tobsSpace } from './ds/tobs.stylex.js';
import { ModelPicker } from './model-picker.js';
import { refreshTeamMode, useTeamModeRead } from './team-state.js';
import type { BotHarnessTranslate } from './locale.js';
import { useMountedResource } from './mounted-resource.js';
import { invalidateInheritedModelPlans } from './model-plan-store.js';
import { observeResource } from './messaging-defaults-live.js';
import { onboardingFor } from './onboarding.js';
import { styles as stepStyles } from './bot-intro-step-styles.js';

const styles = stylex.create({
  modelForm: {
    display: 'grid',
    gap: space.x5,
    minWidth: 0,
    lineHeight: text.bodyLine,
  },
  choices: {
    display: 'flex',
    flexDirection: 'column',
    gap: tobsSpace.x2,
  },
  providers: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: tobsSpace.x2,
  },
  provider: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: tobsSpace.x1,
    minWidth: 0,
    overflowWrap: 'anywhere',
  },
  advanced: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    padding: space.x4,
    borderRadius: radius.lg,
    backgroundColor: color.surface,
  },
  advancedSummary: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    cursor: 'pointer',
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
});

export interface ModelStepBinding {
  keyForm: boolean;
  canAdvance: boolean;
  save(): Promise<boolean>;
}

export interface ModelStepDraft {
  route?: ModelRouteView | undefined;
  subscription?: SubscriptionModel | null;
  assignment?: ModelRouteView | undefined;
  advanced: boolean;
}

export const EMPTY_MODEL_DRAFT: ModelStepDraft = { advanced: false };

export function ModelStep({
  actions,
  call,
  member,
  t,
  draft: [{ route: draftRoute, subscription, assignment, advanced }, setDraft],
  bind,
  saving,
  onProviderSavingChange,
  openProviders,
}: {
  actions: BridgeActions;
  call: BridgeCall | undefined;
  member: boolean;
  t: BotHarnessTranslate;
  draft: [ModelStepDraft, Dispatch<SetStateAction<ModelStepDraft>>];
  bind(model: ModelStepBinding | undefined): void;
  saving: boolean;
  onProviderSavingChange(saving: boolean): void;
  openProviders: (() => void) | undefined;
}): ReactElement {
  const viewerRead = useTeamModeRead(call);
  const viewer = viewerRead.value?.viewer;
  const [retryingViewer, setRetryingViewer] = useState(false);
  const owner = call === undefined ? !member : viewer?.owner;
  const canConnect = canManageModelProviders(viewer);
  const engines = useSubscriptionEngines(viewer?.owner === true);
  const [catalog, setCatalog] = useState<ModelCatalogView>();
  const [planned, setPlanned] = useState<string>();
  const [connection, setConnection] = useState<'key' | 'subscription'>();
  const [readError, setReadError] = useState<string>();
  const [saveError, setSaveError] = useState<string>();
  const [refresh, setRefresh] = useState(0);
  const editingKey = canConnect && connection === 'key' && call !== undefined;
  const reload = () => setRefresh((count) => count + 1);
  const mount = useMountedResource<HTMLDivElement>(() => {
    let active = true;
    const stop = observeResource(
      'model-providers',
      async () => {
        try {
          const next = await actions.modelCatalog();
          if (active) {
            setCatalog(next);
            setReadError(undefined);
          }
        } catch (cause) {
          if (active) setReadError(errorMessage(cause));
        }
      },
      undefined,
      undefined,
      true,
    );
    return () => {
      active = false;
      stop();
    };
  }, [actions, refresh]);

  const models = (catalog?.models ?? []).filter((model) => model.credential === undefined);
  const usableRoute = (route: ModelRouteView | undefined): ModelRouteView | undefined => {
    if (route === undefined) return undefined;
    const entry = models.find(
      (model) => model.provider === route.provider && model.model === route.model,
    );
    if (entry === undefined || entry.restingUntil !== undefined) return undefined;
    return route.reasoningEffort === undefined ||
      entry.efforts.some(({ id }) => id === route.reasoningEffort)
      ? route
      : { provider: route.provider, model: route.model };
  };
  const first = models.find((model) => model.restingUntil === undefined);
  const route =
    usableRoute(draftRoute) ??
    usableRoute(catalog?.default) ??
    (first === undefined ? undefined : { provider: first.provider, model: first.model });
  const tob = onboardingFor(actions).getSnapshot().receipt?.defaultBotSlug;
  const availableEngines = owner
    ? (engines.view?.engines.filter((engine) => engine.available) ?? [])
    : [];
  const savedEngine = engines.view?.selections.find(
    (choice) => choice.botSlug === tob && choice.role === 'orchestrator',
  );
  const [firstEngine] = availableEngines;
  const subscriptionKey = (choice: SubscriptionModel) =>
    engineModelKey(choice.engine, choice.accountId);
  const draftEngine =
    subscription == null
      ? undefined
      : availableEngines.find((entry) => subscriptionKey(entry) === subscriptionKey(subscription));
  const draftEngineModels =
    draftEngine === undefined ? undefined : engines.models[subscriptionKey(draftEngine)];
  const draftEngineModel = draftEngineModels?.find(({ id }) => id === subscription?.model);
  const unavailableSubscription =
    owner === true &&
    subscription != null &&
    engines.view !== undefined &&
    (draftEngine === undefined ||
      (subscription.model !== undefined &&
        draftEngineModels !== undefined &&
        draftEngineModel === undefined));
  const validatedSubscription =
    subscription && draftEngine && (subscription.model === undefined || draftEngineModel)
      ? {
          engine: subscription.engine,
          ...(subscription.accountId === undefined ? {} : { accountId: subscription.accountId }),
          ...(subscription.model === undefined ? {} : { model: subscription.model }),
          ...(subscription.effort !== undefined &&
          draftEngineModel?.efforts.some(({ id }) => id === subscription.effort)
            ? { effort: subscription.effort }
            : {}),
        }
      : owner
        ? subscription
        : undefined;
  const engineChoice: SubscriptionModel | null =
    validatedSubscription !== undefined
      ? validatedSubscription
      : savedEngine !== undefined &&
          availableEngines.some(
            (status) => subscriptionKey(status) === subscriptionKey(savedEngine),
          )
        ? savedEngine
        : route === undefined && firstEngine !== undefined
          ? {
              engine: firstEngine.engine,
              ...(firstEngine.accountId === undefined ? {} : { accountId: firstEngine.accountId }),
            }
          : null;
  const waitingForEngineSelection =
    owner === true &&
    call !== undefined &&
    tob !== undefined &&
    subscription !== undefined &&
    (engines.view === undefined ||
      (draftEngine !== undefined &&
        subscription?.model !== undefined &&
        draftEngineModels === undefined));
  const availableAssignment = usableRoute(assignment);
  const invalidAssignment =
    advanced &&
    assignment !== undefined &&
    catalog !== undefined &&
    (availableAssignment === undefined ||
      availableAssignment.reasoningEffort !== assignment.reasoningEffort);
  const waitingForCatalog =
    catalog === undefined && (draftRoute !== undefined || (advanced && assignment !== undefined));
  const canAdvance =
    owner === false ||
    (owner === true &&
      !unavailableSubscription &&
      (editingKey ||
        (!waitingForEngineSelection &&
          (engineChoice !== null || (!waitingForCatalog && !invalidAssignment)))));
  const hasUsableProvider = route !== undefined || availableEngines.length > 0;
  const local =
    engines.view === undefined
      ? undefined
      : engines.view.engines.some(
          (status) => status.available || status.reason !== 'host-not-local',
        );
  const split =
    advanced && assignment !== undefined && route !== undefined
      ? routeKey(assignment) !== routeKey(route) ||
        (assignment.reasoningEffort ?? '') !== (route.reasoningEffort ?? '')
      : false;

  const save = async (): Promise<boolean> => {
    if (!canAdvance) return false;
    if (!owner || connection === 'key') return true;
    setSaveError(undefined);
    try {
      if (engineChoice !== null) {
        if (
          tob !== undefined &&
          (savedEngine === undefined ||
            subscriptionKey(engineChoice) !== subscriptionKey(savedEngine) ||
            engineChoice.model !== savedEngine?.model ||
            engineChoice.effort !== savedEngine?.effort)
        ) {
          await engines.saveSelection(tob, 'orchestrator', engineChoice);
          onboardingFor(actions).introEvent('onboarding:model_save', { is_advanced: false });
        }
        return true;
      }
      if (route === undefined) return true;
      const plan = split && assignment ? JSON.stringify([route, assignment]) : undefined;
      const initial = catalog?.default;
      const changedDefault =
        initial === undefined ||
        routeKey(initial) !== routeKey(route) ||
        (initial.reasoningEffort ?? '') !== (route.reasoningEffort ?? '');
      if (changedDefault) {
        await actions.onboardingModel(undefined, 0, route, true);
        invalidateInheritedModelPlans(actions);
        setCatalog((previous) =>
          previous === undefined ? previous : { ...previous, default: route },
        );
        setPlanned(undefined);
      }
      if (tob !== undefined && savedEngine !== undefined && subscription === null) {
        await engines.saveSelection(tob, 'orchestrator', null);
      }
      if (tob !== undefined && plan !== planned) {
        const revision = (await actions.modelPlanState(tob)).revision ?? 0;
        if (split && assignment) {
          const effort = assignment.reasoningEffort ?? '';
          await actions.setModelPlan(tob, revision, route, assignment, [
            {
              provider: assignment.provider,
              model: assignment.model,
              allowedEfforts: [effort],
              defaultEffort: effort,
            },
          ]);
        } else await actions.inheritModel(tob, revision);
        setPlanned(plan);
      }
      if (changedDefault || (tob !== undefined && plan !== planned))
        onboardingFor(actions).introEvent('onboarding:model_save', { is_advanced: split });
      return true;
    } catch (cause) {
      setSaveError(errorMessage(cause));
      return false;
    }
  };
  const bindSave = useMountedResource<HTMLSpanElement>(() => {
    bind({ keyForm: editingKey, canAdvance, save });
    return () => bind(undefined);
  }, [
    owner,
    canAdvance,
    editingKey,
    connection,
    route?.provider,
    route?.model,
    route?.reasoningEffort,
    catalog?.default,
    assignment,
    advanced,
    planned,
    engineChoice?.engine,
    engineChoice?.model,
    engineChoice?.effort,
    savedEngine,
    subscription,
    tob,
  ]);
  const options = models.map((model) => ({
    value: routeKey(model),
    label: model.modelName,
    hint: model.providerName,
    disabled: model.restingUntil !== undefined,
  }));
  const parse = ({ key, effort }: { key: string; effort: string }): ModelRouteView | undefined => {
    const model = models.find((entry) => routeKey(entry) === key);
    return model === undefined
      ? undefined
      : {
          provider: model.provider,
          model: model.model,
          ...(effort ? { reasoningEffort: effort } : {}),
        };
  };
  const connected = new Map(
    models.map(({ provider, providerName }) => [
      provider,
      { name: providerName, brand: providerBrand(provider, providerName) },
    ]),
  );
  for (const status of availableEngines) {
    connected.set(`engine:${status.engine}`, {
      name: engineName(status.engine),
      brand: status.engine === 'codex' ? 'openai' : 'claude',
    });
  }
  return (
    <div
      ref={mount}
      className={`bh-onboarding-model-form ${stylex.props(styles.modelForm).className ?? ''}`}
    >
      <span ref={bindSave} hidden />
      <div ref={engines.mount} hidden />
      <h2 {...stylex.props(stepStyles.title)}>
        {t(
          editingKey || !hasUsableProvider
            ? 'intro.model.connectTitle'
            : engineChoice !== null
              ? 'intro.model.tobModel'
              : owner === false
                ? 'intro.model.memberTitle'
                : 'intro.model.title',
        )}
      </h2>
      {editingKey ? (
        <InlineModelProvider
          call={call}
          onSavingChange={onProviderSavingChange}
          onClose={() => setConnection(undefined)}
          onAdded={() => {
            setConnection(undefined);
            reload();
          }}
          t={t}
        />
      ) : hasUsableProvider ? (
        <>
          <ModelPicker
            title={t('onboarding.model')}
            hint={
              engineChoice !== null
                ? t('intro.model.subscriptionHint')
                : owner
                  ? t('intro.model.hint')
                  : ''
            }
            choice={{ key: route ? routeKey(route) : '', effort: route?.reasoningEffort ?? '' }}
            catalog={models}
            options={options}
            onChange={(choice) =>
              setDraft((previous) => ({ ...previous, route: parse(choice), subscription: null }))
            }
            disabled={saving}
            subscription={
              (availableEngines.length === 0 && engineChoice === null) || tob === undefined
                ? undefined
                : {
                    choice: engineChoice,
                    items: engineMenuItems(availableEngines, engines.models, engines.signingIn, t),
                    models: engines.models,
                    onChange: (choice) =>
                      setDraft((previous) => ({ ...previous, subscription: choice })),
                    signIn: engines.signIn,
                  }
            }
            t={t}
          />
          {owner && engineChoice === null && tob !== undefined ? (
            <details
              {...stylex.props(styles.advanced)}
              open={advanced}
              onToggle={(event) => {
                const { open } = event.currentTarget;
                setDraft((previous) =>
                  previous.advanced === open ? previous : { ...previous, advanced: open },
                );
              }}
              data-intro-model-advanced
            >
              <summary
                {...stylex.props(styles.advancedSummary)}
                aria-disabled={saving || undefined}
                onClick={saving ? (event) => event.preventDefault() : undefined}
              >
                <span>{t('intro.model.advanced')}</span>
                <span {...stylex.props(stepStyles.copy)}>
                  {t(split ? 'intro.model.advancedSplit' : 'intro.model.advancedSame')}
                </span>
              </summary>
              <ModelPicker
                title={t('modelPreset.assignment')}
                hint={t('intro.model.assignmentHint')}
                choice={{
                  key: routeKey(assignment ?? route ?? { provider: '', model: '' }),
                  effort: (assignment ?? route)?.reasoningEffort ?? '',
                }}
                catalog={models}
                options={options}
                onChange={(choice) =>
                  setDraft((previous) => ({ ...previous, assignment: parse(choice) }))
                }
                disabled={saving}
                t={t}
              />
            </details>
          ) : null}
          {canConnect && openProviders !== undefined ? (
            <div {...stylex.props(styles.choices)}>
              <ChoiceButton
                title={t('botSettings.section.modelProviders')}
                leading={<Icon name="settings" />}
                description={
                  <span {...stylex.props(styles.providers)}>
                    {[...connected].slice(0, 3).map(([id, { name, brand }]) => (
                      <span key={id} {...stylex.props(styles.provider)}>
                        <ModelBrandIcon brand={brand} />
                        {name}
                      </span>
                    ))}
                    {connected.size > 3 ? <span>+{connected.size - 3}</span> : null}
                  </span>
                }
                disabled={saving}
                onClick={openProviders}
              />
            </div>
          ) : null}
          {engines.loadFailed ? (
            <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
              {t('engine.loadFailed')}
            </ReadFailure>
          ) : null}
        </>
      ) : catalog === undefined ? (
        readError === undefined ? (
          <Note>{t('modelPreset.loading')}</Note>
        ) : null
      ) : canConnect ? (
        <div {...stylex.props(styles.choices)}>
          <ChoiceButton
            title={t('intro.model.enterKey')}
            description={t('intro.model.enterKeyHint')}
            leading={<Icon name="shield-check" />}
            disabled={saving}
            onClick={() => setConnection('key')}
          />
          {local === true ? (
            connection === 'subscription' ? (
              <ModelProviderSubscriptions engines={engines} t={t} />
            ) : (
              <ChoiceButton
                title={t('intro.model.signIn')}
                description={t('intro.model.signInHint')}
                leading={<Icon name="plug" />}
                disabled={saving}
                onClick={() => setConnection('subscription')}
              />
            )
          ) : local === false ? (
            <Note>{t('engine.localOnly')}</Note>
          ) : null}
          {engines.loadFailed ? (
            <ReadFailure retryLabel={t('engine.reload')} onRetry={() => void engines.refresh()}>
              {t('engine.loadFailed')}
            </ReadFailure>
          ) : null}
        </div>
      ) : viewer !== undefined ? (
        <Note>{t('intro.model.ownerConnects')}</Note>
      ) : null}
      {call !== undefined && viewerRead.failed ? (
        <ReadFailure
          retryLabel={t('team.retry')}
          busy={retryingViewer}
          onRetry={() => {
            setRetryingViewer(true);
            void refreshTeamMode(call).finally(() => setRetryingViewer(false));
          }}
        >
          {t('intro.model.viewerLoadFailed')}
        </ReadFailure>
      ) : null}
      {readError === undefined ? null : (
        <ReadFailure retryLabel={t('engine.reload')} onRetry={reload}>
          {readError}
        </ReadFailure>
      )}
      {!editingKey && owner && unavailableSubscription ? (
        <Note tone="danger">{t('intro.model.subscriptionUnavailable')}</Note>
      ) : null}
      {!editingKey && owner && engineChoice === null && invalidAssignment ? (
        <div>
          <Note tone="warning">{t('intro.model.assignmentUnavailable')}</Note>
          <Button
            variant="outline"
            disabled={saving}
            onClick={() => setDraft((previous) => ({ ...previous, assignment: undefined }))}
          >
            {t('intro.model.useMainForAssignment')}
          </Button>
        </div>
      ) : null}
      {saveError === undefined ? null : <Note tone="danger">{saveError}</Note>}
    </div>
  );
}

function InlineModelProvider({
  call,
  onClose,
  onAdded,
  onSavingChange,
  t,
}: {
  call: BridgeCall;
  onClose(): void;
  onAdded(): void;
  onSavingChange(saving: boolean): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [view, setView] = useState<ModelProvidersView>();
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [retry, setRetry] = useState(0);
  const reload = () => {
    setFailed(false);
    setRefreshing(true);
    setRetry((count) => count + 1);
  };
  const mount = useMountedResource<HTMLDivElement>(() => {
    const request = new AbortController();
    void bridgeHost(call, request.signal)
      .call<ModelProvidersView>('modelProviders')
      .then(
        (result) => {
          if (request.signal.aborted) return;
          setView(result);
          setRefreshing(false);
        },
        () => {
          if (!request.signal.aborted) setFailed(true);
        },
      );
    return () => request.abort();
  }, [call, retry]);
  return (
    <div ref={mount}>
      {view?.revision !== undefined ? (
        <AddModelProvider
          call={call}
          revision={refreshing ? undefined : view.revision}
          onAdded={onAdded}
          onClose={onClose}
          onConflict={reload}
          onSavingChange={onSavingChange}
          inline
          t={t}
        />
      ) : (
        <div {...stylex.props(stepStyles.section)}>
          {view !== undefined ? (
            <Note>{t('modelProviders.readOnly')}</Note>
          ) : failed ? null : (
            <Note>{t('modelProviders.loading')}</Note>
          )}
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      )}
      {failed ? (
        <ReadFailure retryLabel={t('engine.reload')} onRetry={reload}>
          {t('modelProviders.readFailed')}
        </ReadFailure>
      ) : null}
    </div>
  );
}

function routeKey(route: { provider: string; model: string }): string {
  return JSON.stringify([route.provider, route.model]);
}
