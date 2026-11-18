import { useState, type ReactElement, type RefObject } from 'react';

import {
  modelBrand,
  modelFamilies,
  modelShortName,
  type ModelBrand,
} from '@botharness/host-client/shared/model-brand';
import type { ModelCatalogEntryView } from './bridge.js';
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
}

export interface ModelMenuEffort {
  readonly value: string;
  readonly label: string;
}

const ALL = 'all';
const FAVORITES = 'favorites';
const OTHER = 'other';

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
): ModelMenuItem[] {
  return modelMenuItems(
    [...catalog]
      .sort((a, b) => Number(a.credential !== undefined) - Number(b.credential !== undefined))
      .map((entry) => ({
        value: JSON.stringify([entry.provider, entry.model]),
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
      })),
    catalog,
  );
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
        disabled: item.disabled,
        search: [item.value],
        favorite: item.model !== undefined && favorites.keys.has(item.value),
        ...(item.model === undefined
          ? {}
          : {
              icon: <ModelBrandIcon brand={item.brand} size={16} />,
              filter: familyKey(item.brand),
            }),
      }))}
      filters={modelFamilies(models).map((family) => ({
        key: familyKey(family.brand),
        label: family.title ?? t('modelMenu.other'),
        icon: <ModelBrandIcon brand={family.brand} size={16} />,
      }))}
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
                const item = models.find((entry) => entry.value === key);
                if (item?.provider === undefined || item.model === undefined) return;
                setFavoriteError(undefined);
                void setModelFavorite(
                  { kind: 'model', provider: item.provider, model: item.model },
                  favorite,
                ).catch((error: unknown) =>
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
