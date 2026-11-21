import { useState, type ComponentProps, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { modelEffortChoices } from '@botharness/host-client/model-catalog';
import { SegmentedControl } from './ds/segmented.js';
import { Switch } from './ds/switch.js';
import { space, color, text } from './ds/tokens.stylex.js';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import { AssignmentModelPolicy } from './assignment-model-policy.js';
import type { ComboboxOption } from './combobox.js';
import type { EngineRole } from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { groupMenuId, groupMenuItems, modelMenuItems } from './model-menu.js';
import { ModelPicker } from './model-picker.js';
import { modelKey, withAdvanced, type ModelDraft } from './model-preset-draft.js';
import { ModelTrigger } from './model-trigger.js';

const styles = stylex.create({
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  headingRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
  },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    color: color.muted,
    fontSize: text.metaSize,
  },
});

export function ModelPlanEditor({
  draft,
  catalog,
  catalogGroups,
  busy,
  allowInheritedAssignment,
  showAssignmentPicker,
  updateDraft,
  subscription,
  clearEngine,
  t,
}: {
  draft: ModelDraft;
  catalog: readonly ModelCatalogEntryView[];
  catalogGroups: readonly ModelCatalogGroupView[];
  busy: boolean;
  allowInheritedAssignment: boolean;
  showAssignmentPicker: boolean;
  updateDraft(change: (current: ModelDraft) => Partial<ModelDraft>): void;
  subscription(role: EngineRole): ComponentProps<typeof ModelPicker>['subscription'];
  clearEngine(role: EngineRole): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [modeSwitched, setModeSwitched] = useState(false);
  const edit = (change: Partial<ModelDraft>): void => updateDraft(() => change);
  const modelOptions: ComboboxOption[] = [...catalog]
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
  const modeControl =
    draft.assignment.key === '' ? null : (
      <SegmentedControl
        id="bh-model-task-mode"
        value={draft.advanced ? 'advanced' : 'simple'}
        options={[
          { value: 'simple', label: t('modelPreset.modeSimple') },
          { value: 'advanced', label: t('modelPreset.modeAdvanced') },
        ]}
        onChange={(mode) => {
          setModeSwitched(true);
          if (draft.advanced !== (mode === 'advanced'))
            edit(withAdvanced(draft, mode === 'advanced'));
        }}
        label={t('modelPreset.mode')}
        disabled={busy}
      />
    );

  const taskEditor = (
    <section
      {...stylex.props(styles.section)}
      aria-label={t('modelPreset.assignment')}
      data-mode-switched={modeSwitched || undefined}
    >
      {draft.advanced && !showAssignmentPicker ? (
        <div {...stylex.props(styles.headingRow)}>
          <div {...stylex.props(styles.heading)}>
            <strong>{t('modelPreset.assignment')}</strong>
            <span>{t('modelPreset.allowedHint')}</span>
          </div>
          {modeControl}
        </div>
      ) : (
        <ModelPicker
          title={t('modelPreset.assignment')}
          hint={t(draft.advanced ? 'modelPreset.allowedHint' : 'modelPreset.assignmentHint')}
          choice={draft.assignment}
          catalog={catalog}
          groups={catalogGroups}
          groupEffort
          options={
            allowInheritedAssignment
              ? [{ value: '', label: t('onboarding.inherit') }, ...modelOptions]
              : modelOptions
          }
          onChange={(assignment) => {
            clearEngine('assignment');
            const group = groupMenuId(assignment.key);
            if (draft.advanced && assignment.key !== '') {
              edit(withAdvanced({ ...draft, assignment }, true));
              return;
            }
            edit({
              assignment,
              allowed:
                assignment.key === draft.assignment.key || group !== undefined
                  ? draft.allowed
                  : draft.allowed.filter((option) => modelKey(option) !== draft.assignment.key),
            });
          }}
          subscription={subscription('assignment')}
          disabled={busy}
          action={modeControl}
          t={t}
        />
      )}
      {draft.advanced && (
        <div {...stylex.props(styles.section)}>
          <ModelTrigger
            value=""
            items={[
              ...groupMenuItems(catalog, t, catalogGroups)
                .filter(
                  (item) =>
                    item.group !== undefined &&
                    !draft.groups.some((choice) => choice.group === item.group),
                )
                .map((group) => ({ ...group, disabled: false })),
              ...modelMenuItems(
                modelOptions.filter(
                  (option) => !draft.allowed.some((item) => modelKey(item) === option.value),
                ),
                catalog,
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
            placeholder={t('modelPreset.addAllowed')}
            disabled={busy}
            t={t}
          />
          <AssignmentModelPolicy
            draft={draft}
            catalog={catalog}
            catalogGroups={catalogGroups}
            busy={busy}
            t={t}
            updateDraft={updateDraft}
            onMakeDefault={(assignment) => {
              clearEngine('assignment');
              edit({ assignment });
            }}
          />
        </div>
      )}
      {draft.assignment.key === '' ? null : (
        <div {...stylex.props(styles.headingRow)}>
          <div {...stylex.props(styles.heading)}>
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
    <div {...stylex.props(styles.section)}>
      <ModelPicker
        title={t('modelPreset.orchestrator')}
        hint={t('modelPreset.orchestratorHint')}
        choice={draft.orchestrator}
        catalog={catalog}
        groups={catalogGroups}
        groupEffort
        options={modelOptions}
        onChange={(orchestrator) => {
          clearEngine('orchestrator');
          edit({ orchestrator });
        }}
        subscription={subscription('orchestrator')}
        disabled={busy}
        t={t}
      />
      {taskEditor}
    </div>
  );
}
