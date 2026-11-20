import type { SubscriptionModel } from '@botharness/host-client/model-plans';
import { Tag } from './ds/tag.js';
import { Button } from './ds/button.js';
import { SegmentedControl } from './ds/segmented.js';
import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import type { BridgeActions } from './actions.js';
import type {
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelPlanGroupsView,
  ModelPlanView,
  ModelPlanStateView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import {
  engineModelKey,
  engineRoles,
  useSubscriptionEngines,
  type EngineRole,
} from './engine-choice.js';
import { engineName } from './session-engine.js';
import { isOriginActions } from './origin-actions.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { engineMenuItems, groupMenuId } from './model-menu.js';
import { ModelPlanEditor } from './model-plan-editor.js';
import {
  draftOf,
  modelKey,
  planParts,
  routeLabel,
  routeOfKey,
  trailing,
  type ModelDraft,
} from './model-preset-draft.js';
import {
  invalidateModelPlan,
  modelPlanOf,
  rememberModelPlan,
  subscribeModelPlans,
} from './model-plan-store.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

const styles = stylex.create({
  source: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    minWidth: 0,
    paddingBottom: space.x4,
    borderBottomWidth: border.hairline,
    borderBottomStyle: 'solid',
    borderBottomColor: color.divider,
  },
});

function sameEngine(left: SubscriptionModel | null, right: SubscriptionModel | null): boolean {
  return (
    left?.engine === right?.engine &&
    (left === null ||
      right === null ||
      engineModelKey(left.engine, left.accountId) ===
        engineModelKey(right.engine, right.accountId)) &&
    left?.model === right?.model &&
    left?.effort === right?.effort
  );
}

