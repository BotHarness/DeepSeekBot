import { Button } from './ds/button.js';
import { Input } from './ds/input.js';
import { SegmentedControl } from './ds/segmented.js';
import { Switch } from './ds/switch.js';
import { useRef, useState, type ReactElement } from 'react';
import { Checkbox, Tag } from '@deepseek-ai/dsh-client-ui-primitives';
import * as stylex from '@stylexjs/stylex';
import { modelEffortChoices } from '@botharness/host-client/model-catalog';

import type { BridgeActions } from './actions.js';
import type {
  AssignmentGroupOptionView,
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelPlanGroupsView,
  ModelPlanView,
  ModelPlanStateView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { errorMessage } from './bridge.js';
import { Combobox, type ComboboxOption } from './combobox.js';
import { Note } from './ds/note.js';
import { PanelDialog } from './ds/panel-dialog.js';
import { border, color, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { groupFrontHint, groupMenuId, groupMenuKey } from './model-menu.js';
import { ModelPicker } from './model-picker.js';
import {
  assignmentChoice,
  draftOf,
  modelKey,
  planParts,
  routeLabel,
  routeOfKey,
  trailing,
  withAdvanced,
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
  savePreset: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  grow: { flexGrow: 1, minWidth: 0 },
});

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
  const [presetName, setPresetName] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [editorOpen, setEditorOpen] = useState(onClose !== undefined);
  const [selectionMode, setSelectionMode] = useState('models');
  const [modeSwitched, setModeSwitched] = useState(false);

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
        if (first === undefined) return undefined;
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
    setPresetName(undefined);
    setError(undefined);
    setModeSwitched(false);
    setSelectionMode('models');
    setEditorOpen(true);
    void load();
  };

  const edit = (change: Partial<ModelDraft>): void =>
    setDraft((current) =>
      current === undefined ? current : { ...current, ...change, presetId: '' },
    );

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
  const canApply =
    canSave && (plan !== undefined || JSON.stringify(draft) !== JSON.stringify(initialDraft));

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
        draft.assignment.key === '' ? undefined : planParts(draft, catalogGroups, catalog);
      const applied =
        draft.presetId !== '' && presets.some((preset) => preset.id === draft.presetId)
          ? await actions.applyModelPreset(slug, draft.presetId)
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
      if (applied === undefined) setError(t('modelPreset.routeUnavailable'));
      else finish(applied);
    } catch (failure) {
      setError(errorMessage(failure));
    } finally {
      setBusy(false);
    }
  };

  const saveAsPreset = async (): Promise<void> => {
    const name = presetName?.trim() ?? '';
    if (!canSave || draft === undefined || draft.assignment.key === '' || name === '') return;
    const parts = planParts(draft, catalogGroups, catalog);
    if (parts === undefined) {
      setError(t('modelPreset.routeUnavailable'));
      return;
    }
    setBusy(true);
    setError(undefined);
    try {
      const preset = await actions.createModelPreset(
        name,
        parts.orchestrator,
        parts.assignmentDefault,
        parts.assignmentModels,
        ...trailing(draft, parts),
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
  const currentPreset = presets.find((preset) => preset.id === draft?.presetId);

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
              options={allowedEfforts.map((effort) => ({
                value: effort.id,
                label: effort.name,
              }))}
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

  const editGroup = (
    group: string,
    change: (option: AssignmentGroupOptionView) => AssignmentGroupOptionView,
  ): void =>
    setDraft((current) =>
      current === undefined
        ? current
        : {
            ...current,
            presetId: '',
            groups: current.groups.map((item) => (item.group === group ? change(item) : item)),
          },
    );

  const groupCard = (option: AssignmentGroupOptionView, isDefault: boolean) => {
    const group = catalogGroups.find((item) => item.id === option.group);
    const name = group?.name ?? option.group;
    const routes = group?.routes ?? [];
    const frontHint = groupFrontHint(group, catalog ?? [], t);
    const lists = routes.map(
      (route) => catalog?.find((item) => modelKey(item) === modelKey(route))?.efforts ?? [],
    );
    const shared = (lists[0] ?? []).filter((effort) =>
      lists.every((list) => list.some((item) => item.id === effort.id)),
    );
    const allowed = option.allowedEfforts ?? [];
    const checkedEfforts = shared.filter((effort) => allowed.includes(effort.id));
    const stale = allowed.some((id) => !shared.some((effort) => effort.id === id));
    return (
      <li key={`group:${option.group}`} className="bh-card-row bh-model-card" data-model-group="">
        <div className="bh-model-card-head">
          <strong>{name}</strong>
          <span className="bh-model-card-provider">
            {t('modelPreset.groupCount', { count: routes.length })}
          </span>
          {isDefault ? (
            <Tag tone="neutral">{t('modelPreset.defaultModel')}</Tag>
          ) : (
            <>
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  edit({ assignment: { key: groupMenuKey(option.group), effort: '' } })
                }
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
                          groups: current.groups.filter((item) => item.group !== option.group),
                        },
                  )
                }
              >
                ×
              </Button>
            </>
          )}
        </div>
        {frontHint === undefined ? null : (
          <span className="bh-model-card-provider">{frontHint}</span>
        )}
        {stale ? (
          <div className="bh-model-card-field">
            <span className="bh-note">{t('modelPreset.groupEffortsStale')}</span>
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() =>
                editGroup(
                  option.group,
                  ({ allowedEfforts: _efforts, defaultEffort: _default, ...rest }) => rest,
                )
              }
            >
              {t('modelPreset.groupEffortsClear')}
            </Button>
          </div>
        ) : null}
        {shared.length === 0 ? null : (
          <div className="bh-model-card-field">
            <span>{t('modelPreset.allowedEfforts')}</span>
            <div className="bh-model-card-efforts">
              {shared.map((effort) => (
                <Checkbox
                  key={effort.id}
                  label={effort.name}
                  checked={allowed.includes(effort.id)}
                  disabled={busy}
                  onChange={(checked) =>
                    editGroup(option.group, (item) => {
                      const next = shared
                        .map((candidate) => candidate.id)
                        .filter((id) =>
                          id === effort.id ? checked : (item.allowedEfforts ?? []).includes(id),
                        );
                      const { allowedEfforts: _efforts, defaultEffort: _default, ...rest } = item;
                      return next.length === 0
                        ? rest
                        : {
                            ...rest,
                            allowedEfforts: next,
                            defaultEffort:
                              item.defaultEffort !== undefined && next.includes(item.defaultEffort)
                                ? item.defaultEffort
                                : next[0]!,
                          };
                    })
                  }
                />
              ))}
            </div>
            {allowed.length === 0 ? (
              <span className="bh-note">{t('modelPreset.groupEffortsHint')}</span>
            ) : null}
          </div>
        )}
        {checkedEfforts.length > 1 && (
          <div className="bh-model-card-field">
            <span>{t('modelPreset.defaultEffort')}</span>
            <SegmentedControl
              id={`bh-model-card-effort-group-${option.group}`}
              value={option.defaultEffort ?? checkedEfforts[0]!.id}
              options={checkedEfforts.map((effort) => ({ value: effort.id, label: effort.name }))}
              onChange={(defaultEffort) =>
                editGroup(option.group, (item) => ({ ...item, defaultEffort }))
              }
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
            editGroup(option.group, (item) => ({ ...item, note }));
          }}
        />
      </li>
    );
  };

  const modeControl =
    draft === undefined || draft.assignment.key === '' ? null : (
      <SegmentedControl
        id="bh-model-task-mode"
        value={draft.advanced ? 'advanced' : 'simple'}
        options={[
          { value: 'simple', label: t('modelPreset.modeSimple') },
          { value: 'advanced', label: t('modelPreset.modeAdvanced') },
        ]}
        onChange={(mode) => {
          setModeSwitched(true);
          setDraft((current) =>
            current === undefined || current.advanced === (mode === 'advanced')
              ? current
              : current.advanced
                ? { ...withAdvanced(current, false), presetId: '' }
                : withAdvanced(current, true),
          );
        }}
        label={t('modelPreset.mode')}
        disabled={busy}
      />
    );

  const taskEditor =
    draft === undefined || catalog === undefined ? null : (
      <section
        className="bh-model-task"
        aria-label={t('modelPreset.assignment')}
        data-mode-switched={modeSwitched || undefined}
      >
        {draft.advanced ? (
          <div className="bh-model-picker-heading-row">
            <div className="bh-model-picker-heading">
              <strong>{t('modelPreset.assignment')}</strong>
              <span>{t('modelPreset.allowedHint')}</span>
            </div>
            {modeControl}
          </div>
        ) : (
          <ModelPicker
            title={t('modelPreset.assignment')}
            hint={t('modelPreset.assignmentHint')}
            choice={draft.assignment}
            catalog={catalog}
            groups={catalogGroups}
            groupEffort
            options={
              plan?.assignmentDefault === undefined
                ? [{ value: '', label: t('onboarding.inherit') }, ...modelOptions]
                : modelOptions
            }
            onChange={(assignment) =>
              edit({
                assignment,
                allowed:
                  assignment.key === draft.assignment.key ||
                  groupMenuId(assignment.key) !== undefined
                    ? draft.allowed
                    : draft.allowed.filter((option) => modelKey(option) !== draft.assignment.key),
              })
            }
            disabled={busy}
            action={modeControl}
            t={t}
          />
        )}
        {draft.advanced && (
          <div className="bh-model-allowed">
            <Combobox
              value=""
              options={[
                ...catalogGroups
                  .filter((group) => !draft.groups.some((item) => item.group === group.id))
                  .map((group) => ({
                    value: groupMenuKey(group.id),
                    label: group.name,
                    hint: t('modelPreset.groupCount', { count: group.routes.length }),
                  })),
                ...modelOptions.filter(
                  (option) => !draft.allowed.some((item) => modelKey(item) === option.value),
                ),
              ]}
              onSelect={(key) => {
                const group = groupMenuId(key);
                if (group !== undefined) {
                  edit({ groups: [{ group }, ...draft.groups] });
                  return;
                }
                const entry = catalog.find((item) => modelKey(item) === key);
                if (entry === undefined) return;
                edit({
                  allowed: [
                    { provider: entry.provider, model: entry.model, ...modelEffortChoices(entry) },
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
              {draft.groups.map((option) =>
                groupCard(option, groupMenuKey(option.group) === draft.assignment.key),
              )}
              {draft.allowed.map((option) =>
                modelCard(option, modelKey(option) === draft.assignment.key),
              )}
            </ul>
          </div>
        )}
        {draft.assignment.key === '' ? null : (
          <div className="bh-model-picker-heading-row">
            <div className="bh-model-picker-heading">
              <strong>{t('modelPreset.openModels')}</strong>
              <span>{t('modelPreset.openModelsHint')}</span>
            </div>
            <Switch
              checked={draft.open}
              label={t('modelPreset.openModels')}
              disabled={busy}
              onChange={(open) => edit({ open })}
            />
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
            selectionMode === 'models' ? (
              <Button
                variant="ghost"
                disabled={!canSave || draft?.assignment.key === '' || presetName !== undefined}
                onClick={() => setPresetName('')}
              >
                {t('modelPreset.saveAs')}
              </Button>
            ) : undefined
          }
          actions={
            <>
              <Button variant="outline" disabled={busy} onClick={closeEditor}>
                {t('common.cancel')}
              </Button>
              <Button
                variant="primary"
                disabled={!canApply || (selectionMode === 'presets' && !currentPreset)}
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
          ) : catalog.length === 0 || draft === undefined ? (
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
                              {groupName(preset.orchestratorGroupId) ??
                                presetRouteLabel(preset.orchestrator)}
                            </span>
                            <span className="bh-card-meta-line">
                              {t('modelPreset.assignment')} ·{' '}
                              {groupName(preset.assignmentDefaultGroupId) ??
                                presetRouteLabel(preset.assignmentDefault)}
                            </span>
                          </>
                        }
                        disabled={busy}
                        onClick={() => setDraft(draftOf(preset, preset.id))}
                      />
                    ))}
                  </SidebarCardList>
                  <Note>
                    {currentPreset === undefined
                      ? t('modelPreset.noPreset')
                      : t('modelPreset.usingPreset', {
                          name: currentPreset.name,
                        })}
                  </Note>
                  {presets.length === 0 && <Note>{t('modelPreset.emptyPresets')}</Note>}
                </div>
              ) : (
                <>
                  <ModelPicker
                    title={t('modelPreset.orchestrator')}
                    hint={t('modelPreset.orchestratorHint')}
                    choice={draft.orchestrator}
                    catalog={catalog}
                    groups={catalogGroups}
                    groupEffort
                    options={modelOptions}
                    onChange={(orchestrator) => edit({ orchestrator })}
                    disabled={busy}
                    t={t}
                  />
                  {taskEditor}
                  {presetName !== undefined && (
                    <div {...stylex.props(styles.savePreset)}>
                      <span {...stylex.props(styles.grow)}>
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
                      </span>
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
            </>
          )}
          {messages}
        </PanelDialog>
      )}
    </div>
  );
}
