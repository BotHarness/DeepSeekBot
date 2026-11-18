import { useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import { errorMessage, unwrap, type BridgeCall } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, space } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

export interface BotModeOptionView {
  id: string;
  name?: string;
  description?: string;
  broken?: string;
}

export interface BotModesView {
  modes: BotModeOptionView[];
  productDefault: string;
  globalDefault: string | null;
  effectiveDefault: string;
  bot?: { slug: string; mode: string | null; effective: string };
}

export interface BotModeActions {
  botModes?(slug?: string): Promise<BotModesView>;
  setBotModeDefault?(mode: string | null): Promise<BotModesView>;
  setBotMode?(slug: string, mode: string | null): Promise<BotModesView>;
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

export function parseBotModesView(value: unknown, method: string): BotModesView {
  const view = record(value);
  const modes = view?.['modes'];
  const productDefault = view?.['productDefault'];
  const globalDefault = view?.['globalDefault'];
  const effectiveDefault = view?.['effectiveDefault'];
  if (
    !Array.isArray(modes) ||
    typeof productDefault !== 'string' ||
    (globalDefault !== null && typeof globalDefault !== 'string') ||
    typeof effectiveDefault !== 'string'
  )
    throw new Error(`invalid ${method} response`);
  const bot = record(view?.['bot']);
  return {
    modes: modes.flatMap((entry) => {
      const mode = record(entry);
      const id = mode?.['id'];
      if (typeof id !== 'string') return [];
      const name = optionalString(mode?.['name']);
      const description = optionalString(mode?.['description']);
      const broken = optionalString(mode?.['broken']);
      return [
        {
          id,
          ...(name === undefined ? {} : { name }),
          ...(description === undefined ? {} : { description }),
          ...(broken === undefined ? {} : { broken }),
        },
      ];
    }),
    productDefault,
    globalDefault,
    effectiveDefault,
    ...(bot !== undefined &&
    typeof bot['slug'] === 'string' &&
    typeof bot['effective'] === 'string' &&
    (bot['mode'] === null || typeof bot['mode'] === 'string')
      ? { bot: { slug: bot['slug'], mode: bot['mode'], effective: bot['effective'] } }
      : {}),
  };
}

export function botModeActions(call: BridgeCall): Required<BotModeActions> {
  return {
    botModes: async (slug) =>
      parseBotModesView(
        await unwrap(call, 'botModes', slug === undefined ? {} : { slug }),
        'botModes',
      ),
    setBotModeDefault: async (mode) =>
      parseBotModesView(await unwrap(call, 'botModeDefaultSet', { mode }), 'botModeDefaultSet'),
    setBotMode: async (slug, mode) =>
      parseBotModesView(await unwrap(call, 'botModeSet', { slug, mode }), 'botModeSet'),
  };
}

const BUILT_IN_MODES = ['standard', 'ptc', 'minimal', 'cordis', 'deepseekbot'] as const;
type BuiltInMode = (typeof BUILT_IN_MODES)[number];

function builtIn(mode: BotModeOptionView): BuiltInMode | undefined {
  const id = BUILT_IN_MODES.find((entry) => entry === mode.id);
  return id === undefined || (mode.name !== undefined && id !== 'deepseekbot') ? undefined : id;
}

export function modeText(
  mode: BotModeOptionView,
  t: BotHarnessTranslate,
): { name: string; description?: string } {
  const id = builtIn(mode);
  if (id !== undefined)
    return {
      name: t(`botMode.builtIn.${id}.name`),
      description: t(`botMode.builtIn.${id}.description`),
    };
  return {
    name: mode.name ?? mode.id,
    ...(mode.description === undefined ? {} : { description: mode.description }),
  };
}

function modeName(view: BotModesView, id: string, t: BotHarnessTranslate): string {
  const mode = view.modes.find((entry) => entry.id === id);
  return mode === undefined ? id : modeText(mode, t).name;
}

const PRODUCT = '@product';
const FOLLOW = '@global';

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  check: { display: 'inline-flex', color: color.fg },
});

function useBotModes(
  load: (() => Promise<BotModesView>) | undefined,
  key: string | undefined,
): [
  BotModesView | undefined,
  (view: BotModesView) => void,
  string | undefined,
  (node: HTMLDivElement) => void,
] {
  const [view, setView] = useState<BotModesView>();
  const [error, setError] = useState<string>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (load === undefined) return;
    let live = true;
    load().then(
      (next) => {
        if (live) setView(next);
      },
      (cause: unknown) => {
        if (live) setError(errorMessage(cause));
      },
    );
    return () => {
      live = false;
    };
  }, [load, key]);
  return [view, setView, error, mount];
}

