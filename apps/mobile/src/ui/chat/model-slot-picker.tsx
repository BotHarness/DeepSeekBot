import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { errorText } from '@botharness/host-client/bot-settings';
import { Keyboard } from 'react-native';
import type { HostCall } from '@botharness/host-client/host-answer';
import type { SessionModelChoice } from '@botharness/host-protocol/session-model';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';

import { modelCatalogCache, sessionModelQueries } from '../../host/session-model-query';
import { useStrings } from '../strings';
import { ModelPickerSheet } from './model-picker-sheet';
import { slotEffortOptions, withEffort } from './model-slots';
import { filterAccessibleName } from './session-model-filter-strip';
import { sessionModelKey } from './session-model-label';
import {
  filterSessionModelSections,
  sessionModelFilters,
  sessionModelSections,
  sessionModelSkeleton,
  type SessionModelRow,
} from './session-model-sections';

export type SlotPickerRequest =
  | {
      kind: 'main';
      title: string;
      current: SessionModelChoice | null | undefined;
      presets?: SlotPresets | undefined;
      onPick(choice: SessionModelChoice | null): Promise<void>;
    }
  | {
      kind: 'add';
      title: string;
      taken: readonly string[];
      groups: boolean;
      onAdd(choices: SessionModelChoice[]): Promise<void>;
    };

export interface SlotPresets {
  title: string;
  current: string | undefined;
  rows: {
    id: string;
    name: string;
    brand?: ModelBrand | undefined;
    detail: string;
    tag?: string;
  }[];
  onPick(id: string): Promise<void>;
}

const PRESET_KEY = 'preset:';

