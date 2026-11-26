import { useQuery } from '@tanstack/react-query';
import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, SectionList, View } from 'react-native';
import type { HostCall } from '@botharness/host-client/host-answer';
import { sessionModel } from '@botharness/host-client/session-model';
import { turnTargetLabel } from '@botharness/host-client/turn-target';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import { modelCatalogCache, sessionModelQueries, stateQuery } from '../../host/session-model-query';

import { space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { HeaderButton } from '../primitives/drawer-header';
import { LoadingIndicator } from '../primitives/loading-indicator';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { RefreshIcon } from '../shell/icons';
import { composerControl } from './composer-chrome';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';
import { NativeSessionModelSheet } from './session-model-native';
import { sessionDefaultModel, sessionModelKey, sessionModelLabel } from './session-model-label';
import {
  SHEET_GROUP,
  Sheet,
  SheetCallout,
  SheetFailed,
  SheetHeading,
  SheetSkeleton,
  SheetNote,
} from './sheet';

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

  async function choose(choice: SessionModelChoice | null) {
    if (!ready || writing.current) return;
    if (sessionId === undefined) {
      setDraft({ override: choice, default: null });
      setOpen(false);
      return;
    }
    writing.current = true;
    setSaving(sessionModelKey(choice));
    setRefused(false);
    try {
      const value = await sessionModel(host, slug, sessionId, choice);
      sessionModelQueries.setQueryData(stateOptions.queryKey, value);
      setOpen(false);
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

type Option = {
  choice: SessionModelChoice | null;
  name: string;
  brand?: ModelBrand | undefined;
  detail?: string | undefined;
  tag?: string;
  disabled?: boolean;
};

export function SessionModelPicker({ control }: { control: Control }) {
  const t = useStrings();
  const copy = t.sessionModel;
  const theme = useDesignTheme();
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
  const defaultModel = useMemo(
    () => sessionDefaultModel(state?.default ?? null, catalog),
    [catalog, state?.default],
  );
  const sections = useMemo(() => {
    if (!visible || catalog === undefined) return [];
    return [
      {
        title: '',
        data: [
          {
            choice: null,
            name: fresh && native ? copy.newDefault : native ? copy.nativeDefault : copy.default,
            ...defaultModel,
          },
        ],
      },
      {
        title: copy.groups,
        data: (native ? [] : (catalog.groups ?? [])).map((group): Option => ({
          choice: { kind: 'group', id: group.id },
          name: group.name,
          disabled: group.restingUntil !== undefined,
        })),
      },
      {
        title: copy.apiModels,
        data: catalog.models.map((model): Option => {
          const label = turnTargetLabel(
            { kind: 'dsh', provider: model.provider, model: model.model },
            catalog,
          );
          return {
            choice: { kind: 'model', provider: model.provider, model: model.model },
            name: label.short,
            brand: label.brand,
            detail: model.providerName,
            tag: copy.api,
            disabled: model.credential !== undefined || model.restingUntil !== undefined,
          };
        }),
      },
      {
        title: t.routingGroup.engines,
        data: (native ? [] : catalog.engines).flatMap((engine): Option[] =>
          engine.available
            ? engine.models.map((model) => {
                const account = engine.accountId === undefined ? {} : { account: engine.accountId };
                const label = turnTargetLabel(
                  { kind: 'engine', engine: engine.engine, model: model.id, ...account },
                  catalog,
                );
                return {
                  choice: {
                    kind: 'engine',
                    engine: engine.engine,
                    model: model.id,
                    ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
                    ...(model.defaultEffort ? { effort: model.defaultEffort } : {}),
                  },
                  name: label.short,
                  brand: label.brand,
                  detail: engine.accountName,
                  tag: copy.sub,
                };
              })
            : [],
        ),
      },
    ];
  }, [catalog, copy, defaultModel, fresh, native, t.routingGroup.engines, visible]);
  const current = sessionModelKey(state?.override ?? null);
  const summary = useSessionModelSummary(control);
  if (NativeSessionModelSheet !== undefined) {
    const choices = new Map(
      sections
        .flatMap((section) => section.data)
        .map((item) => [sessionModelKey(item.choice), item]),
    );
    return (
      <NativeSessionModelSheet
        visible={visible}
        title={copy.choice}
        closeLabel={t.close}
        note={
          ready && summary.pending && summary.name !== undefined
            ? `${summary.name} · ${copy.nextTurnNote}`
            : refused
              ? copy.saveFailed
              : undefined
        }
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
        sections={sections.map((section) => ({
          title: section.title,
          data: section.data.map((item) => ({
            key: sessionModelKey(item.choice),
            name: item.name,
            brand: item.brand,
            detail: item.detail,
            tag: item.tag,
            disabled: item.disabled,
            accessible: copy.accessible(
              [item.name, item.tag, item.detail].filter((part) => part !== undefined),
            ),
          })),
        }))}
        onClose={close}
        onRetry={retry}
        onChoose={(key) => {
          const item = choices.get(key);
          if (item !== undefined) void choose(item.choice);
        }}
      />
    );
  }
  return (
    <Sheet
      visible={visible}
      label={copy.choice}
      title={copy.choice}
      onClose={close}
      resizable
      trailing={
        refreshing && ready ? (
          <View style={{ width: theme.touch, height: theme.touch, justifyContent: 'center' }}>
            <LoadingIndicator accessibilityLabel={copy.refreshing} />
          </View>
        ) : (
          <HeaderButton label={copy.refresh} testID="session-model-refresh" onPress={refresh}>
            <RefreshIcon color={theme.color.fg} size={theme.type.title.line} />
          </HeaderButton>
        )
      }
    >
      {failed ? (
        <SheetFailed message={copy.loadFailed} on={SHEET_GROUP} onRetry={retry} />
      ) : !ready ? (
        <SheetSkeleton />
      ) : (
        <>
          {refused ? <SheetCallout tone="danger">{copy.saveFailed}</SheetCallout> : null}
          {summary.pending && summary.name !== undefined ? (
            <SheetNote>{`${summary.name} · ${copy.nextTurnNote}`}</SheetNote>
          ) : null}
          <SectionList<Option>
            nestedScrollEnabled
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingBottom: space.x5 }}
            sections={sections}
            keyExtractor={(item) => sessionModelKey(item.choice)}
            stickySectionHeadersEnabled={false}
            renderSectionHeader={({ section }) =>
              section.title && section.data.length > 0 ? (
                <SheetHeading>{section.title}</SheetHeading>
              ) : null
            }
            renderItem={({ item, index, section }) => {
              const key = sessionModelKey(item.choice);
              const selected = current === key;
              return (
                <SettingsGroupItem
                  first={index === 0}
                  last={index === section.data.length - 1}
                  on={SHEET_GROUP}
                >
                  <SettingsRow
                    on={SHEET_GROUP}
                    testID={`session-model-option-${item.choice === null ? 'default' : `${item.choice.kind}-${index}`}`}
                    title={item.name}
                    detail={saving === key ? copy.saving : item.detail}
                    selected={selected}
                    accessibilityLabel={copy.accessible(
                      [item.name, item.tag, item.detail].filter((part) => part !== undefined),
                    )}
                    control={
                      saving === key ? { kind: 'busy' } : selected ? { kind: 'check' } : undefined
                    }
                    leading={
                      <ModelBrandIcon
                        brand={item.brand}
                        size={theme.type.title.line * theme.fontScale}
                        color={theme.color.muted}
                      />
                    }
                    trailing={
                      item.tag === undefined ? undefined : (
                        <Text variant="meta" tone="muted">
                          {item.tag}
                        </Text>
                      )
                    }
                    {...(item.disabled || saving !== undefined
                      ? { tone: 'muted' }
                      : {
                          onPress: () => void choose(item.choice),
                        })}
                  />
                </SettingsGroupItem>
              );
            }}
          />
        </>
      )}
    </Sheet>
  );
}
