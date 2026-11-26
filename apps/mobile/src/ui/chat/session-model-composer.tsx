import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable } from 'react-native';
import type { HostCall } from '@botharness/host-client/host-answer';
import { sessionModel } from '@botharness/host-client/session-model';
import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import { modelCatalogCache, sessionModelQueries, stateQuery } from '../../host/session-model-query';

import { space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { composerControl } from './composer-chrome';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';
import { ModelPickerSheet } from './model-picker-sheet';
import { engineEffortName } from '@botharness/host-protocol/subscription-engine';
import { sessionModelKey, sessionModelLabel } from './session-model-label';
import { filterAccessibleName } from './session-model-filter-strip';
import {
  catalogDefaultChoice,
  filterSessionModelSections,
  sessionModelFilters,
  sessionModelSections,
  sessionModelEffort,
  sessionModelSkeleton,
  type SessionModelRow,
} from './session-model-sections';

export interface ComposerSessionModel {
  slug: string | null;
  sessionId: string | undefined;
  host: HostCall;
  hostId: string;
  enabled: boolean;
  running: boolean;
  target?: TurnTarget | undefined;
}

export function useSessionModelControl({
  host,
  hostId,
  slug,
  sessionId,
  enabled,
  running,
  target,
}: ComposerSessionModel) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SessionModelState>({ override: null, default: null });
  const [saving, setSaving] = useState<string>();
  const [refused, setRefused] = useState(false);
  const writing = useRef(false);
  const catalogOptions = modelCatalogCache.query(host, hostId);
  const stateOptions = stateQuery(host, slug, sessionId);
  const catalogResult = useQuery({ ...catalogOptions, enabled }, sessionModelQueries);
  const saved = useQuery(
    {
      ...stateOptions,
      enabled: enabled && (sessionId !== undefined || slug !== null) && saving === undefined,
    },
    sessionModelQueries,
  );
  const state =
    sessionId === undefined ? { ...draft, default: saved.data?.default ?? null } : saved.data;
  const catalog = catalogResult.data;
  const visible = enabled && open;
  const failed =
    (sessionId !== undefined && saved.data === undefined && saved.isError) ||
    (catalog === undefined && catalogResult.isError);
  const ready = state !== undefined && catalog !== undefined;
  const refreshing = catalogResult.isFetching;
  const stateKey = JSON.stringify(stateOptions.queryKey);

  useLayoutEffect(() => {
    if (!enabled || (sessionId === undefined && slug === null)) return;
    void sessionModelQueries.invalidateQueries({ queryKey: JSON.parse(stateKey) });
  }, [enabled, running, sessionId, slug, stateKey]);

  useLayoutEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  function reloadState() {
    if (sessionId !== undefined || slug !== null)
      void sessionModelQueries.invalidateQueries({ queryKey: stateOptions.queryKey });
  }

  function retry() {
    setRefused(false);
    void modelCatalogCache.refresh(host, hostId).catch(() => {});
    reloadState();
  }

  function show() {
    Keyboard.dismiss();
    setOpen(true);
    setRefused(false);
    void modelCatalogCache.revalidate(host, hostId);
    reloadState();
  }

  function close() {
    if (!writing.current) setOpen(false);
  }

  async function choose(choice: SessionModelChoice | null, stay = false) {
    if (!ready || writing.current) return;
    if (sessionId === undefined) {
      setDraft({ override: choice, default: null });
      if (!stay) setOpen(false);
      return;
    }
    writing.current = true;
    setSaving(sessionModelKey(choice));
    setRefused(false);
    try {
      const value = await sessionModel(host, slug, sessionId, choice);
      sessionModelQueries.setQueryData(stateOptions.queryKey, value);
      if (!stay) setOpen(false);
    } catch {
      setRefused(true);
    } finally {
      writing.current = false;
      setSaving(undefined);
    }
  }

  return {
    state,
    native: slug === null,
    fresh: sessionId === undefined,
    target,
    catalog,
    failed,
    ready,
    refused,
    retry,
    refresh: retry,
    refreshing,
    show,
    close,
    choose,
    saving,
    visible,
  };
}

type Control = ReturnType<typeof useSessionModelControl>;

function useSessionModelSummary(control: Control) {
  const t = useStrings().sessionModel;
  return sessionModelLabel({
    state: control.state,
    target: control.target,
    catalog: control.catalog,
    strings: control.native
      ? { ...t, defaultLabel: control.fresh ? t.newDefaultLabel : t.nativeDefaultLabel }
      : t,
  });
}

export function useSessionModelMenuLabel(control: Control): string {
  const t = useStrings().sessionModel;
  const { name, effort } = useSessionModelSummary(control);
  return name === undefined ? t.choice : t.menuRow([name, effort].filter(Boolean).join(' · '));
}

