import { useMemo, useRef, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import { engineCatalogModel } from '@botharness/host-client/model-catalog';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import type { BridgeActions } from './actions.js';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import { Button } from './ds/button.js';
import { Icon } from './ds/icon.js';
import { ink, space, state as hoverState, style } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { ModelBrandIcon } from './model-brand.js';
import {
  catalogMenuItems,
  engineMenuKey,
  groupMenuKey,
  ModelMenu,
  type ModelMenuItem,
} from './model-menu.js';
import { useMountedResource } from './mounted-resource.js';

const DEFAULT = 'session-default';
const NO_EFFORT = '@container session-composer (max-width: 300px)';
const ICON_ONLY = '@container session-composer (max-width: 220px)';

const styles = stylex.create({
  chip: {
    flexShrink: 1,
    minWidth: 0,
    maxWidth: '100%',
    height: style.controlHeightSmall,
    gap: space.x1,
    paddingInline: space.x2,
    fontWeight: 400,
  },
  open: { backgroundColor: hoverState.selected },
  wrap: { display: 'inline-flex', minWidth: 0 },
  name: {
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    display: { default: 'inline', [ICON_ONLY]: 'none' },
  },
  effort: {
    flexShrink: 0,
    color: ink.secondary,
    display: { default: 'inline', [NO_EFFORT]: 'none' },
  },
});

function labelKey(target: TurnTarget): string {
  return JSON.stringify([
    target.kind,
    target.kind === 'engine' ? target.engine : target.provider,
    target.model,
  ]);
}

function effortName(efforts: readonly { id: string; name: string }[] | undefined, id: string) {
  return efforts?.find((item) => item.id === id)?.name ?? id.charAt(0).toUpperCase() + id.slice(1);
}

function choiceKey(choice: SessionModelChoice | null): string {
  if (choice === null) return DEFAULT;
  if (choice.kind === 'model') return JSON.stringify([choice.provider, choice.model]);
  if (choice.kind === 'group') return groupMenuKey(choice.id);
  return engineMenuKey(choice.engine, choice.model, choice.accountId);
}

export function SessionModelComposer({
  action,
  botSlug,
  sessionId,
  catalog,
  groups,
  target,
  running,
  onSaving,
  onError,
  t,
}: {
  action: NonNullable<BridgeActions['sessionModel']>;
  botSlug: string;
  sessionId: string;
  catalog: TurnTargetCatalog & { models?: readonly ModelCatalogEntryView[] | undefined };
  groups: readonly ModelCatalogGroupView[];
  target: TurnTarget | undefined;
  running: boolean;
  onSaving(saving: boolean): void;
  onError(message: string): void;
  t: BotHarnessTranslate;
}) {
  const { engines, models } = catalog;
  const [state, setState] = useState<SessionModelState>();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const order = useRef(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const known = useRef(new Map<string, { short: string; brand: ModelMenuItem['brand'] }>());
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (saving) return;
    const request = ++order.current;
    let mounted = true;
    void action(botSlug, sessionId).then(
      (next) => {
        if (mounted && request === order.current) setState(next);
      },
      () => undefined,
    );
    return () => {
      mounted = false;
    };
  }, [action, botSlug, sessionId, running, saving]);
  const items = useMemo(() => {
    if (!open) return undefined;
    const choices = new Map<string, SessionModelChoice | null>([[DEFAULT, null]]);
    const menu: ModelMenuItem[] = [
      {
        value: DEFAULT,
        name: t('sessions.model.default'),
        label: t('sessions.model.default'),
        brand: undefined,
      },
    ];
    for (const { hint: _hint, hintBrand: _brand, hintLabel: _label, ...item } of catalogMenuItems(
      models ?? [],
      t,
      groups,
    )) {
      if (item.group !== undefined) {
        menu.push(item);
        choices.set(item.value, { kind: 'group', id: item.group });
      } else if (item.model !== undefined && item.provider !== undefined) {
        menu.push({ ...item, name: item.label, tag: t('sessions.model.api') });
        choices.set(item.value, { kind: 'model', provider: item.provider, model: item.model });
      }
    }
    for (const engine of engines ?? []) {
      if (!engine.available) continue;
      for (const model of engine.models) {
        const value = engineMenuKey(engine.engine, model.id, engine.accountId);
        const label = turnTargetLabel(
          {
            kind: 'engine',
            engine: engine.engine,
            model: model.id,
            ...(engine.accountId === undefined ? {} : { account: engine.accountId }),
          },
          catalog,
        );
        menu.push({
          value,
          name: label.short,
          label: label.short,
          brand: label.brand,
          engine: engine.engine,
          model: model.id,
          tag: t('sessions.model.sub'),
        });
        const effort = model.defaultEffort;
        choices.set(value, {
          kind: 'engine',
          engine: engine.engine,
          model: model.id,
          ...(engine.accountId === undefined ? {} : { accountId: engine.accountId }),
          ...(effort === undefined || effort === '' ? {} : { effort }),
        });
      }
    }
    return { menu, choices };
  }, [catalog, engines, groups, models, open, t]);
  const choice = state?.override ?? state?.default ?? null;
  const pending =
    running &&
    state?.active !== undefined &&
    JSON.stringify(state.override) !== JSON.stringify(state.active);
  const preferred = (() => {
    if (choice?.kind === 'group') return undefined;
    if (choice?.kind === 'model')
      return { kind: 'dsh', provider: choice.provider, model: choice.model } as const;
    if (choice?.kind === 'engine')
      return {
        kind: 'engine',
        engine: choice.engine,
        model: choice.model,
        ...(choice.accountId === undefined ? {} : { account: choice.accountId }),
      } as const;
    return undefined;
  })();
  const recorded = target?.model === undefined ? undefined : target;
  const visible = pending ? preferred : running ? (recorded ?? preferred) : (preferred ?? recorded);
  const resolved = visible === undefined ? undefined : turnTargetLabel(visible, catalog);
  const targetKey = visible === undefined ? undefined : labelKey(visible);
  if (targetKey !== undefined && resolved !== undefined && resolved.short !== visible?.model)
    known.current.set(targetKey, { short: resolved.short, brand: resolved.brand });
  const cached = targetKey === undefined ? undefined : known.current.get(targetKey);
  const label =
    resolved !== undefined && cached !== undefined && resolved.short === visible?.model
      ? { ...resolved, short: cached.short, brand: cached.brand ?? resolved.brand }
      : resolved;
  const group = choice?.kind === 'group' ? groups.find((item) => item.id === choice.id) : undefined;
  const name =
    label?.short ??
    group?.name ??
    (choice?.kind === 'group' ? choice.id : t('sessions.model.choice'));
  const shown = pending ? t('sessions.model.next', { model: name }) : name;
  function select(key: string) {
    if (items === undefined) return;
    const selected = items.choices.get(key);
    if (selected === undefined || saving) return;
    const item = items.menu.find((entry) => entry.value === key);
    if (item !== undefined && selected !== null && selected.kind !== 'group')
      known.current.set(
        labelKey(
          selected.kind === 'model'
            ? { kind: 'dsh', provider: selected.provider, model: selected.model }
            : { kind: 'engine', engine: selected.engine, model: selected.model },
        ),
        { short: item.label, brand: item.brand },
      );
    order.current += 1;
    setSaving(true);
    onSaving(true);
    void action(botSlug, sessionId, selected)
      .then(setState, (error: unknown) => {
        onError(
          t('sessions.model.failed', {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
      })
      .finally(() => {
        setSaving(false);
        onSaving(false);
      });
  }
  const effortId =
    choice?.effort ??
    (choice?.kind === 'engine'
      ? engineCatalogModel(engines ?? [], {
          engine: choice.engine,
          model: choice.model,
          ...(choice.accountId === undefined ? {} : { account: choice.accountId }),
        })?.defaultEffort
      : undefined) ??
    (choice?.kind === 'model'
      ? models?.find((item) => item.provider === choice.provider && item.model === choice.model)
          ?.defaultEffort
      : undefined) ??
    (pending ? undefined : recorded?.kind === 'engine' ? recorded.reasoningEffort : undefined);
  const effortEfforts =
    choice?.kind === 'engine'
      ? engineCatalogModel(engines ?? [], { engine: choice.engine, model: choice.model })?.efforts
      : choice?.kind === 'model'
        ? models?.find((item) => item.provider === choice.provider && item.model === choice.model)
            ?.efforts
        : undefined;
  const effort =
    effortId === undefined || effortId === '' ? undefined : effortName(effortEfforts, effortId);
  const kind =
    label === undefined
      ? undefined
      : t(label.external ? 'sessions.model.sub' : 'sessions.model.api');
  const accessible = [t('sessions.model.choice'), shown, effort, kind].filter(Boolean).join(', ');
  return (
    <span ref={mount} data-session-model-control="" {...stylex.props(styles.wrap)}>
      <Button
        ref={trigger}
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={accessible}
        title={accessible}
        disabled={saving || state === undefined}
        onClick={() => setOpen(!open)}
        xstyle={[styles.chip, open && styles.open]}
        icon={
          label !== undefined ? (
            <ModelBrandIcon brand={label.brand} size={14} />
          ) : (
            <Icon name={choice?.kind === 'group' ? 'git-branch' : 'layers-2'} size={14} />
          )
        }
      >
        <span {...stylex.props(styles.name)}>{shown}</span>
        {effort === undefined ? null : <span {...stylex.props(styles.effort)}>{effort}</span>}
      </Button>
      {open && items !== undefined ? (
        <ModelMenu
          label={t('sessions.model.choice')}
          items={items.menu}
          value={choiceKey(state?.override ?? null)}
          onSelect={select}
          favoriteSource={null}
          anchorRef={trigger}
          onClose={() => setOpen(false)}
          t={t}
        />
      ) : null}
    </span>
  );
}
