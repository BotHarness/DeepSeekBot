import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, SectionList } from 'react-native';
import type { HostCall } from '@botharness/host-client/host-answer';
import { loadSessionModelCatalog } from '@botharness/host-client/model-catalog';
import { sessionModel } from '@botharness/host-client/session-model';
import { turnTargetLabel } from '@botharness/host-client/turn-target';
import type { ModelBrand } from '@botharness/host-client/shared/model-brand';
import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';

import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import { radius, space } from '../design/tokens';
import { pressTint, useDesignTheme } from '../design/theme';
import { SettingsGroupItem, SettingsRow } from '../primitives/settings-row';
import { Text } from '../primitives/text';
import { useStrings } from '../strings';
import { ModelBrandIcon } from './model-brand-icon';
import { sessionModelKey, sessionModelLabel } from './session-model-label';
import { SHEET_GROUP, Sheet, SheetCallout, SheetFailed, SheetHeading, SheetLoading } from './sheet';

type Catalog = Awaited<ReturnType<typeof loadSessionModelCatalog>>;
type Result<T> =
  | { host: HostCall; attempt: number; value: T }
  | { host: HostCall; attempt: number; failed: true };

export interface ComposerSessionModel {
  slug: string | null;
  sessionId: string;
  host: HostCall;
  enabled: boolean;
  running: boolean;
  target?: TurnTarget | undefined;
}

export function useSessionModelControl({
  host,
  slug,
  sessionId,
  enabled,
  running,
  target,
}: ComposerSessionModel) {
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState<Result<SessionModelState>>();
  const [catalogResult, setCatalog] = useState<Result<Catalog>>();
  const [saving, setSaving] = useState<string>();
  const [refused, setRefused] = useState(false);
  const writing = useRef(false);
  const state = saved?.host === host && 'value' in saved ? saved.value : undefined;
  const catalog =
    catalogResult?.host === host && 'value' in catalogResult ? catalogResult.value : undefined;
  const visible = enabled && open;
  const failed =
    (saved?.host === host && saved.attempt === attempt && 'failed' in saved) ||
    (catalogResult?.host === host &&
      catalogResult.attempt === attempt &&
      'failed' in catalogResult);
  const ready =
    state !== undefined &&
    catalog !== undefined &&
    saved?.attempt === attempt &&
    catalogResult?.attempt === attempt;

  useLayoutEffect(() => {
    if (!enabled || saving !== undefined) return;
    let active = true;
    void sessionModel(host, slug, sessionId).then(
      (value) => {
        if (active) setSaved({ host, attempt, value });
      },
      () => {
        if (active) setSaved({ host, attempt, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [host, slug, sessionId, enabled, running, attempt, saving]);

  useLayoutEffect(() => {
    if (!enabled) return;
    let active = true;
    void loadSessionModelCatalog(host).then(
      (value) => {
        if (active) setCatalog({ host, attempt, value });
      },
      () => {
        if (active) setCatalog({ host, attempt, failed: true });
      },
    );
    return () => {
      active = false;
    };
  }, [host, enabled, attempt]);

  useLayoutEffect(() => {
    if (!enabled) setOpen(false);
  }, [enabled]);

  function retry() {
    setRefused(false);
    setAttempt((value) => value + 1);
  }

  function show() {
    Keyboard.dismiss();
    setOpen(true);
    retry();
  }

  function close() {
    if (!writing.current) setOpen(false);
  }

  async function choose(choice: SessionModelChoice | null) {
    if (!ready || writing.current) return;
    writing.current = true;
    setSaving(sessionModelKey(choice));
    setRefused(false);
    try {
      const value = await sessionModel(host, slug, sessionId, choice);
      setSaved({ host, attempt, value });
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
    target,
    catalog,
    failed,
    ready,
    refused,
    retry,
    show,
    close,
    choose,
    saving,
    visible,
  };
}

type Control = ReturnType<typeof useSessionModelControl>;

export function SessionModelChip({
  control,
  width,
  disabled,
}: {
  control: Control;
  width: number;
  disabled: boolean;
}) {
  const t = useStrings().sessionModel;
  const theme = useDesignTheme();
  const { brand, name, effort, accessible } = sessionModelLabel({
    state: control.state,
    target: control.target,
    catalog: control.catalog,
    width: width / Math.max(1, theme.fontScale),
    strings: control.native ? { ...t, defaultLabel: t.nativeDefaultLabel } : t,
  });
  const unavailable = disabled;
  return (
    <Pressable
      testID="composer-session-model"
      accessibilityRole="button"
      accessibilityLabel={accessible}
      accessibilityState={{ disabled: unavailable, expanded: control.visible }}
      disabled={unavailable}
      onPress={control.show}
      android_ripple={{ color: pressTint(theme.color.fg), foreground: true }}
      style={({ pressed }) => ({
        flexShrink: 1,
        minHeight: theme.touch,
        minWidth: theme.touch,
        paddingHorizontal: space.x3,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: space.x2,
        borderRadius: radius.round,
        overflow: 'hidden',
        backgroundColor: pressed ? theme.layer.raised.inset : undefined,
      })}
    >
      <ModelBrandIcon
        brand={brand}
        color={theme.color.muted}
        size={theme.type.title.line + (name === undefined ? 0 : space.x1)}
      />
      {name === undefined ? null : (
        <Text variant="meta" numberOfLines={1} style={{ flexShrink: 1 }}>
          {name}
        </Text>
      )}
      {effort === undefined ? null : (
        <Text variant="meta" tone="muted" numberOfLines={1}>
          {effort}
        </Text>
      )}
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
  const { catalog, state, native, visible, ready, failed, refused, saving, close, retry, choose } =
    control;
  const sections = useMemo(() => {
    if (!visible || catalog === undefined) return [];
    return [
      { title: '', data: [{ choice: null, name: native ? copy.nativeDefault : copy.default }] },
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
  }, [catalog, copy, native, t.routingGroup.engines, visible]);
  const current = sessionModelKey(state?.override ?? null);
  return (
    <Sheet visible={visible} label={copy.choice} title={copy.choice} onClose={close}>
      {failed ? (
        <SheetFailed message={copy.loadFailed} on={SHEET_GROUP} onRetry={retry} />
      ) : !ready ? (
        <SheetLoading />
      ) : (
        <>
          {refused ? <SheetCallout tone="danger">{copy.saveFailed}</SheetCallout> : null}
          <SectionList<Option>
            nestedScrollEnabled
            style={{ flexShrink: 1 }}
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
                        size={theme.type.title.line}
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
