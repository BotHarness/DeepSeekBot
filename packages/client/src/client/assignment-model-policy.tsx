import { modelCatalogGroupEfforts } from '@botharness/host-client/model-catalog';
import type { ReactElement } from 'react';
import type {
  AssignmentGroupOptionView,
  AssignmentModelOptionView,
  ModelCatalogEntryView,
  ModelCatalogGroupView,
} from './bridge.js';
import { Button } from './ds/button.js';
import { Checkbox } from './ds/checkbox.js';
import { Input } from './ds/input.js';
import { SegmentedControl } from './ds/segmented.js';
import { Tag } from './ds/tag.js';
import type { BotHarnessTranslate } from './locale.js';
import { groupFrontHint, groupMenuKey } from './model-menu.js';
import { modelKey, type ModelChoice, type ModelDraft } from './model-preset-draft.js';

export function AssignmentModelPolicy({
  draft,
  catalog,
  catalogGroups,
  busy,
  t,
  updateDraft,
  onMakeDefault,
}: {
  draft: ModelDraft;
  catalog: readonly ModelCatalogEntryView[];
  catalogGroups: readonly ModelCatalogGroupView[];
  busy: boolean;
  t: BotHarnessTranslate;
  updateDraft(change: (current: ModelDraft) => Partial<ModelDraft>): void;
  onMakeDefault(choice: ModelChoice): void;
}): ReactElement {
  const effortsOf = (entry: ModelCatalogEntryView | undefined) => [
    { id: '', name: t('modelPreset.providerDefault') },
    ...(entry?.efforts ?? []),
  ];
  const editAllowed = (
    key: string,
    change: (option: AssignmentModelOptionView) => AssignmentModelOptionView,
  ): void =>
    updateDraft((current) => ({
      allowed: current.allowed.map((item) => (modelKey(item) === key ? change(item) : item)),
    }));

  const modelCard = (option: AssignmentModelOptionView, isDefault: boolean) => {
    const key = modelKey(option);
    const entry = catalog.find((item) => modelKey(item) === key);
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
                onClick={() => onMakeDefault({ key, effort: option.defaultEffort })}
              >
                {t('modelPreset.makeDefault')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={t('modelPreset.removeAllowed', { model: name })}
                onClick={() =>
                  updateDraft((current) => ({
                    allowed: current.allowed.filter((item) => modelKey(item) !== key),
                  }))
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
    updateDraft((current) => ({
      groups: current.groups.map((item) => (item.group === group ? change(item) : item)),
    }));

  const groupCard = (option: AssignmentGroupOptionView, isDefault: boolean) => {
    const group = catalogGroups.find((item) => item.id === option.group);
    const name = group?.name ?? option.group;
    const routes = group?.routes ?? [];
    const frontHint = groupFrontHint(group, catalog, t);
    const shared = modelCatalogGroupEfforts({ routes }, catalog);
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
                onClick={() => onMakeDefault({ key: groupMenuKey(option.group), effort: '' })}
              >
                {t('modelPreset.makeDefault')}
              </Button>
              <Button
                variant="ghost"
                disabled={busy}
                aria-label={t('modelPreset.removeAllowed', { model: name })}
                onClick={() =>
                  updateDraft((current) => ({
                    groups: current.groups.filter((item) => item.group !== option.group),
                  }))
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

  return (
    <ul className="bh-card-list bh-model-cards" aria-label={t('modelPreset.allowedTitle')}>
      {draft.groups.map((option) =>
        groupCard(option, groupMenuKey(option.group) === draft.assignment.key),
      )}
      {draft.allowed.map((option) => modelCard(option, modelKey(option) === draft.assignment.key))}
    </ul>
  );
}