export function BotModeDefaultSetting({
  actions,
  t,
}: {
  actions: BotModeActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView, loadError, mount] = useBotModes(actions.botModes, undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (actions.botModes === undefined || actions.setBotModeDefault === undefined) return null;
  const set = actions.setBotModeDefault;
  const value = view?.globalDefault ?? PRODUCT;
  const options =
    view === undefined
      ? [{ value, label: '…' }]
      : [
          {
            value: PRODUCT,
            label: t('botMode.productLabel', { name: modeName(view, view.productDefault, t) }),
          },
          ...(view.globalDefault !== null &&
          !view.modes.some((mode) => mode.id === view.globalDefault)
            ? [
                {
                  value: view.globalDefault,
                  label: t('botMode.missing', { id: view.globalDefault }),
                },
              ]
            : []),
          ...view.modes
            .filter((mode) => mode.id !== view.productDefault && mode.broken === undefined)
            .map((mode) => ({ value: mode.id, label: modeText(mode, t).name })),
        ];
  const choose = (next: string): void => {
    if (busy || next === value) return;
    setBusy(true);
    setError(undefined);
    void set(next === PRODUCT ? null : next)
      .then(setView)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const shown = error ?? loadError;
  return (
    <>
      <SettingsRow
        rootRef={mount}
        data={{ 'data-bot-mode-default': '' }}
        title={t('botMode.default.title')}
        description={t('botMode.default.description')}
        control={
          <Select
            label={t('botMode.default.title')}
            value={value}
            disabled={busy || view === undefined}
            options={options}
            onChange={choose}
          />
        }
      />
      {view !== undefined && view.effectiveDefault !== view.productDefault ? (
        <Note inset>{t('botMode.notTobs')}</Note>
      ) : null}
      {shown === undefined ? null : (
        <Note tone="danger" inset>
          {shown}
        </Note>
      )}
    </>
  );
}

export function BotModeSettingsEntry({
  botSlug,
  actions,
  t,
}: ChannelSidebarEntryProps): ReactElement | null {
  const modeActions: BotModeActions = actions;
  const load =
    botSlug === undefined || modeActions.botModes === undefined
      ? undefined
      : () => modeActions.botModes!(botSlug);
  const [view, setView, loadError, mount] = useBotModes(load, botSlug);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (botSlug === undefined || load === undefined || modeActions.setBotMode === undefined)
    return null;
  const set = modeActions.setBotMode;
  const page = (body: ReactElement) => (
    <div ref={mount} data-bot-mode-settings="" {...stylex.props(styles.page)}>
      {body}
    </div>
  );
  if (view === undefined)
    return page(
      loadError === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('entry.mode')} />
      ) : (
        <Note tone="danger">{loadError}</Note>
      ),
    );
  const own = view.bot?.mode ?? null;
  const selected = own ?? FOLLOW;
  const cards = [
    {
      id: FOLLOW,
      title: t('botMode.follow'),
      meta: t('botMode.followHint', { name: modeName(view, view.effectiveDefault, t) }),
      disabled: false,
    },
    ...(own !== null && !view.modes.some((mode) => mode.id === own)
      ? [{ id: own, title: t('botMode.missing', { id: own }), meta: undefined, disabled: true }]
      : []),
    ...view.modes.map((mode) => ({
      id: mode.id,
      title: modeText(mode, t).name,
      meta: mode.broken === undefined ? modeText(mode, t).description : t('botMode.broken'),
      disabled: mode.broken !== undefined,
    })),
  ];
  const choose = (id: string): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void set(botSlug, id === FOLLOW ? null : id)
      .then(setView)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const effective = view.bot?.effective ?? view.effectiveDefault;
  return page(
    <>
      <Note>{t('botMode.nextSession')}</Note>
      <section aria-label={t('entry.mode')}>
        <SidebarCardList label={t('entry.mode')}>
          {cards.map((card) => {
            const active = card.id === selected;
            return (
              <SidebarCardRow
                key={card.id}
                icon="sliders-horizontal"
                title={card.title}
                meta={card.meta}
                selection={{ checked: active }}
                disabled={busy || (card.disabled && !active)}
                trailing={
                  active ? (
                    <span {...stylex.props(styles.check)}>
                      <Icon name="check" />
                    </span>
                  ) : undefined
                }
                {...(active || card.disabled ? {} : { onClick: () => choose(card.id) })}
              />
            );
          })}
        </SidebarCardList>
      </section>
      {effective === view.productDefault ? null : <Note>{t('botMode.notTobs')}</Note>}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </>,
  );
}
