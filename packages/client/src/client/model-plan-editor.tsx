import type { ComponentProps, ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { space } from './ds/tokens.stylex.js';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import type { ComboboxOption } from './combobox.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelPicker } from './model-picker.js';
import { modelKey, type ModelDraft } from './model-preset-draft.js';
import { SubChoiceList } from './sub-choice-list.js';
import type { SubChoices } from './sub-choices.js';

const styles = stylex.create({
  section: { display: 'flex', flexDirection: 'column', gap: space.x5, minWidth: 0 },
});

export function modelOptionsOf(
  catalog: readonly ModelCatalogEntryView[],
  t: BotHarnessTranslate,
): ComboboxOption[] {
  return [...catalog]
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
}

export function ModelPlanEditor({
  draft,
  catalog,
  catalogGroups,
  busy,
  updateDraft,
  subscription,
  clearEngine,
  sub,
  onSubChange,
  subLocked = false,
  t,
}: {
  draft: ModelDraft;
  catalog: readonly ModelCatalogEntryView[];
  catalogGroups: readonly ModelCatalogGroupView[];
  busy: boolean;
  updateDraft(change: (current: ModelDraft) => Partial<ModelDraft>): void;
  subscription: ComponentProps<typeof ModelPicker>['subscription'];
  clearEngine(): void;
  sub: SubChoices;
  onSubChange(sub: SubChoices): void;
  subLocked?: boolean;
  t: BotHarnessTranslate;
}): ReactElement {
  const modelOptions = modelOptionsOf(catalog, t);
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
          clearEngine();
          updateDraft(() => ({ orchestrator }));
        }}
        subscription={subscription}
        disabled={busy}
        t={t}
      />
      <SubChoiceList
        sub={sub}
        catalog={catalog}
        catalogGroups={catalogGroups}
        modelOptions={modelOptions}
        engines={
          subscription === undefined
            ? undefined
            : {
                items: subscription.items,
                models: subscription.models,
                signIn: subscription.signIn,
              }
        }
        busy={busy || subLocked}
        onChange={onSubChange}
        t={t}
      />
    </div>
  );
}
