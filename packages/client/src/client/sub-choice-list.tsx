import { useId, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  modelCatalogGroupEfforts,
  modelEffortChoices,
} from '@botharness/host-client/model-catalog';
import {
  addSubChoice,
  removeSubChoice,
  setSubDefault,
  setSubEffort,
  setSubNote,
  staleGroupEfforts,
  subSelectionOf,
  type SubChoice,
  type SubChoices,
} from '@botharness/host-client/preset-sub';

import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { IconButton } from './ds/icon-button.js';
import { Input } from './ds/input.js';
import { Note } from './ds/note.js';
import { ListCard, ListCardItem, aboveListToggle } from './ds/list-card.js';
import { SegmentedControl } from './ds/segmented.js';
import { Tag } from './ds/tag.js';
import { color, space, text } from './ds/tokens.stylex.js';
import type { EngineId, EngineModels } from './engine-choice.js';
import type { BotHarnessTranslate } from './locale.js';
import { TargetBrandIcon } from './model-brand.js';
import {
  engineDeviceSignInKey,
  engineMenuKey,
  engineModelOf,
  engineSelectionOf,
  engineSignInKey,
  groupMenuId,
  groupMenuItems,
  groupMenuKey,
  modelMenuItems,
  selectedEngineMenuItem,
  type ModelMenuItem,
} from './model-menu.js';
import { ModelTrigger } from './model-trigger.js';
import { matchesPresetSubChoice } from '@botharness/host-protocol/preset-sub';
import type { ComboboxOption } from './combobox.js';

const styles = stylex.create({
  section: { display: 'flex', flexDirection: 'column', gap: space.x3, minWidth: 0 },
  heading: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    color: color.muted,
    fontSize: text.metaSize,
  },
  title: { color: color.fg },
  detail: { display: 'flex', flexDirection: 'column', gap: space.x2, minWidth: 0 },
  field: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.x3,
    color: color.muted,
    fontSize: text.metaSize,
  },
});

export interface SubChoiceEngines {
  items: readonly ModelMenuItem[];
  models: EngineModels;
  signIn(engine: EngineId, accountId?: string, mode?: 'device-auth'): void;
}

interface Effort {
  id: string;
  name: string;
}