export function SessionModelLogo({ control, disabled }: { control: Control; disabled: boolean }) {
  const theme = useDesignTheme();
  const { brand, accessible } = useSessionModelSummary(control);
  const size = composerControl(theme);
  return (
    <Pressable
      testID="composer-session-model"
      accessibilityRole="button"
      accessibilityLabel={accessible}
      accessibilityState={{ disabled, expanded: control.visible }}
      disabled={disabled}
      onPress={control.show}
      hitSlop={space.x3}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true, borderless: true }}
      style={({ pressed }) => ({
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: size / 2,
        backgroundColor: pressed ? theme.layer.raised.inset : undefined,
      })}
    >
      <ModelBrandIcon brand={brand} color={theme.color.muted} size={theme.type.title.line} />
    </Pressable>
  );
}

export function SessionModelPicker({ control }: { control: Control }) {
  const t = useStrings();
  const copy = t.sessionModel;
  const {
    catalog,
    state,
    native,
    fresh,
    visible,
    ready,
    failed,
    refused,
    saving,
    refreshing,
    close,
    retry,
    refresh,
    choose,
  } = control;
  const [filter, setFilter] = useState<string>();
  if (!visible && filter !== undefined) setFilter(undefined);
  const strings = useMemo(
    () => ({
      defaultName: fresh && native ? copy.newDefault : native ? copy.nativeDefault : copy.default,
      subscriptions: copy.subscriptions,
      apiModels: copy.apiModels,
      groups: copy.groups,
      api: copy.api,
      sub: copy.sub,
      other: copy.otherProvider,
    }),
    [copy, fresh, native],
  );
  const defaultChoice = native && fresh ? catalogDefaultChoice(catalog) : (state?.default ?? null);
  const all = useMemo(
    () =>
      !visible || catalog === undefined
        ? []
        : sessionModelSections({ catalog, defaultChoice, native, strings }),
    [catalog, defaultChoice, native, strings, visible],
  );
  const filters = useMemo(() => sessionModelFilters(all, copy.otherProvider), [all, copy]);
  const active = filters.some((entry) => entry.key === filter) ? filter : undefined;
  const sections = useMemo(() => filterSessionModelSections(all, active), [all, active]);
  const skeleton = sessionModelSkeleton(native, strings);
  const current = sessionModelKey(state?.override ?? null);
  const effort = useMemo(
    () =>
      sessionModelEffort(
        catalog,
        state?.override ?? null,
        (id, name) => engineEffortName(id, copy.effort, name),
        copy.effortDefault,
      ),
    [catalog, copy, state?.override],
  );
  const chooseEffort = (id: string) => {
    const override = state?.override;
    if (override == null || override.kind === 'group') return;
    const { effort: _effort, ...bare } = override;
    void choose(id === '' ? bare : { ...bare, effort: id }, true);
  };
  const summary = useSessionModelSummary(control);
  const accessible = (row: SessionModelRow) =>
    copy.accessible([row.name, row.tag, row.detail].filter((part) => part !== undefined));
  const note =
    ready && summary.pending && summary.name !== undefined
      ? `${summary.name} · ${copy.nextTurnNote}`
      : undefined;
  const choices = new Map(all.flatMap((section) => section.rows).map((row) => [row.key, row]));
  return (
    <ModelPickerSheet
      visible={visible}
      title={copy.choice}
      closeLabel={t.close}
      note={note}
      alert={refused ? copy.saveFailed : undefined}
      failure={failed ? copy.loadFailed : undefined}
      retryLabel={t.retry}
      loading={!failed && !ready}
      refreshLabel={copy.refresh}
      refreshingLabel={copy.refreshing}
      refreshing={refreshing && ready}
      onRefresh={refresh}
      current={current}
      saving={saving}
      savingLabel={copy.saving}
      skeleton={skeleton}
      filters={filters.map((entry) => ({
        ...entry,
        accessible: filterAccessibleName(entry, copy.subscription),
      }))}
      filter={active}
      filterLabel={copy.filters}
      effort={effort}
      effortLabel={copy.effortLevel}
      onEffort={chooseEffort}
      subLabel={copy.subscription}
      onFilter={setFilter}
      sections={sections.map((section) => ({
        id: section.id,
        title: section.title,
        data: section.rows.map((row, index) => ({
          testID: `session-model-option-${row.choice === null ? 'default' : `${row.choice.kind}-${index}`}`,
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
      onRetry={retry}
      onChoose={(key) => {
        const row = choices.get(key);
        if (row !== undefined) void choose(row.choice);
      }}
    />
  );
}
