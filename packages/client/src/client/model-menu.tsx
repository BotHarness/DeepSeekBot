import { useState, type ReactElement, type RefObject } from 'react';

import {
  modelBrand,
  modelFamilies,
  modelShortName,
  providerBrand,
  type ModelBrand,
} from '@botharness/host-client/shared/model-brand';
import {
  modelCatalogGroupFront,
  modelCatalogGroupMemberLabels,
  type RoutingGroupEngineCopy,
} from '@botharness/host-client/model-catalog';
import type {
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { ComboboxOption } from './combobox.js';
import { FilterPicker, type FilterPickerFilter } from './ds/filter-picker.js';
import { Tag } from './ds/tag.js';
import type { BotHarnessTranslate } from './locale.js';
import type { EngineId, EngineModelView, EngineStatusView } from './engine-choice.js';
import { engineName } from './session-engine.js';
import { EngineBrandIcon, ModelBrandIcon } from './model-brand.js';
import { setModelFavorite, useModelFavorites } from './model-favorites.js';

export interface ModelMenuItem extends ComboboxOption {
  readonly brand: ModelBrand | undefined;
  readonly name: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly engine?: EngineId;
  readonly group?: string | undefined;
  readonly preset?: string | undefined;
  readonly hidden?: boolean;
  readonly checked?: boolean | undefined;
  readonly tag?: string;
  readonly hintBrand?: ModelBrand | undefined;
  readonly hintLabel?: string | undefined;
}

export interface ModelMenuEffort {
  readonly value: string;
  readonly label: string;
}

const ALL = 'all';
const FAVORITES = 'favorites';
const OTHER = 'other';
const GROUPS = 'groups';
const PRESETS = 'presets';
const GROUP_PREFIX = 'group:';
const PRESET_PREFIX = 'preset:';

export function groupMenuKey(id: string): string {
  return `${GROUP_PREFIX}${id}`;
}

export function groupMenuId(key: string): string | undefined {
  return key.startsWith(GROUP_PREFIX) ? key.slice(GROUP_PREFIX.length) : undefined;
}

export function presetMenuKey(id: string): string {
  return `${PRESET_PREFIX}${id}`;
}

export function presetMenuId(key: string): string | undefined {
  return key.startsWith(PRESET_PREFIX) ? key.slice(PRESET_PREFIX.length) : undefined;
}

function groupFrontName(name: string, brand: Parameters<typeof modelShortName>[1]): string {
  const short = modelShortName(name, brand);
  return /\p{L}/u.test(short) ? short : name;
}

export function routingGroupEngineCopy(t: BotHarnessTranslate): RoutingGroupEngineCopy {
  return {
    defaultModel: (engine) => t('routingGroups.engineDefault', { engine }),
    subscription: (source) => t('engine.subscription', { engine: source }),
  };
}

export function restingHint(until: string, t: BotHarnessTranslate): string {
  return t('routingGroups.resting', {
    until: new Date(until).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
  });
}

export function groupFrontHint(
  group: ModelCatalogGroupView | undefined,
  catalog: readonly ModelCatalogEntryView[],
  t: BotHarnessTranslate,
): string | undefined {
  if (group === undefined || group.routes.length === 0) return undefined;
  const entryOf = (route: { provider: string; model: string }) =>
    catalog.find((item) => item.provider === route.provider && item.model === route.model);
  const usable = group.routes.some((route) => {
    const entry = entryOf(route);
    return entry?.credential === undefined && entry?.restingUntil === undefined;
  });
  if (!usable) return t('modelPreset.routeUnavailable');
  const front = modelCatalogGroupFront(group, [...catalog]);
  const entry = entryOf(front);
  return t('modelMenu.groupFront', {
    model: entry === undefined ? front.model : `${entry.modelName} · ${entry.providerName}`,
  });
}

export function modelMenuItems(
  options: readonly ComboboxOption[],
  catalog: readonly ModelCatalogEntryView[],
): ModelMenuItem[] {
  return options.map((option) => {
    const entry = catalog.find(
      (item) => JSON.stringify([item.provider, item.model]) === option.value,
    );
    if (entry === undefined) return { ...option, brand: undefined, name: option.label };
    const brand = modelBrand({
      provider: entry.provider,
      model: entry.model,
      name: entry.modelName,
    });
    return {
      ...option,
      label: modelShortName(entry.modelName, brand),
      name: entry.modelName,
      brand,
      provider: entry.provider,
      model: entry.model,
      hintBrand:
        option.hint === undefined ? undefined : providerBrand(entry.provider, entry.providerName),
    };
  });
}

export function catalogMenuItems(
  catalog: readonly ModelCatalogEntryView[],
  t: BotHarnessTranslate,
  groups: readonly ModelCatalogGroupView[] = [],
): ModelMenuItem[] {
  const unusable = (entry: ModelCatalogEntryView) =>
    entry.credential !== undefined || entry.restingUntil !== undefined;
  const models = modelMenuItems(
    [...catalog]
      .sort((a, b) => Number(unusable(a)) - Number(unusable(b)))
      .map((entry) => ({
        value: JSON.stringify([entry.provider, entry.model]),
        label: entry.modelName,
        hint:
          entry.credential !== undefined
            ? t(
                entry.credential === 'missing'
                  ? 'modelPreset.credentialMissing'
                  : 'modelPreset.credentialInvalid',
                { provider: entry.providerName },
              )
            : entry.restingUntil !== undefined
              ? `${entry.providerName} · ${restingHint(entry.restingUntil, t)}`
              : entry.providerName,
        disabled: unusable(entry),
      })),
    catalog,
  );
  return [
    ...groups.map((group): ModelMenuItem => {
      const front = modelCatalogGroupFront(group, [...catalog]);
      const entry = catalog.find(
        (item) => item.provider === front?.provider && item.model === front.model,
      );
      const disabled =
        group.restingUntil !== undefined ||
        group.routes.every((route) =>
          catalog.some(
            (item) =>
              item.provider === route.provider &&
              item.model === route.model &&
              item.credential !== undefined,
          ),
        );
      const brand =
        entry === undefined
          ? undefined
          : modelBrand({ provider: entry.provider, model: entry.model, name: entry.modelName });
      const members = modelCatalogGroupMemberLabels(
        group,
        catalog,
        groups,
        routingGroupEngineCopy(t),
      );
      const restful = group.restingUntil;
      const currentName =
        entry === undefined ? (front?.model ?? '') : `${entry.modelName} · ${entry.providerName}`;
      const hint =
        restful !== undefined
          ? restingHint(restful, t)
          : t('modelMenu.groupFront', {
              model:
                entry === undefined
                  ? (front?.model ?? '')
                  : `${groupFrontName(entry.modelName, brand)} · ${entry.providerName}`,
            });
      return {
        value: groupMenuKey(group.id),
        label: group.name,
        name: group.name,
        brand: undefined,
        group: group.id,
        hintBrand: restful === undefined ? brand : undefined,
        hintLabel: [
          restful === undefined ? t('modelMenu.groupFront', { model: currentName }) : hint,
          ...members,
        ].join(' · '),
        hint,
        disabled,
      };
    }),
    ...models,
  ];
}

const ENGINE_BRAND = { codex: 'openai', claude: 'claude' } as const;

export const engineMenuKey = (engine: EngineId, model: string): string =>
  `engine:${engine}:${model}`;

export const engineSignInKey = (engine: EngineId): string => `engine-signin:${engine}`;

export function engineMenuItems(
  engines: readonly EngineStatusView[],
  models: Partial<Record<EngineId, readonly EngineModelView[]>>,
  signingIn: EngineId | undefined,
  t: BotHarnessTranslate,
): ModelMenuItem[] {
  return engines.flatMap((status): ModelMenuItem[] => {
    const { engine } = status;
    const base = { engine, brand: ENGINE_BRAND[engine] };
    const name = engineName(engine);
    if (status.available) {
      const entries = models[engine];
      if (entries !== undefined && entries.length > 0)
        return entries.map((model) => ({
          ...base,
          value: engineMenuKey(engine, model.id),
          name: model.name,
          label: model.name,
          hint: t('engine.subscription', { engine: name }),
          model: model.id,
        }));
      const label = t(entries === undefined ? 'modelPreset.loading' : 'engine.noModels');
      return [{ ...base, value: `engine-status:${engine}`, name: label, label, disabled: true }];
    }
    if (!status.installed || status.reason === 'host-not-local')
      return [
        {
          ...base,
          value: `engine-status:${engine}`,
          name,
          label: name,
          hint: t(status.reason === 'host-not-local' ? 'engine.localOnly' : 'engine.notInstalled', {
            engine: name,
          }),
          disabled: true,
        },
      ];
    const label = t(signingIn === engine ? 'engine.signingIn' : 'engine.signInLabel', {
      engine: name,
    });
    return [
      {
        ...base,
        value: engineSignInKey(engine),
        name: label,
        label,
        ...(status.reason === 'not-subscription' ? { hint: t('engine.notSubscription') } : {}),
        ...(status.reason === 'login-unknown' ? { hint: t('engine.loginUnknown') } : {}),
        disabled: signingIn !== undefined,
      },
    ];
  });
}

export function selectedEngineMenuItem(
  choice: { engine: EngineId; model?: string },
  model: EngineModelView | undefined,
  t: BotHarnessTranslate,
): ModelMenuItem {
  const id = choice.model ?? model?.id ?? '';
  const name = model?.name ?? (id || engineName(choice.engine));
  return {
    value: engineMenuKey(choice.engine, id),
    name,
    label: name,
    hint: t('engine.subscription', { engine: engineName(choice.engine) }),
    model: id,
    engine: choice.engine,
    brand: ENGINE_BRAND[choice.engine],
    disabled: true,
    hidden: true,
  };
}

export function presetMenuItems(
  presets: readonly ModelPresetView[],
  catalog: readonly ModelCatalogEntryView[],
  groups: readonly ModelCatalogGroupView[],
  sourcePresetId: string | undefined,
  t: BotHarnessTranslate,
): ModelMenuItem[] {
  const part = (groupId: string | undefined, route: ModelRouteView | undefined): string => {
    const group = groups.find((entry) => entry.id === groupId);
    if (group !== undefined) return group.name;
    if (route === undefined) return t('modelMenu.presetInherited');
    const entry = catalog.find(
      (item) => item.provider === route.provider && item.model === route.model,
    );
    return entry?.modelName ?? route.model;
  };
  return presets.map((preset) => ({
    value: presetMenuKey(preset.id),
    label: preset.name,
    name: preset.name,
    brand: undefined,
    preset: preset.id,
    checked: preset.id === sourcePresetId,
    hint: t('modelMenu.presetRoutes', {
      main:
        preset.orchestratorEngine === undefined
          ? part(preset.orchestratorGroupId, preset.orchestrator)
          : (preset.orchestratorEngine.model ?? engineName(preset.orchestratorEngine.engine)),
      side:
        preset.assignmentEngine === undefined
          ? part(preset.assignmentDefaultGroupId, preset.assignmentDefault)
          : (preset.assignmentEngine.model ?? engineName(preset.assignmentEngine.engine)),
    }),
  }));
}

function familyKey(brand: ModelBrand | undefined): string {
  return brand ?? OTHER;
}

export function ModelMenu({
  label,
  items,
  value,
  onSelect,
  efforts,
  effort,
  onEffort,
  onSettings,
  busy = false,
  anchorRef,
  portalContainer,
  engineFilters,
  onBrowse,
  closeOnSelect = efforts === undefined || efforts.length <= 1,
  manageFavorites = true,
  onClose,
  t,
}: {
  label: string;
  items: readonly ModelMenuItem[];
  value: string;
  onSelect(value: string): void;
  efforts?: readonly ModelMenuEffort[] | undefined;
  effort?: string | undefined;
  onEffort?: ((value: string) => void) | undefined;
  onSettings?: (() => void) | undefined;
  busy?: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  portalContainer?: Element | null;
  engineFilters?: Partial<Record<EngineId, Pick<FilterPickerFilter, 'status' | 'onActivate'>>>;
  onBrowse?: (() => void) | undefined;
  closeOnSelect?: boolean;
  manageFavorites?: boolean;
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const models = items.filter((item) => item.model !== undefined && item.engine === undefined);
  const engines = new Set(
    items.flatMap((item) => (item.engine === undefined ? [] : [item.engine])),
  );
  for (const engine of ['codex', 'claude'] as const)
    if (engineFilters?.[engine] !== undefined) engines.add(engine);
  const groups = items.filter((item) => item.group !== undefined);
  const presets = items.filter((item) => item.preset !== undefined);
  const favorites = useModelFavorites();
  const [favoriteError, setFavoriteError] = useState<string>();
  return (
    <FilterPicker
      label={label}
      value={value}
      onSelect={onSelect}
      closeOnSelect={closeOnSelect}
      onBrowse={onBrowse}
      options={items
        .filter((item) => !item.hidden)
        .map((item) => ({
          value: item.value,
          label: item.name,
          hint: item.hint,
          ...(item.hintLabel === undefined ? {} : { hintLabel: item.hintLabel }),
          ...(item.hintBrand === undefined
            ? {}
            : { hintIcon: <ModelBrandIcon brand={item.hintBrand} size={12} /> }),
          disabled: item.disabled,
          search: [item.value, item.tag ?? ''],
          searchByTerms: item.engine !== undefined,
          marker: item.tag === undefined ? undefined : <Tag tone="quiet">{item.tag}</Tag>,
          ...(item.engine === undefined
            ? {
                favorite:
                  (item.model !== undefined ||
                    item.group !== undefined ||
                    item.preset !== undefined) &&
                  favorites.keys.has(item.value),
              }
            : {}),
          ...(item.preset !== undefined
            ? {
                icon: <ChannelSidebarIcon name="package" size={16} />,
                filter: PRESETS,
                exclusive: true,
                selected: item.checked === true,
              }
            : item.group !== undefined
              ? { icon: <ChannelSidebarIcon name="git-branch" size={16} />, filter: GROUPS }
              : item.engine !== undefined
                ? {
                    icon: <EngineBrandIcon brand={ENGINE_BRAND[item.engine]} size={16} />,
                    filter: `engine:${item.engine}`,
                  }
                : item.model === undefined
                  ? {}
                  : {
                      icon: <ModelBrandIcon brand={item.brand} size={16} />,
                      filter: familyKey(item.brand),
                    }),
        }))}
      filters={[
        ...(presets.length === 0
          ? []
          : [
              {
                key: PRESETS,
                label: t('modelMenu.presets'),
                icon: <ChannelSidebarIcon name="package" size={16} />,
              },
            ]),
        ...(groups.length === 0
          ? []
          : [
              {
                key: GROUPS,
                label: t('routingGroups.title'),
                icon: <ChannelSidebarIcon name="git-branch" size={16} />,
              },
            ]),
        ...[...engines].map((engine) => ({
          key: `engine:${engine}`,
          label: t('engine.subscription', { engine: engineName(engine) }),
          icon: <EngineBrandIcon brand={ENGINE_BRAND[engine]} size={16} />,
          ...engineFilters?.[engine],
        })),
        ...modelFamilies(models).map((family) => ({
          key: familyKey(family.brand),
          label: family.title ?? t('modelMenu.other'),
          icon: <ModelBrandIcon brand={family.brand} size={16} />,
        })),
      ]}
      filtersLabel={t('modelMenu.families')}
      allFilter={{
        key: ALL,
        label: t('modelMenu.all'),
        icon: <ChannelSidebarIcon name="layers-2" size={16} />,
      }}
      searchLabel={t('modelMenu.search')}
      emptyLabel={t('modelPreset.noMatch')}
      side={
        efforts === undefined || onEffort === undefined
          ? undefined
          : {
              label: t('modelPreset.effort'),
              value: effort ?? '',
              options: efforts,
              onSelect: onEffort,
            }
      }
      footer={
        onSettings === undefined
          ? undefined
          : {
              label: t('modelMenu.settings'),
              icon: <ChannelSidebarIcon name="sliders-horizontal" size={14} />,
              onSelect: onSettings,
            }
      }
      busy={busy}
      favorites={
        manageFavorites && favorites.writable
          ? {
              filter: {
                key: FAVORITES,
                label: t('modelMenu.favorites'),
                icon: <ChannelSidebarIcon name="star" size={16} filled />,
              },
              addLabel: t('modelMenu.favoriteAdd'),
              removeLabel: t('modelMenu.favoriteRemove'),
              onToggle: (key, favorite) => {
                const group = groups.find((entry) => entry.value === key)?.group;
                const preset = presets.find((entry) => entry.value === key)?.preset;
                const item = models.find((entry) => entry.value === key);
                const choice =
                  preset !== undefined
                    ? ({ kind: 'preset', id: preset } as const)
                    : group !== undefined
                      ? ({ kind: 'group', id: group } as const)
                      : item?.provider !== undefined && item.model !== undefined
                        ? ({ kind: 'model', provider: item.provider, model: item.model } as const)
                        : undefined;
                if (choice === undefined) return;
                setFavoriteError(undefined);
                void setModelFavorite(choice, favorite).catch((error: unknown) =>
                  setFavoriteError(
                    t('modelMenu.favoriteFailed', {
                      error: error instanceof Error ? error.message : String(error),
                    }),
                  ),
                );
              },
            }
          : undefined
      }
      notice={favoriteError}
      anchorRef={anchorRef}
      portalContainer={portalContainer ?? null}
      onClose={onClose}
    />
  );
}