export function ModelPresetProfile({
  slug,
  actions,
  t,
  onClose,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
  onClose?: (() => void) | undefined;
}): ReactElement {
  const [catalog, setCatalog] = useState<ModelCatalogEntryView[]>();
  const [catalogGroups, setCatalogGroups] = useState<ModelCatalogGroupView[]>([]);
  const [presets, setPresets] = useState<ModelPresetView[]>([]);
  const [plan, setPlan] = useState<ModelPlanView>();
  const [revision, setRevision] = useState(0);
  const [repair, setRepair] = useState<ModelPlanStateView['repair']>();
  const [planLoadError, setPlanLoadError] = useState(false);
  const planRequest = useRef(0);
  const [draft, setDraft] = useState<ModelDraft>();
  const [initialDraft, setInitialDraft] = useState<ModelDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(onClose !== undefined);
  const [selectionMode, setSelectionMode] = useState('models');
  const origin = isOriginActions(actions);
  const engines = useSubscriptionEngines(origin && editorOpen);
  const [engineDraft, setEngineDraft] = useState<
    Partial<Record<EngineRole, SubscriptionModel | null>>
  >({});
  const engineItems = engineMenuItems(
    engines.view?.engines ?? [],
    engines.models,
    engines.signingIn,
    t,
  );
  const liveEngine = (role: EngineRole) =>
    origin && engines.view !== undefined
      ? (engines.view.selections.find((item) => item.botSlug === slug && item.role === role) ??
        null)
      : null;
  const desiredEngine = (role: EngineRole) =>
    origin && engineDraft[role] !== undefined ? engineDraft[role] : liveEngine(role);
  const pendingEngines = engineRoles.filter(
    (role) => !sameEngine(liveEngine(role), desiredEngine(role)),
  );
  const chosenPreset = presets.find((preset) => preset.id === draft?.presetId);

  const acceptPlan = (
    current: ModelPlanView | undefined,
    currentRevision = current?.revision ?? 0,
  ): void => {
    rememberModelPlan(slug, current, actions);
    setPlan((previous) => ((previous?.revision ?? 0) > currentRevision ? previous : current));
  };

  const loadPlanOnMount = useMountedResource<HTMLDivElement>(() => {
    const read = (): void => {
      const request = ++planRequest.current;
      void actions.modelPlanState(slug).then(
        (state) => {
          if (planRequest.current !== request) return;
          rememberModelPlan(slug, state.plan, actions);
          setRevision(state.revision ?? state.plan?.revision ?? 0);
          setRepair(state.repair);
          setPlanLoadError(false);
          setPlan((previous) =>
            (previous?.revision ?? 0) > (state.revision ?? state.plan?.revision ?? 0)
              ? previous
              : state.plan,
          );
        },
        () => {
          if (planRequest.current === request) setPlanLoadError(true);
        },
      );
    };
    if (onClose === undefined) read();
    else void load();
    const unsubscribe = subscribeModelPlans(() => {
      if (modelPlanOf(slug, actions) === undefined) read();
    }, actions);
    return () => {
      ++planRequest.current;
      unsubscribe();
    };
  }, [actions, slug]);

  const load = async (): Promise<void> => {
    const request = planRequest.current;
    setError(undefined);
    try {
      const [{ models, default: fallback, groups }, saved, state] = await Promise.all([
        actions.modelCatalog(),
        actions.modelPresets(),
        actions.modelPlanState(slug),
      ]);
      if (planRequest.current !== request) return;
      const current = state.plan;
      setRevision(state.revision ?? current?.revision ?? 0);
      acceptPlan(current, state.revision);
      setRepair(state.repair);
      setCatalog(models);
      setCatalogGroups(groups ?? []);
      setPresets(saved);
      const initial = (() => {
        if (current !== undefined) return draftOf(current, current.sourcePresetId);
        const usable = models.filter((entry) => entry.credential === undefined);
        const first =
          usable.find(
            (entry) => entry.provider === fallback?.provider && entry.model === fallback.model,
          ) ?? usable[0];
        if (first === undefined) return draftOf({}, '');
        const route = { provider: first.provider, model: first.model };
        return draftOf({ orchestrator: route }, '');
      })();
      setInitialDraft(initial);
      setDraft((previous) => previous ?? initial);
      setPlanLoadError(false);
    } catch (failure) {
      if (planRequest.current === request) setError(errorMessage(failure));
    }
  };

  const hasPlanError = planLoadError && plan === undefined;
  const presetLabel =
    plan === undefined || plan.sourcePresetId === '' ? undefined : plan.sourcePresetName;
  const extraAllowed = plan === undefined ? 0 : (plan.assignmentModels?.length ?? 1) - 1;

  const summary =
    repair !== undefined
      ? t('modelPreset.repairNeeded')
      : hasPlanError
        ? t('modelPreset.loadFailed')
        : plan === undefined
          ? t('onboarding.inherit')
          : routeLabel(plan.orchestrator, t('modelPreset.providerDefault'));

  const openEditor = (): void => {
    setDraft(undefined);
    setEngineDraft({});
    setError(undefined);
    setSelectionMode('models');
    setEditorOpen(true);
    void load();
  };

  const updateDraft = (change: (current: ModelDraft) => Partial<ModelDraft>): void =>
    setDraft((current) =>
      current === undefined ? current : { ...current, ...change(current), presetId: '' },
    );
  const edit = (change: Partial<ModelDraft>): void => updateDraft(() => change);

  const editEngine = (role: EngineRole, choice: SubscriptionModel | null): void => {
    setEngineDraft((current) => ({ ...current, [role]: choice }));
    edit({});
  };

  const subscription = (role: EngineRole) =>
    origin
      ? {
          choice: desiredEngine(role),
          items: engineItems,
          models: engines.models,
          onChange: (choice: SubscriptionModel) => editEngine(role, choice),
          signIn: engines.signIn,
        }
      : undefined;

  const stagePreset = (preset: ModelPresetView) => {
    setDraft(draftOf(preset, preset.id));
    setEngineDraft({
      orchestrator: preset.orchestratorEngine ?? null,
      assignment: preset.assignmentEngine ?? null,
    });
  };
  const inCatalog = (key: string): boolean => {
    const group = groupMenuId(key);
    return group === undefined
      ? catalog?.some((entry) => modelKey(entry) === key) === true
      : catalogGroups.some((entry) => entry.id === group);
  };
  const canSave =
    draft !== undefined &&
    inCatalog(draft.orchestrator.key) &&
    (draft.assignment.key === '' || inCatalog(draft.assignment.key)) &&
    !busy;
  const planEdited = JSON.stringify(draft) !== JSON.stringify(initialDraft);
  const enginesOnly = !planEdited && pendingEngines.length > 0;
  const canApply =
    !busy &&
    (enginesOnly || (canSave && (plan !== undefined || planEdited || chosenPreset !== undefined)));
  const closeEditor = (): void => {
    if (busy) return;
    setEditorOpen(false);
    onClose?.();
  };

  const finish = (applied: ModelPlanView): void => {
    planRequest.current += 1;
    rememberModelPlan(slug, applied, actions);
    setPlan(applied);
    setRevision(applied.revision);
    setRepair(undefined);
    setEditorOpen(false);
    onClose?.();
  };

  const save = async (): Promise<void> => {
    if (!canApply || draft === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const orchestratorGroup = groupMenuId(draft.orchestrator.key);
      const parts =
        draft.assignment.key === '' || enginesOnly
          ? undefined
          : planParts(draft, catalogGroups, catalog);
      const applied =
        chosenPreset !== undefined
          ? await actions.applyModelPreset(slug, chosenPreset.id)
          : enginesOnly
            ? plan
            : draft.assignment.key === ''
              ? orchestratorGroup === undefined
                ? await actions.customizeModelPlan(
                    slug,
                    routeOfKey(draft.orchestrator.key, draft.orchestrator.effort),
                    plan?.revision ?? revision,
                  )
                : await actions.chooseModelPlanGroup(
                    slug,
                    orchestratorGroup,
                    plan?.revision ?? revision,
                    draft.orchestrator.effort,
                  )
              : parts === undefined
                ? undefined
                : await actions.setModelPlan(
                    slug,
                    plan?.revision ?? revision,
                    parts.orchestrator,
                    parts.assignmentDefault,
                    parts.assignmentModels,
                    ...trailing(draft, parts),
                  );
      if (applied === undefined && (planEdited || pendingEngines.length === 0)) {
        setError(t('modelPreset.routeUnavailable'));
        return;
      }
      if (applied !== undefined) {
        acceptPlan(applied);
        setRevision(applied.revision);
        setInitialDraft(draft);
      }
      if (chosenPreset === undefined) {
        for (const role of pendingEngines)
          await engines.saveSelection(slug, role, desiredEngine(role), liveEngine(role)?.fallback);
        if (pendingEngines.length > 0 && (await engines.refresh()) === undefined) return;
      }
      if (applied === undefined) {
        setEditorOpen(false);
        onClose?.();
      } else finish(applied);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const groupName = (id: string | undefined): string | undefined =>
    id === undefined ? undefined : (catalogGroups.find((group) => group.id === id)?.name ?? id);
  const presetRouteLabel = (route: ModelRouteView): string =>
    routeLabel(
      {
        ...route,
        model:
          catalog?.find((entry) => modelKey(entry) === modelKey(route))?.modelName ?? route.model,
      },
      t('modelPreset.providerDefault'),
    );
  const presetEngineLabel = (choice: SubscriptionModel | undefined): string | undefined =>
    choice === undefined ? undefined : (choice.model ?? engineName(choice.engine));

  const messages = (
    <>
      {repair !== undefined && (
        <span className="bh-profile-error" role="alert">
          {repair.code === 'legacy-ambiguous'
            ? t('modelPreset.legacyAmbiguous', {
                model: repair.legacyModel ?? '',
              })
            : repair.code === 'legacy-missing'
              ? t('modelPreset.legacyMissing', {
                  model: repair.legacyModel ?? '',
                })
              : t('modelPreset.routeRepair')}
        </span>
      )}
      {error !== undefined && (
        <span className="bh-profile-error" role="alert">
          {error}
        </span>
      )}
      {hasPlanError && (
        <span className="bh-profile-error" role="alert">
          {t('modelPreset.loadFailed')}
        </span>
      )}
    </>
  );

  return (
    <div
      ref={loadPlanOnMount}
      className="bh-model-entry"
      role="region"
      aria-label={t('modelPreset.title')}
    >
      {onClose === undefined && (
        <>
          <div className="bh-onboarding-actions">
            <span className="bh-note">
              {t(plan === undefined ? 'onboarding.inheritHint' : 'onboarding.fixed')}
            </span>
            {plan !== undefined || repair !== undefined ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void actions
                    .inheritModel(slug, plan?.revision ?? revision)
                    .then(
                      (result) => {
                        planRequest.current += 1;
                        invalidateModelPlan(slug, actions);
                        setPlan(undefined);
                        setRevision(result.revision);
                        setRepair(undefined);
                      },
                      (failure) => setError(errorMessage(failure)),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {t('onboarding.inherit')}
              </Button>
            ) : null}
          </div>
          <SidebarCardList label={t('modelPreset.title')}>
            <SidebarCardRow
              icon="bot"
              title={t('modelPreset.title')}
              chips={
                presetLabel === undefined &&
                extraAllowed <= 0 &&
                plan?.openAssignmentModels !== true ? undefined : (
                  <>
                    {presetLabel === undefined ? null : <Tag tone="neutral">{presetLabel}</Tag>}
                    {plan?.openAssignmentModels === true ? (
                      <Tag tone="quiet">{t('modelPreset.openTag')}</Tag>
                    ) : null}
                    {extraAllowed > 0 ? (
                      <Tag tone="quiet">
                        {t('modelPreset.moreAllowed', { count: extraAllowed })}
                      </Tag>
                    ) : null}
                  </>
                )
              }
              meta={
                plan === undefined || repair !== undefined || hasPlanError ? (
                  summary
                ) : (
                  <>
                    <span className="bh-card-meta-line">
                      {t('modelPreset.orchestrator')} · {summary}
                    </span>
                    <span className="bh-card-meta-line">
                      {t('modelPreset.assignment')} ·{' '}
                      {plan.assignmentDefault === undefined
                        ? t('onboarding.inherit')
                        : routeLabel(plan.assignmentDefault, t('modelPreset.providerDefault'))}
                    </span>
                  </>
                )
              }
              onClick={openEditor}
              dialog
            />
          </SidebarCardList>
        </>
      )}
      {editorOpen ? null : messages}
      {editorOpen && (
        <PanelDialog
          size="medium"
          scroll
          onClose={closeEditor}
          closeLabel={t('common.close')}
          title={t('modelPreset.title')}
          secondary={
            actions.openModelPresets === undefined ? undefined : (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  closeEditor();
                  actions.openModelPresets?.();
                }}
              >
                {t('modelPreset.openSettings')}
              </Button>
            )
          }
          actions={
            <>
              <Button variant="outline" disabled={busy} onClick={closeEditor}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!canApply || (selectionMode === 'presets' && !chosenPreset)}
                onClick={() => void save()}
              >
                {t('modelPreset.save')}
              </Button>
            </>
          }
        >
          <SegmentedControl
            id="bh-model-selection-mode"
            value={selectionMode}
            options={[
              { value: 'models', label: t('modelPreset.specificModels') },
              { value: 'presets', label: t('modelPreset.presets') },
            ]}
            onChange={setSelectionMode}
            label={t('modelPreset.selectionMode')}
            disabled={busy}
          />
          {catalog === undefined ? (
            <Note>{t('modelPreset.loading')}</Note>
          ) : (catalog.length === 0 && engineItems.length === 0) || draft === undefined ? (
            <Note>{t('modelPreset.emptyCatalog')}</Note>
          ) : (
            <>
              {selectionMode === 'presets' ? (
                <div data-model-preset-source="" {...stylex.props(styles.source)}>
                  <SidebarCardList label={t('modelPreset.presets')}>
                    {presets.map((preset) => (
                      <SidebarCardRow
                        key={preset.id}
                        title={preset.name}
                        selection={{ checked: draft.presetId === preset.id }}
                        meta={
                          <>
                            <span className="bh-card-meta-line">
                              {t('modelPreset.orchestrator')} ·{' '}
                              {presetEngineLabel(preset.orchestratorEngine) ??
                                groupName(preset.orchestratorGroupId) ??
                                presetRouteLabel(preset.orchestrator)}
                            </span>
                            <span className="bh-card-meta-line">
                              {t('modelPreset.assignment')} ·{' '}
                              {presetEngineLabel(preset.assignmentEngine) ??
                                groupName(preset.assignmentDefaultGroupId) ??
                                presetRouteLabel(preset.assignmentDefault)}
                            </span>
                          </>
                        }
                        disabled={busy}
                        onClick={() => stagePreset(preset)}
                      />
                    ))}
                  </SidebarCardList>
                  <Note>
                    {chosenPreset === undefined
                      ? t('modelPreset.noPreset')
                      : t('modelPreset.usingPreset', {
                          name: chosenPreset.name,
                        })}
                  </Note>
                  {presets.length === 0 && <Note>{t('modelPreset.emptyPresets')}</Note>}
                </div>
              ) : (
                <>
                  <ModelPlanEditor
                    draft={draft}
                    catalog={catalog}
                    catalogGroups={catalogGroups}
                    busy={busy}
                    allowInheritedAssignment={plan?.assignmentDefault === undefined}
                    showAssignmentPicker={engineItems.length > 0}
                    updateDraft={updateDraft}
                    subscription={subscription}
                    clearEngine={(role) => editEngine(role, null)}
                    t={t}
                  />
                </>
              )}
            </>
          )}
          {origin ? (
            <div ref={engines.mount} hidden={selectionMode !== 'models'}>
              {engines.view?.engines.length === 0 ? <Note>{t('engine.localOnly')}</Note> : null}
              {engines.signInUrl === undefined ? null : (
                <Note>
                  <a href={engines.signInUrl} target="_blank" rel="noopener noreferrer">
                    {t('engine.openSignIn')}
                  </a>
                </Note>
              )}
              {engines.loadFailed ? (
                <Note tone="warning">
                  {t('engine.loadFailed')}{' '}
                  <Button variant="ghost" onClick={() => void engines.refresh()}>
                    {t('engine.reload')}
                  </Button>
                </Note>
              ) : null}
              {engines.error === undefined ? null : <Note tone="danger">{engines.error}</Note>}
            </div>
          ) : null}
          {messages}
        </PanelDialog>
      )}
    </div>
  );
}