export function useSlotPicker(host: HostCall | undefined, hostId: string | undefined) {
  const t = useStrings();
  const copy = t.sessionModel;
  const slots = t.modelSlots;
  const [request, setRequest] = useState<SlotPickerRequest>();
  const [visible, setVisible] = useState(false);
  const [filter, setFilter] = useState<string>();
  const [current, setCurrent] = useState<SessionModelChoice | null>();
  const [picked, setPicked] = useState<SessionModelChoice[]>([]);
  const [saving, setSaving] = useState<string>();
  const [refused, setRefused] = useState<string>();
  const enabled = visible && host !== undefined && hostId !== undefined;
  const catalogResult = useQuery(
    {
      ...modelCatalogCache.query(host ?? { call: async () => undefined }, hostId ?? ''),
      enabled,
    },
    sessionModelQueries,
  );
  const catalog = catalogResult.data;
  const ready = catalog !== undefined;
  const failed = catalog === undefined && catalogResult.isError;
  const strings = useMemo(
    () => ({
      defaultName: '',
      subscriptions: copy.subscriptions,
      apiModels: copy.apiModels,
      groups: copy.groups,
      api: copy.api,
      sub: copy.sub,
      other: copy.otherProvider,
    }),
    [copy, request],
  );
  const all = useMemo(() => {
    if (!visible || catalog === undefined || request === undefined) return [];
    const sections = sessionModelSections({
      catalog,
      defaultChoice: null,
      native: false,
      strings,
      mode: 'slot',
    })
      .filter((section) => section.id !== 'default')
      .filter((section) => request.kind === 'main' || request.groups || section.id !== 'groups')
      .map((section) =>
        request.kind === 'add'
          ? { ...section, rows: section.rows.filter((row) => !request.taken.includes(row.key)) }
          : section,
      );
    const presets = request.kind === 'main' ? request.presets : undefined;
    return presets === undefined
      ? sections
      : [
          {
            id: 'presets' as const,
            title: presets.title,
            rows: presets.rows.map((row): SessionModelRow => ({
              key: `${PRESET_KEY}${row.id}`,
              choice: null,
              name: row.name,
              source: 'preset',
              brand: row.brand,
              detail: row.detail,
              tag: row.tag,
            })),
          },
          ...sections,
        ];
  }, [catalog, request, strings, visible]);
  const filters = useMemo(
    () => sessionModelFilters(all, copy.otherProvider, copy.groups),
    [all, copy],
  );
  const active = filters.some((entry) => entry.key === filter) ? filter : undefined;
  const sections = useMemo(() => filterSessionModelSections(all, active), [all, active]);
  const rows = useMemo(
    () => new Map<string, SessionModelRow>(all.flatMap((s) => s.rows).map((r) => [r.key, r])),
    [all],
  );

  function open(next: SlotPickerRequest) {
    if (host === undefined || hostId === undefined) return;
    Keyboard.dismiss();
    setRequest(next);
    setFilter(undefined);
    setPicked([]);
    setRefused(undefined);
    setCurrent(next.kind === 'main' ? next.current : undefined);
    setVisible(true);
    void modelCatalogCache.revalidate(host, hostId);
  }

  function close() {
    if (saving === undefined) setVisible(false);
  }

  async function pickMain(choice: SessionModelChoice | null, stay: boolean) {
    if (request?.kind !== 'main' || saving !== undefined) return;
    setSaving(sessionModelKey(choice));
    setRefused(undefined);
    try {
      await request.onPick(choice);
      setCurrent(choice);
      if (!stay) setVisible(false);
    } catch (cause) {
      setRefused(errorText(cause));
    } finally {
      setSaving(undefined);
    }
  }

  async function add() {
    if (request?.kind !== 'add' || picked.length === 0 || saving !== undefined) return;
    setSaving('confirm');
    setRefused(undefined);
    try {
      await request.onAdd(picked);
      setVisible(false);
    } catch (cause) {
      setRefused(errorText(cause));
    } finally {
      setSaving(undefined);
    }
  }

  const focused = request?.kind === 'main' ? (current ?? undefined) : undefined;
  const effortOptions = slotEffortOptions(catalog, focused, t.modelSettings.providerDefault);
  const effort =
    focused === undefined || effortOptions.length === 0
      ? undefined
      : {
          title: slots.effort,
          options: effortOptions,
          current: focused.effort ?? '',
          onChoose: (id: string) => {
            void pickMain(withEffort(focused, id), true);
          },
        };

  async function pickPreset(id: string) {
    if (request?.kind !== 'main' || request.presets === undefined || saving !== undefined) return;
    setSaving(`${PRESET_KEY}${id}`);
    setRefused(undefined);
    try {
      await request.presets.onPick(id);
      setCurrent(null);
      setVisible(false);
    } catch (cause) {
      setRefused(errorText(cause));
    } finally {
      setSaving(undefined);
    }
  }

  function choose(key: string) {
    if (request === undefined) return;
    if (request.kind === 'main') {
      if (key.startsWith(PRESET_KEY)) {
        void pickPreset(key.slice(PRESET_KEY.length));
        return;
      }
      const row = rows.get(key);
      if (row?.choice == null) return;
      const options = slotEffortOptions(catalog, row.choice, t.modelSettings.providerDefault);
      const keep = current?.effort;
      const effortId =
        keep !== undefined && options.some((option) => option.id === keep) ? keep : '';
      void pickMain(withEffort(row.choice, effortId), options.length > 0);
      return;
    }
    const row = rows.get(key);
    if (row?.choice == null) return;
    const choice = row.choice;
    setPicked((list) =>
      list.some((entry) => sessionModelKey(entry) === key)
        ? list.filter((entry) => sessionModelKey(entry) !== key)
        : [...list, choice],
    );
  }

  const accessible = (row: SessionModelRow) =>
    copy.accessible([row.name, row.tag, row.detail].filter((part) => part !== undefined));
  const sheet =
    request === undefined ? null : (
      <ModelPickerSheet
        visible={visible}
        title={request.title}
        closeLabel={t.close}
        alert={refused === undefined ? undefined : `${t.settingFailed} ${refused}`}
        failure={failed ? copy.loadFailed : undefined}
        retryLabel={t.retry}
        loading={!failed && !ready}
        refreshLabel={copy.refresh}
        refreshingLabel={copy.refreshing}
        refreshing={catalogResult.isFetching && ready}
        onRefresh={() => {
          if (host !== undefined && hostId !== undefined)
            void modelCatalogCache.refresh(host, hostId).catch(() => {});
        }}
        current={
          request.kind !== 'main'
            ? ''
            : current == null
              ? request.presets?.current === undefined
                ? ''
                : `${PRESET_KEY}${request.presets.current}`
              : sessionModelKey(current)
        }
        {...(request.kind === 'add'
          ? {
              selected: picked.map((choice) => sessionModelKey(choice)),
              confirm: {
                label: slots.add(picked.length),
                disabled: picked.length === 0,
                onPress: () => void add(),
              },
            }
          : {})}
        effort={effort}
        saving={saving}
        savingLabel={copy.saving}
        skeleton={[
          ...(request.kind === 'main' && request.presets !== undefined
            ? [
                {
                  id: 'presets' as const,
                  title: request.presets.title,
                  rows: request.presets.rows.length,
                },
              ]
            : []),
          ...sessionModelSkeleton(false, strings, 'slot').filter(
            (section) => request.kind === 'main' || request.groups || section.id !== 'groups',
          ),
        ]}
        filters={filters.map((entry) => ({
          ...entry,
          accessible: filterAccessibleName(entry, copy.subscription),
        }))}
        filter={active}
        filterLabel={copy.filters}
        subLabel={copy.subscription}
        onFilter={setFilter}
        sections={sections.map((section) => ({
          id: section.id,
          title: section.title,
          data: section.rows.map((row, index) => ({
            testID: `slot-model-option-${section.id}-${index}`,
            key: row.key,
            name: row.name,
            brand: row.brand,
            detail: row.detail,
            tag: row.tag,
            disabled: row.disabled,
            accessible: accessible(row),
          })),
        }))}
        onClose={close}
        onRetry={() => {
          if (host !== undefined && hostId !== undefined)
            void modelCatalogCache.refresh(host, hostId).catch(() => {});
        }}
        onChoose={choose}
      />
    );
  return { open, sheet };
}
