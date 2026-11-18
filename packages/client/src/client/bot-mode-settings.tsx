import { useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';

import {
  type BotModeActions,
  type BotModeOptionView,
  type BotModesView,
  type BotModeTemplateView,
} from './bot-mode-actions.js';
import { errorMessage } from './bridge.js';
import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { Button } from './ds/button.js';
import { FieldStack, TextField } from './ds/field.js';
import { DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Icon } from './ds/icon.js';
import { Note } from './ds/note.js';
import { Select } from './ds/select.js';
import { SettingsRow, SettingsRows, SettingsSection } from './ds/settings-row.js';
import { Switch } from './ds/switch.js';
import { ink, space } from './ds/tobs.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';

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

const TOBS = 'deepseekbot';
const PRODUCT = '@product';
const FOLLOW = '@global';
const ALL = '@all';

function templateModes(view: BotModesView, template: BotModeTemplateView, t: BotHarnessTranslate) {
  return template.modes.map((id) => modeName(view, id, t)).join('、');
}

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: space.x4, minWidth: 0 },
  check: { display: 'inline-flex', color: ink.primary },
});

function useBotModes(
  load: (() => Promise<BotModesView>) | undefined,
  key: string | undefined,
): [
  BotModesView | undefined,
  (view: BotModesView) => void,
  string | undefined,
  (node: HTMLDivElement) => void,
  () => void,
] {
  const [view, setView] = useState<BotModesView>();
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);
  const latest = useRef(load);
  latest.current = load;
  const mount = useMountedResource<HTMLDivElement>(() => {
    const read = latest.current;
    if (read === undefined) return;
    let live = true;
    setError(undefined);
    read().then(
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
  }, [load === undefined, key, attempt]);
  return [view, setView, error, mount, () => setAttempt((count) => count + 1)];
}

function LoadFailure({
  message,
  retry,
  t,
  inset = false,
}: {
  message: string;
  retry: () => void;
  t: BotHarnessTranslate;
  inset?: boolean;
}): ReactElement {
  return (
    <Note tone="danger" inset={inset}>
      {message}{' '}
      <Button size="sm" variant="ghost" onClick={retry}>
        {t('botMode.retry')}
      </Button>
    </Note>
  );
}

