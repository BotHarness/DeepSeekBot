import type { ReactElement } from 'react';
import { ScrollView, View } from 'react-native';

import { sameModel } from '@botharness/host-client/bot-settings';
import { modelCatalogGroupEfforts } from '@botharness/host-client/model-catalog';
import {
  assignmentEffortRange,
  modelRoutes,
  type AssignmentEffortTarget,
  type ModelSettingsState,
} from '@botharness/host-client/model-settings';
import { space } from '../design/tokens';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { useStrings } from '../strings';
import { EffortBar } from './model-effort';
import { effortChoices, routeLabel } from './model-route-text';
import { SHEET_GROUP, SheetNote } from './sheet';

interface AllowedEffortItem {
  target: AssignmentEffortTarget;
  name: string;
  choices: { value: string; label: string }[];
}

function allowedEffortItems(value: ModelSettingsState): AllowedEffortItem[] {
  const routes = modelRoutes(value);
  const models = routes.assignmentModels.map((option): AllowedEffortItem => ({
    target: { kind: 'model', provider: option.provider, model: option.model },
    name: routeLabel(value, option),
    choices: effortChoices(value.models.find((entry) => sameModel(entry, option))),
  }));
  const groups = (routes.groups.assignmentGroups ?? []).flatMap((id): AllowedEffortItem[] => {
    const group = value.groups?.find((entry) => entry.id === id);
    if (group === undefined) return [];
    return [
      {
        target: { kind: 'group', id },
        name: group.name,
        choices: modelCatalogGroupEfforts(group, value.models).map((effort) => ({
          value: effort.id,
          label: effort.name,
        })),
      },
    ];
  });
  return [...models, ...groups].filter((item) => item.choices.length > 0);
}

function allowedEffortItem(
  value: ModelSettingsState,
  target: AssignmentEffortTarget,
): AllowedEffortItem | undefined {
  return allowedEffortItems(value).find((item) =>
    item.target.kind === 'group'
      ? target.kind === 'group' && item.target.id === target.id
      : item.target.kind === 'model' && target.kind === 'model' && sameModel(item.target, target),
  );
}

export function AllowedEffortPage({
  value,
  target,
  busy,
  header,
  onSave,
}: {
  value: ModelSettingsState;
  target: AssignmentEffortTarget;
  busy: boolean;
  header: ReactElement | null;
  onSave(allowed: string[], defaultEffort: string): void;
}) {
  const t = useStrings();
  const item = allowedEffortItem(value, target);
  const range = assignmentEffortRange(value, target);
  if (item === undefined || range === undefined)
    return (
      <View>
        {header}
        <SheetNote>{t.modelSettings.noResults}</SheetNote>
      </View>
    );
  const group = target.kind === 'group';
  const any = group && range.allowed.length === 0;
  const checked = (id: string) => any || range.allowed.includes(id);
  const allowed = item.choices.filter((choice) => checked(choice.value));
  const toggle = (id: string, on: boolean) => {
    const next = item.choices
      .map((choice) => choice.value)
      .filter((candidate) => (candidate === id ? on : checked(candidate)));
    if (next.length === 0 && !group) return;
    onSave(next, range.defaultEffort);
  };
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingVertical: space.x3 }}
    >
      {header}
      <SheetNote>
        {group
          ? t.modelSettings.allowedEffortGroupHint(item.name)
          : t.modelSettings.allowedEffortModelHint(item.name)}
      </SheetNote>
      <View>
        {item.choices.map((choice, index) => {
          const locked =
            range.locked === choice.value ||
            (!group && allowed.length === 1 && checked(choice.value));
          return (
            <SettingsGroupItem
              key={choice.value}
              first={index === 0}
              last={index === item.choices.length - 1}
              on={SHEET_GROUP}
            >
              <SettingsRow
                on={SHEET_GROUP}
                testID={`model-allowed-effort-${choice.value || 'default'}`}
                title={choice.label}
                {...(range.locked === choice.value ? { detail: t.modelSettings.effortLocked } : {})}
                control={{
                  kind: 'switch',
                  value: checked(choice.value),
                  disabled: busy || locked,
                  onChange: (on: boolean) => toggle(choice.value, on),
                }}
              />
            </SettingsGroupItem>
          );
        })}
      </View>
      {range.locked === undefined && allowed.length > 1 && !any ? (
        <EffortBar
          options={allowed}
          current={range.defaultEffort}
          note={t.modelSettings.effortDefaultLevel}
          busy={busy}
          onChange={(effort) => onSave(range.allowed, effort)}
        />
      ) : null}
    </ScrollView>
  );
}
