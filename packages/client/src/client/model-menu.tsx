import { useState, type ReactElement, type RefObject } from 'react';

import {
  modelBrand,
  modelFamilies,
  modelShortName,
  type ModelBrand,
} from '@botharness/host-client/shared/model-brand';
import {
  modelCatalogGroupFront,
  routingGroupEngineLabel,
} from '@botharness/host-client/model-catalog';
import type {
  ModelCatalogEntryView,
  ModelCatalogGroupView,
  ModelPresetView,
  ModelRouteView,
} from './bridge.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import type { ComboboxOption } from './combobox.js';
import { FilterPicker } from './ds/filter-picker.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon } from './model-brand.js';
import { setModelFavorite, useModelFavorites } from './model-favorites.js';

export interface ModelMenuItem extends ComboboxOption {
  readonly brand: ModelBrand | undefined;
  readonly name: string;
  readonly provider?: string | undefined;
  readonly model?: string | undefined;
  readonly group?: string | undefined;
  readonly preset?: string | undefined;
  readonly checked?: boolean | undefined;
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
      const engineLabels = group.engineMembers?.map(routingGroupEngineLabel) ?? [];
      const hint =
        group.restingUntil !== undefined
          ? restingHint(group.restingUntil, t)
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
        ...(group.restingUntil === undefined && entry !== undefined
          ? {
              hintBrand: brand,
              hintLabel: [
                t('modelMenu.groupFront', { model: `${entry.modelName} · ${entry.providerName}` }),
                ...engineLabels,
              ].join(' · '),
            }
          : {}),
        hint: [hint, ...engineLabels].join(' · '),
        disabled,
      };
    }),
    ...models,
  ];
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
      main: part(preset.orchestratorGroupId, preset.orchestrator),
      side: part(preset.assignmentDefaultGroupId, preset.assignmentDefault),
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
  onClose(): void;
  t: BotHarnessTranslate;
}): ReactElement {
  const models = items.filter((item) => item.model !== undefined);
  const groups = items.filter((item) => item.group !== undefined);
  const presets = items.filter((item) => item.preset !== undefined);
  const favorites = useModelFavorites();
  const [favoriteError, setFavoriteError] = useState<string>();
  return (
    <FilterPicker
      label={label}
      value={value}
      onSelect={onSelect}
      closeOnSelect={efforts === undefined || efforts.length <= 1}
      options={items.map((item) => ({
        value: item.value,
        label: item.name,
        hint: item.hint,
        ...(item.hintLabel === undefined ? {} : { hintLabel: item.hintLabel }),
        ...(item.hintBrand === undefined
          ? {}
          : { hintIcon: <ModelBrandIcon brand={item.hintBrand} size={12} /> }),
        disabled: item.disabled,
        search: [item.value],
        favorite:
          (item.model !== undefined || item.group !== undefined || item.preset !== undefined) &&
          favorites.keys.has(item.value),
        ...(item.preset !== undefined
          ? {
              icon: <ChannelSidebarIcon name="package" size={16} />,
              filter: PRESETS,
              exclusive: true,
              selected: item.checked === true,
            }
          : item.group !== undefined
            ? { icon: <ChannelSidebarIcon name="git-branch" size={16} />, filter: GROUPS }
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
        favorites.writable
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
      onClose={onClose}
    />
  );
}