export function BotModeDefaultSetting({
  actions,
  t,
}: {
  actions: BotModeActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView, loadError, mount, retry] = useBotModes(actions.botModes, undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  if (actions.botModes === undefined || actions.setBotModeDefault === undefined) return null;
  const set = actions.setBotModeDefault;
  const value = view === undefined || view.globalDefault === null ? PRODUCT : view.globalDefault;
  const options =
    view === undefined
      ? [{ value, label: '…' }]
      : [
          {
            value: PRODUCT,
            label: t('botMode.productLabel', { name: modeName(view, view.productDefault, t) }),
          },
          ...(value !== PRODUCT &&
          !view.modes.some((mode) => mode.id === value && mode.broken === undefined)
            ? [
                {
                  value,
                  label: t('botMode.missing', { id: value }),
                },
              ]
            : []),
          ...view.modes
            .filter(
              (mode) =>
                (mode.id !== view.productDefault || value === mode.id) && mode.broken === undefined,
            )
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
  const shown = error;
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
      {view !== undefined && view.effectiveDefault !== TOBS ? (
        <Note inset>{t('botMode.notTobs')}</Note>
      ) : null}
      {view === undefined && loadError !== undefined ? (
        <LoadFailure message={loadError} retry={retry} t={t} inset />
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
  const [view, setView, loadError, mount, retry] = useBotModes(load, botSlug);
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
        <LoadFailure message={loadError} retry={retry} t={t} />
      ),
    );
  const own = view.bot?.mode ?? null;
  const selected = own ?? FOLLOW;
  const allowed = view.bot?.allowed ?? null;
  const template = view.bot?.template ?? ALL;
  const setTemplate = modeActions.setBotModeTemplate;
  const chooseTemplate = (next: string): void => {
    if (busy || next === template || setTemplate === undefined) return;
    setBusy(true);
    setError(undefined);
    void setTemplate(botSlug, next === ALL ? null : next)
      .then(setView)
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
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
    ...view.modes
      .filter((mode) => allowed === null || allowed.includes(mode.id) || mode.id === own)
      .map((mode) => ({
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
      {setTemplate === undefined ? null : (
        <SettingsRows>
          <SettingsRow
            data={{ 'data-bot-mode-template': '' }}
            title={t('botMode.template.bot.title')}
            description={
              template === ALL ? t('botMode.template.bot.all') : t('botMode.template.bot.limited')
            }
            control={
              <Select
                label={t('botMode.template.bot.title')}
                value={template}
                disabled={busy}
                options={[
                  { value: ALL, label: t('botMode.template.all') },
                  ...view.templates.map((entry) => ({ value: entry.id, label: entry.name })),
                ]}
                onChange={chooseTemplate}
              />
            }
          />
        </SettingsRows>
      )}
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
                    <span
                      role="img"
                      aria-label={t('botMode.selected')}
                      {...stylex.props(styles.check)}
                    >
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
      {effective === TOBS ? null : <Note>{t('botMode.notTobs')}</Note>}
      {error === undefined ? null : <Note tone="danger">{error}</Note>}
    </>,
  );
}

interface TemplateDraft {
  id?: string;
  name: string;
  modes: string[];
}

export function BotModeTemplateSettings({
  actions,
  t,
}: {
  actions: BotModeActions;
  t: BotHarnessTranslate;
}): ReactElement | null {
  const [view, setView, loadError, mount, retry] = useBotModes(actions.botModes, undefined);
  const [draft, setDraft] = useState<TemplateDraft>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const save = actions.saveBotModeTemplate;
  const remove = actions.deleteBotModeTemplate;
  if (actions.botModes === undefined || save === undefined || remove === undefined) return null;
  const run = (work: () => Promise<BotModesView>): void => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    void work()
      .then((next) => {
        setView(next);
        setDraft(undefined);
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
  };
  const open = (next: TemplateDraft): void => {
    setError(undefined);
    setDraft(next);
  };
  const installed = view?.modes.filter((mode) => mode.broken === undefined) ?? [];
  const missingText = (id: string) => t('botMode.missing', { id });
  const unavailable =
    draft === undefined
      ? []
      : draft.modes.filter((id) => !installed.some((mode) => mode.id === id));
  const labels = { close: t('common.close'), cancel: t('common.cancel') };
  const toggle = (current: TemplateDraft, id: string, on: boolean): TemplateDraft => ({
    ...current,
    modes: on
      ? [...current.modes.filter((mode) => mode !== id), id]
      : current.modes.filter((mode) => mode !== id),
  });
  return (
    <SettingsSection
      rootRef={mount}
      data={{ 'data-bot-mode-templates': '' }}
      title={t('botMode.templates.title')}
      description={t('botMode.templates.description')}
      action={
        <Button
          size="sm"
          variant="outline"
          disabled={view === undefined}
          data-bot-mode-template-new=""
          onClick={() => open({ name: '', modes: [] })}
        >
          {t('botMode.templates.new')}
        </Button>
      }
    >
      {view === undefined ? (
        loadError === undefined ? (
          <Note inset>…</Note>
        ) : (
          <LoadFailure message={loadError} retry={retry} t={t} inset />
        )
      ) : view.templates.length === 0 ? (
        <Note inset>{t('botMode.templates.empty')}</Note>
      ) : (
        view.templates.map((template) => (
          <SettingsRow
            key={template.id}
            data={{ 'data-bot-mode-template-row': template.id }}
            title={template.name}
            description={templateModes(view, template, t)}
            control={
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  open({
                    id: template.id,
                    name: template.name,
                    modes: [...template.modes],
                  })
                }
              >
                {t('botMode.templates.edit')}
              </Button>
            }
          />
        ))
      )}
      {draft === undefined || view === undefined ? null : (
        <FormDialog
          title={
            draft.id === undefined
              ? t('botMode.templates.createTitle')
              : t('botMode.templates.editTitle')
          }
          size="medium"
          scroll
          labels={labels}
          submitLabel={t('botMode.templates.save')}
          submitData={{ 'data-bot-mode-template-submit': '' }}
          submitDisabled={draft.name.trim() === '' || draft.modes.length === 0}
          busy={busy}
          error={error}
          onCancel={() => setDraft(undefined)}
          onSubmit={() =>
            run(() =>
              save({
                ...(draft.id === undefined ? {} : { id: draft.id }),
                name: draft.name.trim(),
                modes: draft.modes,
              }),
            )
          }
          secondary={
            draft.id === undefined ? undefined : (
              <DangerTextButton disabled={busy} onClick={() => run(() => remove(draft.id!))}>
                {t('botMode.templates.delete')}
              </DangerTextButton>
            )
          }
        >
          <FieldStack>
            <TextField
              label={t('botMode.templates.name')}
              value={draft.name}
              initialFocus
              maxLength={60}
              autoComplete="off"
              onChange={(name) => setDraft({ ...draft, name })}
            />
            <Note>{t('botMode.templates.pick')}</Note>
            <SettingsRows>
              {installed.map((mode) => (
                <SettingsRow
                  key={mode.id}
                  title={modeText(mode, t).name}
                  description={modeText(mode, t).description}
                  control={
                    <Switch
                      label={modeText(mode, t).name}
                      checked={draft.modes.includes(mode.id)}
                      disabled={busy}
                      onChange={(on) => setDraft(toggle(draft, mode.id, on))}
                    />
                  }
                />
              ))}
              {unavailable.map((id) => (
                <SettingsRow
                  key={id}
                  title={missingText(id)}
                  control={
                    <Switch
                      label={missingText(id)}
                      checked
                      disabled={busy}
                      onChange={() => setDraft(toggle(draft, id, false))}
                    />
                  }
                />
              ))}
            </SettingsRows>
          </FieldStack>
        </FormDialog>
      )}
    </SettingsSection>
  );
}
