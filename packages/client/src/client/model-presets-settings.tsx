import { useMemo, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  DEFAULT_MODEL_PRESET_ID,
  modelPresetName,
  createModelPreset,
  deleteModelPreset,
  loadModelPresetLibrary,
  updateModelPreset,
  type ModelPreset,
  type ModelPresetUsage,
  type SubscriptionModel,
} from '@botharness/host-client/model-plans';
import type { BridgeActions } from './actions.js';
import { bridgeHost, errorMessage, type BridgeCall } from './bridge.js';
import { CodexDeviceSignIn } from './codex-device-sign-in.js';
import { Button } from './ds/button.js';
import { ConfirmDialog, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { ReadFailure } from './ds/read-failure.js';
import { SettingsRows, SettingsSection } from './ds/settings-row.js';
import { TextField } from './ds/field.js';
import { space } from './ds/tokens.stylex.js';
import { bridgeEngineApi, useSubscriptionEngines, type EngineRole } from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { engineMenuItems } from './model-menu.js';
import { ModelPlanEditor } from './model-plan-editor.js';
import { draftOf, modelKey, planParts, type ModelDraft } from './model-preset-draft.js';
import { useMountedResource } from './mounted-resource.js';
import { engineName } from './session-engine.js';
import { ListCard, ListCardItem } from './ds/list-card.js';
import { RoutingGroupSettings, type RoutingGroupActions } from './routing-group-settings.js';
import { canConfigureModels } from './team-bridge.js';
import { useTeamMode } from './team-state.js';

const styles = stylex.create({
  stack: { display: 'flex', flexDirection: 'column', gap: space.x1, minWidth: 0 },
  actions: { display: 'flex', flexWrap: 'wrap', gap: space.x2 },
});

type Library = Awaited<ReturnType<typeof loadLibrary>>;
type Editor = { kind: 'create' } | { kind: 'edit'; preset: ModelPreset };
type Dialog = Editor | { kind: 'delete'; preset: ModelPreset; usage: ModelPresetUsage };

async function loadLibrary(
  call: BridgeCall,
  actions: Pick<BridgeActions, 'modelCatalog' | 'routingGroups'>,
) {
  const [presets, catalog, routes] = await Promise.all([
    loadModelPresetLibrary(bridgeHost(call)),
    actions.modelCatalog(),
    actions.routingGroups(),
  ]);
  return {
    ...presets,
    catalog,
    groupNames: new Map(routes.groups.map((group) => [group.id, group.name])),
    routes: new Map(catalog.models.map((model) => [modelKey(model), model])),
    usageById: new Map(presets.usage.map((entry) => [entry.presetId, entry])),
  };
}

function usageLabel(count: number, t: BotHarnessTranslate): string {
  return count === 1 ? t('modelPreset.usedByOne') : t('modelPreset.usedBy', { count });
}

function choiceLabel(
  preset: ModelPreset,
  role: EngineRole,
  library: Library,
  t: BotHarnessTranslate,
): string {
  const main = role === 'orchestrator' || preset.assignmentFollowsMain === true;
  const engine = main ? preset.orchestratorEngine : preset.assignmentEngine;
  if (engine !== undefined)
    return [
      engine.model ?? t('modelPreset.defaultModel'),
      t('modelPreset.engineAccount', { engine: engineName(engine.engine) }),
      engine.effort,
    ]
      .filter(Boolean)
      .join(' · ');
  const groupId = main ? preset.orchestratorGroupId : preset.assignmentDefaultGroupId;
  const route = main ? preset.orchestrator : preset.assignmentDefault;
  const entry = library.routes.get(modelKey(route));
  return [
    groupId === undefined ? undefined : (library.groupNames.get(groupId) ?? groupId),
    entry?.modelName ?? route.model,
    entry?.providerName ?? route.provider,
  ]
    .filter(Boolean)
    .join(' · ');
}

function PresetEditor({
  editor,
  library,
  call,
  owner,
  t,
  onClose,
  onSaved,
  onRefreshed,
}: {
  editor: Editor;
  library: Library;
  call: BridgeCall;
  owner: boolean;
  t: BotHarnessTranslate;
  onClose(): void;
  onSaved(preset: ModelPreset): void;
  onRefreshed(preset: ModelPreset): void;
}): ReactElement {
  const preset = editor.kind === 'edit' ? editor.preset : undefined;
  const [revision, setRevision] = useState(preset?.revision);
  const { models, groups = [], default: fallback } = library.catalog;
  const [name, setName] = useState(preset?.name ?? '');
  const [draft, setDraft] = useState(() => {
    if (preset !== undefined) return draftOf(preset, '');
    const model =
      (fallback === undefined ? undefined : library.routes.get(modelKey(fallback))) ??
      models.find((entry) => entry.credential === undefined);
    return draftOf(
      model === undefined ? {} : { orchestrator: model, assignmentDefault: model },
      '',
    );
  });
  const [engineDraft, setEngineDraft] = useState<Record<EngineRole, SubscriptionModel | null>>({
    orchestrator: preset?.orchestratorEngine ?? null,
    assignment: preset?.assignmentEngine ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const api = useMemo(() => bridgeEngineApi(call), [call]);
  const engines = useSubscriptionEngines(true, api, true, true);
  const items = engineMenuItems(
    engines.view?.engines ?? [],
    engines.models,
    engines.signingIn,
    t,
    owner,
    engines.supportsDeviceSignIn,
  );
  const changeEngine = (role: EngineRole, choice: SubscriptionModel | null) =>
    setEngineDraft((current) => ({ ...current, [role]: choice }));
  const updateDraft = (change: (current: ModelDraft) => Partial<ModelDraft>) =>
    setDraft((current) => ({ ...current, ...change(current) }));
  const parts =
    draft.orchestrator.key && draft.assignment.key ? planParts(draft, groups, models) : undefined;
  const save = async (): Promise<void> => {
    if (busy || parts === undefined) return;
    const { groups: policy, orchestrator, assignmentDefault, assignmentModels } = parts;
    const input = {
      name: name.trim(),
      ...(policy?.orchestratorGroupId === undefined ? { orchestrator } : {}),
      assignmentDefault,
      assignmentModels,
      openAssignmentModels: draft.open,
      orchestratorGroupId: policy?.orchestratorGroupId ?? null,
      orchestratorGroupEffort: policy?.orchestratorGroupEffort ?? null,
      assignmentDefaultGroupId: policy?.assignmentDefaultGroupId ?? null,
      assignmentGroups: policy?.assignmentGroups ?? [],
      assignmentGroupOptions: policy?.assignmentGroupOptions ?? [],
      orchestratorEngine: engineDraft.orchestrator,
      assignmentEngine: engineDraft.assignment,
    };
    setBusy(true);
    setError(undefined);
    const host = bridgeHost(call);
    try {
      onSaved(
        preset === undefined
          ? await createModelPreset(host, input)
          : await updateModelPreset(host, preset.id, revision ?? preset.revision, input),
      );
    } catch (cause) {
      setError(errorMessage(cause));
      if (preset !== undefined) {
        const current = await loadModelPresetLibrary(host).then(
          (snapshot) => snapshot.presets.find((entry) => entry.id === preset.id),
          () => undefined,
        );
        if (current !== undefined) {
          setRevision(current.revision);
          onRefreshed(current);
        }
      }
    } finally {
      setBusy(false);
    }
  };
  return (
    <FormDialog
      title={
        preset === undefined
          ? t('modelPreset.create')
          : t('modelPreset.editTitle', {
              name: modelPresetName(preset, t('modelPreset.defaultModel')),
            })
      }
      size="medium"
      scroll
      labels={{ close: t('common.close'), cancel: t('common.cancel') }}
      submitLabel={t('modelPreset.save')}
      submitDisabled={name.trim() === '' || parts === undefined}
      busy={busy}
      error={error}
      onCancel={() => {
        if (!busy) onClose();
      }}
      onSubmit={() => void save()}
    >
      <TextField
        label={t('modelPreset.name')}
        value={name}
        onChange={setName}
        maxLength={100}
        initialFocus
      />
      <ModelPlanEditor
        draft={draft}
        catalog={models}
        catalogGroups={groups}
        busy={busy}
        allowInheritedAssignment={false}
        showAssignmentPicker={items.length > 0 || engineDraft.assignment !== null}
        updateDraft={updateDraft}
        subscription={(role) => ({
          choice: engineDraft[role],
          items,
          models: engines.models,
          onChange: (choice) => changeEngine(role, choice),
          signIn: engines.signIn,
        })}
        clearEngine={(role) => changeEngine(role, null)}
        t={t}
      />
      <div ref={engines.mount}>
        <CodexDeviceSignIn engines={engines} t={t} />
        {engines.signInUrl === undefined ? null : (
          <Note>
            <a href={engines.signInUrl} target="_blank" rel="noopener noreferrer">
              {t('engine.openSignIn')}
            </a>
          </Note>
        )}
        {engines.error === undefined ? null : <Note tone="danger">{engines.error}</Note>}
      </div>
    </FormDialog>
  );
}

export function ModelPresetsSettings({
  call,
  actions,
  t,
}: {
  call: BridgeCall;
  actions: RoutingGroupActions;
  t: BotHarnessTranslate;
}): ReactElement {
  const viewer = useTeamMode(call)?.viewer;
  const editable = canConfigureModels(viewer);
  const [library, setLibrary] = useState<Library>();
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<Dialog>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const edits = useRef(0);
  const editLibrary = (next: Library) => {
    edits.current += 1;
    setLibrary(next);
  };
  const mount = useMountedResource<HTMLElement>(() => {
    let active = true;
    const started = edits.current;
    void loadLibrary(call, actions).then(
      (next) => {
        if (!active) return;
        if (edits.current === started) setLibrary(next);
        else setLoadAttempt((attempt) => attempt + 1);
      },
      () => {
        if (active) setFailed(true);
      },
    );
    return () => {
      active = false;
    };
  }, [call, actions, loadAttempt]);
  const title = t('botSettings.section.modelPresets');
  const close = () => {
    setDialog(undefined);
    setError(undefined);
  };
  const reviewDelete = async (preset: ModelPreset): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    try {
      const snapshot = await loadModelPresetLibrary(bridgeHost(call));
      const selected = snapshot.presets.find((entry) => entry.id === preset.id);
      const usage = snapshot.usage.find((entry) => entry.presetId === preset.id);
      if (selected === undefined || usage === undefined) {
        setError(t('modelPreset.libraryChanged'));
        return;
      }
      setDialog({ kind: 'delete', preset: selected, usage });
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const presetTile = (current: Library) => (preset: ModelPreset) => {
    const name = modelPresetName(preset, t('modelPreset.defaultModel'));
    const pinned = preset.id === DEFAULT_MODEL_PRESET_ID;
    return (
      <ListCardItem
        key={preset.id}
        title={name}
        summary={
          <span {...stylex.props(styles.stack)}>
            {pinned ? <span>{t('modelConfig.defaultHint')}</span> : null}
            <span>
              {t('modelPreset.orchestrator')} · {choiceLabel(preset, 'orchestrator', current, t)}
            </span>
            <span>
              {t('modelPreset.assignment')} · {choiceLabel(preset, 'assignment', current, t)}
            </span>
            <span>{usageLabel(current.usageById.get(preset.id)?.count ?? 0, t)}</span>
          </span>
        }
        trailing={
          editable ? (
            <div {...stylex.props(styles.actions)}>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                aria-label={t('modelPreset.editTitle', { name })}
                onClick={() => setDialog({ kind: 'edit', preset })}
              >
                {t('modelPreset.edit')}
              </Button>
              {pinned ? null : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  aria-label={t('modelPreset.deleteTitle', { name })}
                  onClick={() => void reviewDelete(preset)}
                >
                  {t('modelPreset.delete')}
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    );
  };
  const pinned = library?.presets.filter((preset) => preset.id === DEFAULT_MODEL_PRESET_ID) ?? [];
  const others = library?.presets.filter((preset) => preset.id !== DEFAULT_MODEL_PRESET_ID) ?? [];
  return (
    <SettingsRows>
      <SettingsSection
        rootRef={mount}
        title={t('modelConfig.section.default')}
        data={{ 'data-model-presets-settings': '' }}
      >
        {failed ? (
          <ReadFailure
            retryLabel={t('engine.reload')}
            onRetry={() => {
              setFailed(false);
              setLoadAttempt((attempt) => attempt + 1);
            }}
          >
            {t('modelPreset.libraryLoadFailed')}
          </ReadFailure>
        ) : library === undefined ? (
          <Note>{t('modelPreset.loading')}</Note>
        ) : pinned.length === 0 ? (
          <Note>{t('modelConfig.defaultMissing')}</Note>
        ) : (
          <ListCard label={t('modelConfig.section.default')}>
            {pinned.map(presetTile(library))}
          </ListCard>
        )}
      </SettingsSection>
      {library === undefined ? null : (
        <SettingsSection
          title={t('modelConfig.section.presets')}
          action={
            editable ? (
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={() => setDialog({ kind: 'create' })}
              >
                {t('modelPreset.create')}
              </Button>
            ) : undefined
          }
        >
          {others.length === 0 ? (
            <Note>{t('modelConfig.emptyPresets')}</Note>
          ) : (
            <ListCard label={title}>{others.map(presetTile(library))}</ListCard>
          )}
          {error !== undefined && dialog === undefined ? <Note tone="danger">{error}</Note> : null}
          {editable && library !== undefined && dialog !== undefined ? (
            dialog.kind === 'delete' ? (
              <ConfirmDialog
                title={t('modelPreset.deleteTitle', { name: dialog.preset.name })}
                labels={{ close: t('common.close'), cancel: t('common.cancel') }}
                confirmLabel={t('modelPreset.delete')}
                busy={busy}
                error={error}
                onCancel={close}
                onConfirm={() => {
                  if (busy) return;
                  setBusy(true);
                  setError(undefined);
                  void deleteModelPreset(bridgeHost(call), dialog.preset.id, dialog.preset.revision)
                    .then(
                      () => {
                        editLibrary({
                          ...library,
                          presets: library.presets.filter(({ id }) => id !== dialog.preset.id),
                        });
                        close();
                      },
                      (cause: unknown) => setError(errorMessage(cause)),
                    )
                    .finally(() => setBusy(false));
                }}
              >
                {dialog.usage.count > 0 ? (
                  <>
                    <Note>{t('modelPreset.keepCopies')}</Note>
                    {dialog.usage.botNames.length === 0 ? null : (
                      <ul>
                        {dialog.usage.botNames.map((name, index) => (
                          <li key={index}>{name}</li>
                        ))}
                      </ul>
                    )}
                    {dialog.usage.count > dialog.usage.botNames.length ? (
                      <Note>
                        {t('modelPreset.privateUsage', {
                          count: dialog.usage.count - dialog.usage.botNames.length,
                        })}
                      </Note>
                    ) : null}
                  </>
                ) : (
                  <Note>{t('modelPreset.deleteUnused')}</Note>
                )}
              </ConfirmDialog>
            ) : (
              <PresetEditor
                editor={dialog}
                library={library}
                call={call}
                owner={viewer?.owner === true}
                t={t}
                onClose={close}
                onSaved={(preset) => {
                  editLibrary({
                    ...library,
                    presets:
                      dialog.kind === 'create'
                        ? [...library.presets, preset]
                        : library.presets.map((entry) => (entry.id === preset.id ? preset : entry)),
                  });
                  close();
                }}
                onRefreshed={(preset) =>
                  editLibrary({
                    ...library,
                    presets: library.presets.map((entry) =>
                      entry.id === preset.id ? preset : entry,
                    ),
                  })
                }
              />
            )
          ) : null}
        </SettingsSection>
      )}
      <RoutingGroupSettings
        actions={actions}
        canConfigure={editable}
        t={t}
        onChanged={() => setLoadAttempt((attempt) => attempt + 1)}
      />
    </SettingsRows>
  );
}