export function SubChoiceList({
  sub,
  catalog,
  catalogGroups,
  modelOptions,
  engines,
  busy,
  onChange,
  t,
}: {
  sub: SubChoices;
  catalog: readonly ModelCatalogEntryView[];
  catalogGroups: readonly ModelCatalogGroupView[];
  modelOptions: readonly ComboboxOption[];
  engines?: SubChoiceEngines | undefined;
  busy: boolean;
  onChange(sub: SubChoices): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [open, setOpen] = useState<string>();
  const groupItems = groupMenuItems(catalog, t, catalogGroups);
  const modelItems = modelMenuItems(modelOptions, catalog);
  const keyOf = (choice: SubChoice): string => {
    switch (choice.kind) {
      case 'model':
        return JSON.stringify([choice.provider, choice.model]);
      case 'group':
        return groupMenuKey(choice.group);
      case 'engine': {
        const model =
          choice.model ??
          (engines === undefined ? undefined : engineModelOf(choice, engines.models)?.id);
        return engineMenuKey(choice.engine, model ?? '', choice.accountId);
      }
    }
  };
  const itemOf = (choice: SubChoice): ModelMenuItem | undefined => {
    const key = keyOf(choice);
    if (choice.kind === 'engine') {
      const listed = engines?.items.find((item) => item.value === key);
      if (listed !== undefined) return listed;
      const model = engines === undefined ? undefined : engineModelOf(choice, engines.models);
      return selectedEngineMenuItem(choice, model, t);
    }
    return [...groupItems, ...modelItems].find((item) => item.value === key);
  };
  const effortsOf = (choice: SubChoice): Effort[] => {
    switch (choice.kind) {
      case 'model':
        return (
          catalog.find((item) => item.provider === choice.provider && item.model === choice.model)
            ?.efforts ?? []
        ).filter((effort) => effort.id !== '');
      case 'group': {
        const group = catalogGroups.find((item) => item.id === choice.group);
        return group === undefined ? [] : modelCatalogGroupEfforts(group, [...catalog]);
      }
      case 'engine':
        return engines === undefined ? [] : (engineModelOf(choice, engines.models)?.efforts ?? []);
    }
  };
  const effortOf = (choice: SubChoice): string =>
    (choice.kind === 'engine' ? choice.effort : choice.defaultEffort) ?? '';
  const add = (key: string): void => {
    const engineItem = engines?.items.find((item) => item.value === key);
    if (engineItem?.engine !== undefined && engines !== undefined) {
      if (key === engineSignInKey(engineItem.engine, engineItem.accountId))
        engines.signIn(engineItem.engine, engineItem.accountId);
      else if (key === engineDeviceSignInKey(engineItem.engine, engineItem.accountId))
        engines.signIn(engineItem.engine, engineItem.accountId, 'device-auth');
      else {
        const selected = engineSelectionOf(engineItem, engines.models);
        if (selected !== undefined) push({ kind: 'engine', ...selected });
      }
      return;
    }
    const group = groupMenuId(key);
    if (group !== undefined) {
      push({ kind: 'group', group });
      return;
    }
    const entry = catalog.find((item) => JSON.stringify([item.provider, item.model]) === key);
    if (entry !== undefined)
      push({
        kind: 'model',
        provider: entry.provider,
        model: entry.model,
        ...modelEffortChoices(entry),
      });
  };
  const push = (choice: SubChoice): void => {
    const next = addSubChoice(sub, choice);
    if (next !== sub) onChange(next);
  };
  const taken = new Set(sub.choices.map(keyOf));
  const addItems = [
    ...groupItems
      .filter((item) => !taken.has(item.value))
      .map((item) => ({ ...item, disabled: false })),
    ...modelItems.filter((item) => !taken.has(item.value)),
    ...(engines?.items ?? []).filter((item) => !taken.has(item.value)),
  ];

  const tile = (choice: SubChoice, index: number): ReactElement => {
    const selection = subSelectionOf(choice);
    const key = JSON.stringify(selection);
    const item = itemOf(choice);
    const name =
      item?.name ?? (choice.kind === 'group' ? choice.group : (choice.model ?? choice.kind));
    const isDefault = sub.default !== null && matchesPresetSubChoice(choice, sub.default);
    const efforts = effortsOf(choice);
    const effort = effortOf(choice);
    const effortName = efforts.find((entry) => entry.id === effort)?.name;
    const expanded = open === key;
    const groupEfforts = choice.kind === 'group' ? efforts.map((entry) => entry.id) : [];
    const stale = staleGroupEfforts(choice, groupEfforts);
    const changeEffort = (next: string) =>
      onChange(setSubEffort(sub, selection, next, groupEfforts));
    const detailId = `${id}-${index}`;
    return (
      <ListCardItem
        key={key}
        leading={
          choice.kind === 'group' ? (
            <Icon name="git-branch" size={16} />
          ) : (
            <TargetBrandIcon brand={item?.brand} external={choice.kind === 'engine'} size={16} />
          )
        }
        title={name}
        summary={[item?.hint, effortName].filter(Boolean).join(' · ') || undefined}
        toggle={{
          label: t('modelPreset.subEdit', { model: name }),
          expanded,
          controls: detailId,
          onToggle: () => setOpen(expanded ? undefined : key),
        }}
        trailing={
          <>
            {isDefault ? (
              <Tag tone="neutral">{t('modelPreset.defaultModel')}</Tag>
            ) : (
              <Button
                type="button"
                variant="text"
                xstyle={aboveListToggle}
                disabled={busy}
                onClick={() => onChange(setSubDefault(sub, selection))}
              >
                {t('modelPreset.makeDefault')}
              </Button>
            )}
            <IconButton
              aria-label={t('modelPreset.removeAllowed', { model: name })}
              xstyle={aboveListToggle}
              disabled={busy}
              onClick={() => onChange(removeSubChoice(sub, selection))}
            >
              <Icon name="x" size={16} />
            </IconButton>
          </>
        }
        detailId={detailId}
        detail={
          expanded || stale ? (
            <div {...stylex.props(styles.detail)}>
              {stale ? (
                <Note tone="warning">
                  {t('modelPreset.groupEffortsStale')}{' '}
                  <Button
                    type="button"
                    variant="text"
                    disabled={busy}
                    onClick={() => changeEffort('')}
                  >
                    {t('modelPreset.groupEffortsClear')}
                  </Button>
                </Note>
              ) : null}
              {expanded && efforts.length > 0 ? (
                <div {...stylex.props(styles.field)}>
                  <span>{t('modelPreset.effort')}</span>
                  <SegmentedControl
                    id={`${detailId}-effort`}
                    value={efforts.some((entry) => entry.id === effort) ? effort : ''}
                    options={[
                      { value: '', label: t('modelPreset.providerDefault') },
                      ...efforts.map((entry) => ({ value: entry.id, label: entry.name })),
                    ]}
                    onChange={changeEffort}
                    label={`${name} · ${t('modelPreset.effort')}`}
                    disabled={busy}
                  />
                </div>
              ) : null}
              {expanded ? (
                <Input
                  aria-label={t('modelPreset.noteLabel', { model: name })}
                  placeholder={t('modelPreset.notePlaceholder')}
                  value={choice.note ?? ''}
                  maxLength={500}
                  disabled={busy}
                  onChange={(event) => onChange(setSubNote(sub, selection, event.target.value))}
                />
              ) : null}
            </div>
          ) : undefined
        }
      />
    );
  };

  return (
    <section {...stylex.props(styles.section)} aria-label={t('modelPreset.assignment')}>
      <div {...stylex.props(styles.heading)}>
        <strong {...stylex.props(styles.title)}>{t('modelPreset.assignment')}</strong>
        <span>{t('modelPreset.subHint')}</span>
      </div>
      <ListCard label={t('modelPreset.allowedTitle')}>
        {sub.choices.length === 0 ? (
          <ListCardItem
            leading={<Icon name="link" size={16} />}
            title={t('modelPreset.subFollowsMain')}
            summary={t('modelPreset.subFollowsMainHint')}
          />
        ) : (
          sub.choices.map(tile)
        )}
      </ListCard>
      <ModelTrigger
        value=""
        items={addItems}
        onSelect={add}
        label={t('modelPreset.addAllowed')}
        placeholder={t('modelPreset.addAllowed')}
        disabled={busy}
        t={t}
      />
    </section>
  );
}
