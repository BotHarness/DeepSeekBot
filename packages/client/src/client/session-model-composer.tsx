import { useMemo, useRef, useState } from 'react';
import type {
  SessionModelChoice,
  SessionModelState,
} from '@botharness/host-protocol/session-model';
import { turnTargetLabel, type TurnTargetCatalog } from '@botharness/host-client/turn-target';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';

import type { BridgeActions } from './actions.js';
import type { ModelCatalogEntryView, ModelCatalogGroupView } from './bridge.js';
import { Icon } from './ds/icon.js';
import { PickerTrigger } from './ds/picker-trigger.js';
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
  const label = visible === undefined ? undefined : turnTargetLabel(visible, catalog);
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
  return (
    <span ref={mount} data-session-model-control="">
      <PickerTrigger
        ref={trigger}
        compact
        label={shown}
        icon={
          label !== undefined ? (
            <ModelBrandIcon brand={label.brand} size={14} />
          ) : choice?.kind === 'group' ? (
            <Icon name="git-branch" size={14} />
          ) : undefined
        }
        hint={
          label === undefined
            ? undefined
            : t(label.external ? 'sessions.model.sub' : 'sessions.model.api')
        }
        expanded={open}
        disabled={saving || state === undefined}
        accessibleLabel={
          shown === t('sessions.model.choice') ? shown : `${t('sessions.model.choice')}, ${shown}`
        }
        onClick={() => setOpen(!open)}
      />
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
