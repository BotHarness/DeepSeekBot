import { useRef, useState, type ReactElement } from 'react';
import {
  Button,
  Checkbox,
  IconChevronDownOutlineRegular,
  Input,
  SegmentedControl,
  Tag,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { BridgeActions } from './actions.js';
import type {
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelPlanView,
  ModelPlanStateView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import { Combobox, type ComboboxOption } from './combobox.js';
import type { BotHarnessTranslate } from './locale.js';
import { Modal } from './modal.js';
import { ModelPicker } from './model-picker.js';
import {
  invalidateModelPlan,
  modelPlanOf,
  rememberModelPlan,
  subscribeModelPlans,
} from './model-plan-store.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

export function routeLabel(route: ModelRouteView, defaultLabel: string): string {
  return `${route.model} · ${route.reasoningEffort ?? defaultLabel}`;
}

const modelKey = (route: Pick<ModelRouteView, 'provider' | 'model'>): string =>
  JSON.stringify([route.provider, route.model]);

function routeOfKey(key: string, effort: string): ModelRouteView {
  const [provider, model] = JSON.parse(key) as [string, string];
  return { provider, model, ...(effort === '' ? {} : { reasoningEffort: effort }) };
}

interface ModelChoice {
  key: string;
  effort: string;
}

interface ModelDraft {
  orchestrator: ModelChoice;
  assignment: ModelChoice;
  allowed: AssignmentModelOptionView[];
  advanced: boolean;
  presetId: string;
}

function allowedOf(
  assignmentDefault: ModelRouteView,
  assignmentModels: readonly AssignmentModelOptionView[] | undefined,
): AssignmentModelOptionView[] {
  return (
    assignmentModels ?? [
      {
        provider: assignmentDefault.provider,
        model: assignmentDefault.model,
        allowedEfforts: [assignmentDefault.reasoningEffort ?? ''],
        defaultEffort: assignmentDefault.reasoningEffort ?? '',
      },
    ]
  ).map((option) => ({ ...option, allowedEfforts: [...option.allowedEfforts] }));
}

function draftOf(
  source: Pick<ModelPlanView, 'orchestrator' | 'assignmentDefault' | 'assignmentModels'>,
  presetId: string,
): ModelDraft {
  return {
    orchestrator: {
      key: modelKey(source.orchestrator),
      effort: source.orchestrator.reasoningEffort ?? '',
    },
    assignment: {
      key: modelKey(source.assignmentDefault),
      effort: source.assignmentDefault.reasoningEffort ?? '',
    },
    allowed: allowedOf(source.assignmentDefault, source.assignmentModels),
    advanced:
      (source.assignmentModels?.length ?? 1) > 1 ||
      source.assignmentModels?.some(
        (option) => option.note !== undefined || option.allowedEfforts.length > 1,
      ) === true,
    presetId,
  };
}

function withNote(
  option: AssignmentModelOptionView,
  note: string | undefined,
): AssignmentModelOptionView {
  const { note: _previous, ...rest } = option;
  const trimmed = note?.trim() ?? '';
  return trimmed === '' ? rest : { ...rest, note: trimmed };
}

function assignmentChoice(draft: ModelDraft): ModelChoice {
  if (!draft.advanced) return draft.assignment;
  const option = draft.allowed.find((item) => modelKey(item) === draft.assignment.key);
  return { key: draft.assignment.key, effort: option?.defaultEffort ?? draft.assignment.effort };
}

function assignmentRoute(draft: ModelDraft): ModelRouteView {
  const { key, effort } = assignmentChoice(draft);
  return routeOfKey(key, effort);
}

function finalAllowed(draft: ModelDraft): AssignmentModelOptionView[] {
  if (draft.advanced) return draft.allowed.map((option) => withNote(option, option.note));
  const {
    provider,
    model,
    reasoningEffort = '',
  } = routeOfKey(draft.assignment.key, draft.assignment.effort);
  return [{ provider, model, allowedEfforts: [reasoningEffort], defaultEffort: reasoningEffort }];
}

function withAdvanced(draft: ModelDraft, advanced: boolean): ModelDraft {
  if (!advanced) return { ...draft, advanced, assignment: assignmentChoice(draft) };
  const { key, effort } = draft.assignment;
  const existing = draft.allowed.find((option) => modelKey(option) === key);
  const route = routeOfKey(key, effort);
  const allowed =
    existing === undefined
      ? [
          {
            provider: route.provider,
            model: route.model,
            allowedEfforts: [effort],
            defaultEffort: effort,
          },
          ...draft.allowed,
        ]
      : draft.allowed.map((option) =>
          modelKey(option) === key
            ? {
                ...option,
                allowedEfforts: option.allowedEfforts.includes(effort)
                  ? option.allowedEfforts
                  : [...option.allowedEfforts, effort],
                defaultEffort: effort,
              }
            : option,
        );
  return { ...draft, advanced, allowed };
}

export function ModelPresetProfile({
  slug,
  actions,
  t,
}: {
  slug: string;
  actions: BridgeActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const [catalog, setCatalog] = useState<ModelCatalogEntryView[]>();
  const [presets, setPresets] = useState<ModelPresetView[]>([]);
  const [plan, setPlan] = useState<ModelPlanView>();
  const [revision, setRevision] = useState(0);
  const [repair, setRepair] = useState<ModelPlanStateView['repair']>();
  const [planLoadError, setPlanLoadError] = useState(false);
  const planRequest = useRef(0);
  const [draft, setDraft] = useState<ModelDraft>();
  const [presetName, setPresetName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(false);

  const acceptPlan = (
    current: ModelPlanView | undefined,
    currentRevision = current?.revision ?? 0,
  ): void => {
    rememberModelPlan(slug, current);
    setPlan((previous) => ((previous?.revision ?? 0) > currentRevision ? previous : current));
  };

  const loadPlanOnMount = useMountedResource<HTMLDivElement>(() => {
    const read = (): void => {
      const request = ++planRequest.current;
      void actions.modelPlanState(slug).then(
        (state) => {
          if (planRequest.current !== request) return;
          rememberModelPlan(slug, state.plan);
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
    read();
    const unsubscribe = subscribeModelPlans(() => {
      if (modelPlanOf(slug) === undefined) read();
    });
    return () => {
      ++planRequest.current;
      unsubscribe();
    };
  }, [actions, slug]);

  const load = async (): Promise<void> => {
    const request = planRequest.current;
    setError(undefined);
    try {
      const [{ models, default: fallback }, saved, state] = await Promise.all([
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
      setPresets(saved);
      setDraft((previous) => {
        if (previous !== undefined) return previous;
        if (current !== undefined) return draftOf(current, current.sourcePresetId);
        const usable = models.filter((entry) => entry.credential === undefined);
        const first =
          usable.find(
            (entry) => entry.provider === fallback?.provider && entry.model === fallback.model,
          ) ?? usable[0];
        if (first === undefined) return undefined;
        const route = { provider: first.provider, model: first.model };
        return draftOf({ orchestrator: route, assignmentDefault: route }, '');
      });
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
    setPresetName(undefined);
    setError(undefined);
    setEditorOpen(true);
    void load();
  };

  const edit = (change: Partial<ModelDraft>): void =>
    setDraft((current) =>
      current === undefined ? current : { ...current, ...change, presetId: '' },
    );

  const inCatalog = (key: string): boolean =>
    catalog?.some((entry) => modelKey(entry) === key) === true;
  const canSave =
    draft !== undefined &&
    inCatalog(draft.orchestrator.key) &&
    inCatalog(draft.assignment.key) &&
    !busy;

  const finish = (applied: ModelPlanView): void => {
    planRequest.current += 1;
    rememberModelPlan(slug, applied);
    setPlan(applied);
    setRevision(applied.revision);
    setRepair(undefined);
    setEditorOpen(false);
  };

  const save = async (): Promise<void> => {
    if (!canSave || draft === undefined) return;
    setBusy(true);
    setError(undefined);
    try {
      const applied =
        draft.presetId !== '' && presets.some((preset) => preset.id === draft.presetId)
          ? await actions.applyModelPreset(slug, draft.presetId)
          : await actions.setModelPlan(
              slug,
              plan?.revision ?? revision,
              routeOfKey(draft.orchestrator.key, draft.orchestrator.effort),
              assignmentRoute(draft),
              finalAllowed(draft),
            );
      finish(applied);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const saveAsPreset = async (): Promise<void> => {
    const name = presetName?.trim() ?? '';
    if (!canSave || draft === undefined || name === '') return;
    setBusy(true);
    setError(undefined);
    try {
      const preset = await actions.createModelPreset(
        name,
        routeOfKey(draft.orchestrator.key, draft.orchestrator.effort),
        assignmentRoute(draft),
        finalAllowed(draft),
      );
      setPresets((current) => [...current, preset]);
      finish(await actions.applyModelPreset(slug, preset.id));
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const modelOptions: ComboboxOption[] = [...(catalog ?? [])]
    .sort((a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined))
    .map((entry) => ({
      value: modelKey(entry),
      label: entry.modelName,
      hint:
        entry.credential === undefined
          ? entry.providerName
          : t(
              entry.credential === 'missing'
                ? 'modelPreset.credentialMissing'
                : 'modelPreset.credentialInvalid',
              { provider: entry.providerName },
            ),
      disabled: entry.credential !== undefined,
    }));
  const presetOptions: ComboboxOption[] = presets.map((preset) => ({
    value: preset.id,
    label: preset.name,
    hint: routeLabel(preset.orchestrator, t('modelPreset.providerDefault')),
  }));
  const currentPreset = presets.find((preset) => preset.id === draft?.presetId);

  const messages = (
    <>
      {repair !== undefined && (
        <span className="bh-profile-error" role="alert">
          {repair.code === 'legacy-ambiguous'
            ? t('modelPreset.legacyAmbiguous', { model: repair.legacyModel ?? '' })
            : repair.code === 'legacy-missing'
              ? t('modelPreset.legacyMissing', { model: repair.legacyModel ?? '' })
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

  const effortsOf = (entry: ModelCatalogEntryView | undefined) => [
    { id: '', name: t('modelPreset.providerDefault') },
    ...(entry?.efforts ?? []),
  ];
  const editAllowed = (
    key: string,
    change: (option: AssignmentModelOptionView) => AssignmentModelOptionView,
  ): void =>
    setDraft((current) =>
      current === undefined
        ? current
        : {
            ...current,
            presetId: '',
            allowed: current.allowed.map((item) => (modelKey(item) === key ? change(item) : item)),
          },
    );

  const modelCard = (option: AssignmentModelOptionView, isDefault: boolean) => {
    const key = modelKey(option);
    const entry = catalog?.find((item) => modelKey(item) === key);
    const name = entry?.modelName ?? option.model;
    const efforts = effortsOf(entry);
    const allowedEfforts = efforts.filter((effort) => option.allowedEfforts.includes(effort.id));
    return (
      <li key={key} className="bh-card-row bh-model-card">
        <div className="bh-model-card-head">
          <strong>{name}</strong>
          <span className="bh-model-card-provider">{entry?.providerName ?? option.provider}</span>
          {isDefault ? (
            <Tag tone="neutral">{t('modelPreset.defaultModel')}</Tag>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => edit({ assignment: { key, effort: option.defaultEffort } })}
              >
                {t('modelPreset.makeDefault')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={t('modelPreset.removeAllowed', { model: name })}
                onClick={() =>
                  setDraft((current) =>
                    current === undefined
                      ? current
                      : {
                          ...current,
                          presetId: '',
                          allowed: current.allowed.filter((item) => modelKey(item) !== key),
                        },
                  )
                }
              >
                ×
              </Button>
            </>
          )}
        </div>
        <div className="bh-model-card-field">
          <span>{t('modelPreset.allowedEfforts')}</span>
          <div className="bh-model-card-efforts">
            {efforts.map((effort) => (
              <Checkbox
                key={effort.id}
                label={effort.name}
                checked={option.allowedEfforts.includes(effort.id)}
                disabled={
                  busy ||
                  (option.allowedEfforts.length === 1 && option.allowedEfforts.includes(effort.id))
                }
                onChange={(checked) =>
                  editAllowed(key, (item) => {
                    const next = efforts
                      .map((candidate) => candidate.id)
                      .filter((id) =>
                        id === effort.id ? checked : item.allowedEfforts.includes(id),
                      );
                    if (next.length === 0) return item;
                    return {
                      ...item,
                      allowedEfforts: next,
                      defaultEffort: next.includes(item.defaultEffort)
                        ? item.defaultEffort
                        : next[0]!,
                    };
                  })
                }
              />
            ))}
          </div>
        </div>
        {allowedEfforts.length > 1 && (
          <div className="bh-model-card-field">
            <span>{t('modelPreset.defaultEffort')}</span>
            <SegmentedControl
              id={`bh-model-card-effort-${key}`}
              value={option.defaultEffort}
              options={allowedEfforts.map((effort) => ({ value: effort.id, label: effort.name }))}
              onChange={(defaultEffort) => editAllowed(key, (item) => ({ ...item, defaultEffort }))}
              label={`${name} · ${t('modelPreset.defaultEffort')}`}
              disabled={busy}
            />
          </div>
        )}
        <Input
          aria-label={t('modelPreset.noteLabel', { model: name })}
          placeholder={t('modelPreset.notePlaceholder')}
          value={option.note ?? ''}
          maxLength={500}
          disabled={busy}
          onChange={(event) => {
            const note = event.target.value;
            editAllowed(key, (item) => ({ ...item, note }));
          }}
        />
      </li>
    );
  };

  const taskEditor =
    draft === undefined || catalog === undefined ? null : (
      <section className="bh-model-task" aria-label={t('modelPreset.assignment')}>
        {draft.advanced ? (
          <div className="bh-model-picker-heading">
            <strong>{t('modelPreset.assignment')}</strong>
            <span>{t('modelPreset.allowedHint')}</span>
          </div>
        ) : (
          <ModelPicker
            title={t('modelPreset.assignment')}
            hint={t('modelPreset.assignmentHint')}
            choice={draft.assignment}
            catalog={catalog}
            options={modelOptions}
            onChange={(assignment) =>
              edit({
                assignment,
                allowed:
                  assignment.key === draft.assignment.key
                    ? draft.allowed
                    : draft.allowed.filter((option) => modelKey(option) !== draft.assignment.key),
              })
            }
            disabled={busy}
            t={t}
          />
        )}
        <button
          type="button"
          className="bh-channel-sidebar-entry-head bh-model-mode-toggle"
          aria-expanded={draft.advanced}
          disabled={busy}
          onClick={() =>
            setDraft((current) =>
              current === undefined
                ? current
                : current.advanced
                  ? { ...withAdvanced(current, false), presetId: '' }
                  : withAdvanced(current, true),
            )
          }
        >
          <span
            className={`bh-channel-sidebar-entry-chevron${draft.advanced ? '' : ' bh-chevron-collapsed'}`}
            aria-hidden="true"
          >
            <IconChevronDownOutlineRegular size={14} />
          </span>
          <span className="bh-channel-sidebar-entry-label">{t('modelPreset.advanced')}</span>
        </button>
        {draft.advanced && (
          <div className="bh-model-allowed">
            <Combobox
              value=""
              options={modelOptions.filter(
                (option) => !draft.allowed.some((item) => modelKey(item) === option.value),
              )}
              onSelect={(key) => {
                const entry = catalog.find((item) => modelKey(item) === key);
                if (entry === undefined) return;
                const effort = entry.defaultEffort ?? '';
                edit({
                  allowed: [
                    {
                      provider: entry.provider,
                      model: entry.model,
                      allowedEfforts: [effort],
                      defaultEffort: effort,
                    },
                    ...draft.allowed,
                  ],
                });
              }}
              label={t('modelPreset.addAllowed')}
              toggleLabel={t('modelPreset.showModels')}
              placeholder={t('modelPreset.addAllowed')}
              emptyLabel={t('modelPreset.noMatch')}
              disabled={busy}
            />
            <ul className="bh-card-list bh-model-cards" aria-label={t('modelPreset.allowedTitle')}>
              {draft.allowed.map((option) =>
                modelCard(option, modelKey(option) === draft.assignment.key),
              )}
            </ul>
          </div>
        )}
      </section>
    );
  return (
    <div
      ref={loadPlanOnMount}
      className="bh-model-entry"
      role="region"
      aria-label={t('modelPreset.title')}
    >
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
                    invalidateModelPlan(slug);
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
          title={t('modelPreset.orchestrator')}
          chips={presetLabel === undefined ? undefined : <Tag tone="neutral">{presetLabel}</Tag>}
          meta={summary}
          onClick={openEditor}
          dialog
        />
        {plan === undefined ? null : (
          <SidebarCardRow
            icon="list-checks"
            title={t('modelPreset.assignment')}
            chips={
              extraAllowed > 0 ? (
                <Tag tone="quiet">{t('modelPreset.moreAllowed', { count: extraAllowed })}</Tag>
              ) : undefined
            }
            meta={routeLabel(plan.assignmentDefault, t('modelPreset.providerDefault'))}
            onClick={openEditor}
            dialog
          />
        )}
      </SidebarCardList>
      {editorOpen ? null : messages}
      {editorOpen && (
        <Modal
          open
          className="bh-model-editor-modal"
          onClose={() => setEditorOpen(false)}
          closeLabel={t('common.close')}
          title={t('modelPreset.title')}
          footer={
            <div className="bh-model-editor-footer">
              <Button
                variant="ghost"
                disabled={!canSave || presetName !== undefined}
                onClick={() => setPresetName('')}
              >
                {t('modelPreset.saveAs')}
              </Button>
              <span className="bh-model-editor-footer-gap" />
              <Button variant="outline" disabled={busy} onClick={() => setEditorOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="primary" disabled={!canSave} onClick={() => void save()}>
                {t('modelPreset.save')}
              </Button>
            </div>
          }
        >
          <div className="bh-model-preset-editor">
            {catalog === undefined ? (
              <span className="bh-note">{t('modelPreset.loading')}</span>
            ) : catalog.length === 0 || draft === undefined ? (
              <span className="bh-note">{t('modelPreset.emptyCatalog')}</span>
            ) : (
              <>
                {presets.length > 0 && (
                  <div className="bh-model-preset-source">
                    <Combobox
                      value={draft.presetId}
                      options={presetOptions}
                      onSelect={(id) => {
                        const preset = presets.find((item) => item.id === id);
                        if (preset !== undefined) setDraft(draftOf(preset, preset.id));
                      }}
                      label={t('modelPreset.fromPreset')}
                      toggleLabel={t('modelPreset.showPresets')}
                      placeholder={t('modelPreset.fromPreset')}
                      emptyLabel={t('modelPreset.noMatch')}
                      disabled={busy}
                    />
                    <span className="bh-note">
                      {currentPreset === undefined
                        ? t('modelPreset.noPreset')
                        : t('modelPreset.usingPreset', { name: currentPreset.name })}
                    </span>
                  </div>
                )}
                <ModelPicker
                  title={t('modelPreset.orchestrator')}
                  hint={t('modelPreset.orchestratorHint')}
                  choice={draft.orchestrator}
                  catalog={catalog}
                  options={modelOptions}
                  onChange={(orchestrator) => edit({ orchestrator })}
                  disabled={busy}
                  t={t}
                />
                {taskEditor}
                {presetName !== undefined && (
                  <div className="bh-model-save-preset">
                    <Input
                      aria-label={t('modelPreset.name')}
                      placeholder={t('modelPreset.name')}
                      value={presetName}
                      maxLength={100}
                      autoFocus
                      onChange={(event) => setPresetName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.nativeEvent.isComposing)
                          void saveAsPreset();
                      }}
                    />
                    <Button
                      variant="outline"
                      disabled={!canSave || presetName.trim() === ''}
                      onClick={() => void saveAsPreset()}
                    >
                      {t('modelPreset.savePreset')}
                    </Button>
                    <Button
                      variant="ghost"
                      disabled={busy}
                      onClick={() => setPresetName(undefined)}
                    >
                      {t('common.cancel')}
                    </Button>
                  </div>
                )}
              </>
            )}
            {messages}
          </div>
        </Modal>
      )}
    </div>
  );
}
