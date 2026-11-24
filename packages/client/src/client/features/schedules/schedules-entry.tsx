import { Icon } from '../../ds/icon.js';
import { Tag } from '../../ds/tag.js';
import { Button } from '../../ds/button.js';
import { SegmentedControl } from '../../ds/segmented.js';
import { Switch } from '../../ds/switch.js';
import { PanelEmptyState } from '../../ds/empty-state.js';
import { useId, useRef, useState, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import { Tooltip } from '../../ds/tooltip.js';
import type { ChannelSidebarEntryProps } from '../../channel-sidebar.js';
import { ChannelSidebarIcon } from '../../channel-sidebar-icon.js';
import {
  errorMessage,
  type BotScheduleFiringView,
  type BotScheduleTrigger,
  type BotScheduleView,
} from '../../bridge.js';
import { Callout } from '../../ds/callout.js';
import { Field, TextAreaField, TextField } from '../../ds/field.js';
import { DangerTextButton, FormDialog } from '../../ds/form-dialog.js';
import { dimension } from '../../ds/dimensions.stylex.js';
import { edge, layer, line, size } from '../../ds/tobs.stylex.js';
import { Note } from '../../ds/note.js';
import { ReadFailure } from '../../ds/read-failure.js';
import { SettingsRow } from '../../ds/settings-row.js';
import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import type { BotHarnessTranslate } from '../../locale.js';
import { LoadingSkeleton } from '../../loading-skeleton.js';
import { useMountedResource } from '../../mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from '../../sidebar-card.js';
import { subscribeMessagingDefaults } from '../../messaging-defaults-live.js';
import { IconButton } from '../../ds/icon-button.js';
import { visibleInterval } from '../../visible-interval.js';
import {
  WEEKDAYS,
  type ScheduleForm,
  emptyScheduleForm,
  isIntervalUnit,
  scheduleFormOf,
  scheduleTriggerOf,
  scheduleCadenceLabel,
  formatSchedulePreview,
  formatScheduleTime,
} from './schedule-form.js';

export const SCHEDULE_COST_WARNING_SECONDS = 15 * 60;

const REFRESH_MS = 30_000;

const PREVIEW_DELAY_MS = 250;

const STARTED_MS = 4000;

const TOOLTIP_DELAY_MS = 400;

const styles = stylex.create({
  locked: { color: color.fg },
  unlocked: { opacity: { default: 0.55, ':disabled': 0.5 } },
  grow: { flexGrow: 1, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  wide: { flexGrow: 2, flexShrink: 1, flexBasis: 0, minWidth: 0 },
  row: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x3,
    minWidth: 0,
  },
  input: { width: '100%' },
  weekdays: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: space.x2,
  },
  weekday: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: size.rowComfortable,
    paddingBlock: space.x3,
    paddingInline: 0,
    borderWidth: border.hairline,
    borderStyle: 'solid',
    borderColor: {
      default: color.border,
      ':is([aria-pressed=true])': color.fg,
    },
    borderRadius: radius.sm,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':is([aria-pressed=true])': color.fg,
    },
    color: {
      default: color.muted,
      ':is([aria-pressed=true])': layer.canvas,
    },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    cursor: 'pointer',
    outline: {
      default: 'none',
      ':focus-visible': `${edge.focus} solid ${line.focus}`,
    },
    outlineOffset: edge.focusOffset,
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.sm,
    backgroundColor: color.hover,
    fontSize: text.metaSize,
    lineHeight: text.metaLine,
  },
  muted: { margin: 0, color: color.muted },
  danger: { margin: 0, color: color.danger },
  list: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x1,
    margin: 0,
    padding: 0,
    listStyle: 'none',
    color: color.fg,
    fontVariantNumeric: 'tabular-nums',
  },
  history: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    paddingTop: space.x4,
    borderTopWidth: border.hairline,
    borderTopStyle: 'solid',
    borderTopColor: color.divider,
  },
  historyTitle: {
    margin: 0,
    color: color.fg,
    fontSize: text.bodySize,
    lineHeight: text.bodyLine,
    fontWeight: text.strong,
  },
  firings: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x3,
    maxHeight: dimension.scheduleHistoryMaxHeight,
    margin: 0,
    padding: 0,
    overflow: 'auto',
    listStyle: 'none',
  },
  firing: {
    display: 'flex',
    alignItems: 'center',
    gap: space.x3,
    minWidth: 0,
  },
  firingTime: {
    flexGrow: 1,
    minWidth: 0,
    color: color.muted,
    fontSize: text.metaSize,
  },
  link: {
    padding: 0,
    borderWidth: 0,
    backgroundColor: 'transparent',
    color: color.fg,
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    textDecoration: 'underline',
    cursor: 'pointer',
  },
});

const pendingCreates = new Set<string>();
const createListeners = new Set<() => void>();

function requestCreate(slug: string): void {
  pendingCreates.add(slug);
  for (const listener of createListeners) listener();
}

const STATE_TONE = {
  pending: 'warning',
  observed: 'info',
  handled: 'success',
  coalesced: 'neutral',
  skipped: 'quiet',
} as const;

function FiringTag({
  firing,
  t,
}: {
  firing: BotScheduleFiringView;
  t: BotHarnessTranslate;
}): ReactElement {
  return <Tag tone={STATE_TONE[firing.state]}>{t(`schedule.state.${firing.state}`)}</Tag>;
}

export function BotSchedulesHeaderAction({
  botSlug,
  setExpanded,
  t,
}: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <></>;
  return (
    <Tooltip label={t('schedule.add')} side="bottom" delayMs={500}>
      <IconButton
        size="row"
        tone="subtle"
        aria-label={t('schedule.add')}
        aria-haspopup="dialog"
        onClick={() => {
          requestCreate(botSlug);
          setExpanded?.(true);
        }}
      >
        <Icon name="plus" size={16} />
      </IconButton>
    </Tooltip>
  );
}

function SchedulePreview({
  trigger,
  preview,
  t,
}: {
  trigger: BotScheduleTrigger | undefined;
  preview: (trigger: BotScheduleTrigger) => Promise<string[]>;
  t: BotHarnessTranslate;
}): ReactElement {
  const key = JSON.stringify(trigger);
  const [request, setRequest] = useState({ key, preview });
  const [result, setResult] = useState<
    { kind: 'success'; occurrences: string[] } | { kind: 'error'; reason: string }
  >();
  if (request.key !== key || request.preview !== preview) {
    setRequest({ key, preview });
    setResult(undefined);
  }
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (trigger === undefined) return;
    let live = true;
    const timer = setTimeout(() => {
      void preview(trigger)
        .then((occurrences) => {
          if (live) setResult({ kind: 'success', occurrences });
        })
        .catch((cause: unknown) => {
          if (live) setResult({ kind: 'error', reason: errorMessage(cause) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, preview]);
  return (
    <div ref={mount} aria-live="polite" data-schedule-preview="" {...stylex.props(styles.preview)}>
      <span {...stylex.props(styles.muted)}>{t('schedule.preview')}</span>
      {trigger === undefined ? (
        <span {...stylex.props(styles.muted)}>{t('schedule.preview.incomplete')}</span>
      ) : result === undefined ? (
        <span {...stylex.props(styles.muted)}>{t('schedule.preview.loading')}</span>
      ) : result.kind === 'error' ? (
        <span role="alert" {...stylex.props(styles.danger)}>
          {t('schedule.preview.invalid', { reason: result.reason })}
        </span>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {result.occurrences.map((occurrence) => (
            <li key={occurrence}>{formatSchedulePreview(occurrence)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

function ScheduleEditor({
  initial,
  editing,
  busy,
  error,
  onClose,
  onSave,
  onDelete,
  history,
  preview,
  t,
}: {
  initial: ScheduleForm;
  editing: BotScheduleView | undefined;
  busy: boolean;
  error: string | undefined;
  onClose: () => void;
  onSave: (form: ScheduleForm) => void;
  onDelete: () => void;
  history: ReactElement | undefined;
  preview: (trigger: BotScheduleTrigger) => Promise<string[]>;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trigger = scheduleTriggerOf(form);
  const interval = isIntervalUnit(form.unit);
  const everyLabel = {
    seconds: 'schedule.form.everySeconds',
    minutes: 'schedule.form.everyMinutes',
    hours: 'schedule.form.everyHours',
  } as const;
  const costly = trigger?.kind === 'every' && trigger.everySeconds < SCHEDULE_COST_WARNING_SECONDS;
  const valid =
    trigger !== undefined && form.title.trim().length > 0 && form.prompt.trim().length > 0;
  const set = (patch: Partial<ScheduleForm>): void =>
    setForm((current) => ({ ...current, ...patch }));
  return (
    <FormDialog
      title={editing === undefined ? t('schedule.add') : t('schedule.edit')}
      size="medium"
      labels={{ close: t('schedule.close'), cancel: t('schedule.cancel') }}
      submitLabel={editing === undefined ? t('schedule.create') : t('schedule.save')}
      submitDisabled={!valid}
      busy={busy}
      error={error}
      secondary={
        editing === undefined ? undefined : confirmDelete ? (
          <DangerTextButton disabled={busy} onClick={onDelete}>
            {t('schedule.deleteConfirm')}
          </DangerTextButton>
        ) : (
          <DangerTextButton disabled={busy} onClick={() => setConfirmDelete(true)}>
            {t('schedule.delete')}
          </DangerTextButton>
        )
      }
      onCancel={onClose}
      onSubmit={() => onSave(form)}
    >
      <TextField
        label={t('schedule.form.title')}
        value={form.title}
        maxLength={120}
        placeholder={t('schedule.form.titlePlaceholder')}
        initialFocus
        onChange={(title) => set({ title })}
      />
      <TextAreaField
        label={t('schedule.form.prompt')}
        rows={4}
        maxLength={4000}
        value={form.prompt}
        placeholder={t('schedule.form.promptPlaceholder')}
        onChange={(prompt) => set({ prompt })}
      />
      <Field label={t('schedule.form.cadence')} group>
        {() => (
          <SegmentedControl
            id={`${id}-unit`}
            label={t('schedule.form.cadence')}
            value={form.unit}
            options={[
              { value: 'seconds', label: t('schedule.form.unit.seconds') },
              { value: 'minutes', label: t('schedule.form.unit.minutes') },
              { value: 'hours', label: t('schedule.form.unit.hours') },
              { value: 'daily', label: t('schedule.form.unit.daily') },
              { value: 'weekly', label: t('schedule.form.unit.weekly') },
              { value: 'once', label: t('schedule.form.unit.once') },
              { value: 'cron', label: t('schedule.form.unit.cron') },
            ]}
            onChange={(unit) => set({ unit })}
          />
        )}
      </Field>
      {interval ? (
        <TextField
          label={t(everyLabel[form.unit])}
          type="number"
          min={form.unit === 'seconds' ? 60 : 1}
          step={1}
          value={form.every}
          onChange={(every) => set({ every })}
        />
      ) : null}
      {form.unit === 'weekly' ? (
        <Field label={t('schedule.form.weekdays')} group>
          {() => (
            <div {...stylex.props(styles.weekdays)}>
              {WEEKDAYS.map(([day, key]) => {
                const on = form.weekdays.includes(day);
                return (
                  <button
                    key={day}
                    type="button"
                    aria-pressed={on}
                    onClick={() =>
                      set({
                        weekdays: on
                          ? form.weekdays.filter((value) => value !== day)
                          : [...form.weekdays, day].sort((a, b) => a - b),
                      })
                    }
                    {...stylex.props(styles.weekday)}
                  >
                    {t(key)}
                  </button>
                );
              })}
            </div>
          )}
        </Field>
      ) : null}
      {form.unit === 'cron' ? (
        <TextField
          label={t('schedule.form.cron')}
          hint={t('schedule.form.cronHint')}
          monospace
          value={form.expression}
          spellCheck={false}
          placeholder="0 9 * * 1-5"
          onChange={(expression) => set({ expression })}
        />
      ) : null}
      {interval ? null : (
        <div {...stylex.props(styles.row)}>
          {form.unit === 'once' ? (
            <div {...stylex.props(styles.grow)}>
              <TextField
                label={t('schedule.form.date')}
                hint={t('schedule.form.onceHint')}
                type="date"
                value={form.date}
                onChange={(date) => set({ date })}
              />
            </div>
          ) : null}
          {form.unit === 'cron' ? null : (
            <div {...stylex.props(styles.grow)}>
              <TextField
                label={t('schedule.form.time')}
                type="time"
                value={form.time}
                onChange={(time) => set({ time })}
              />
            </div>
          )}
          <div {...stylex.props(styles.wide)}>
            <TextField
              label={t('schedule.form.timeZone')}
              value={form.timeZone}
              onChange={(timeZone) => set({ timeZone })}
            />
          </div>
        </div>
      )}
      <SchedulePreview trigger={trigger} preview={preview} t={t} />
      <SettingsRow
        title={t('schedule.form.lock')}
        description={t('schedule.form.lockHint')}
        control={
          <Switch
            checked={form.locked}
            label={t('schedule.form.lock')}
            onChange={(locked) => set({ locked })}
          />
        }
      />
      {costly ? (
        <Callout tone="warning" role="note">
          {t('schedule.form.cost')}
        </Callout>
      ) : null}
      {history}
    </FormDialog>
  );
}

function ScheduleHistory({
  botSlug,
  scheduleId,
  loadHistory,
  onOpenSession,
  t,
}: {
  botSlug: string;
  scheduleId: string;
  loadHistory: ChannelSidebarEntryProps['actions']['botScheduleHistory'];
  onOpenSession: (sessionId: string) => void;
  t: BotHarnessTranslate;
}): ReactElement {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<
    { kind: 'success'; rows: BotScheduleFiringView[] } | { kind: 'error'; reason: string }
  >();
  const mount = useMountedResource<HTMLElement>(() => {
    setResult(undefined);
    let live = true;
    void loadHistory(botSlug, scheduleId)
      .then((rows) => {
        if (live) setResult({ kind: 'success', rows });
      })
      .catch((cause: unknown) => {
        if (live) setResult({ kind: 'error', reason: errorMessage(cause) });
      });
    return () => {
      live = false;
    };
  }, [botSlug, scheduleId, loadHistory, attempt]);

  return (
    <section ref={mount} aria-label={t('schedule.history')} {...stylex.props(styles.history)}>
      <h4 {...stylex.props(styles.historyTitle)}>{t('schedule.history')}</h4>
      {result === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('schedule.loading')} />
      ) : result.kind === 'error' ? (
        <ReadFailure
          retryLabel={t('schedule.historyRetry')}
          onRetry={() => setAttempt((value) => value + 1)}
        >
          {t('schedule.historyError', { reason: result.reason })}
        </ReadFailure>
      ) : result.rows.length === 0 ? (
        <p {...stylex.props(styles.muted)}>{t('schedule.historyEmpty')}</p>
      ) : (
        <ol {...stylex.props(styles.firings)}>
          {result.rows.map((firing) => {
            const sessionId = firing.sessionId;
            return (
              <li key={firing.id} {...stylex.props(styles.firing)}>
                <span {...stylex.props(styles.firingTime)}>
                  {formatScheduleTime(firing.occurrenceAt)}
                </span>
                {firing.trigger === 'manual' ? (
                  <Tag tone="outline">{t('schedule.history.manual')}</Tag>
                ) : null}
                <FiringTag firing={firing} t={t} />
                {sessionId === undefined ? null : (
                  <button
                    type="button"
                    onClick={() => onOpenSession(sessionId)}
                    {...stylex.props(styles.link)}
                  >
                    {t('schedule.openSession')}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

export function ScheduleDialog({
  botSlug,
  scheduleId,
  actions,
  t,
  onClose,
  onChanged,
}: {
  botSlug: string;
  scheduleId: string | undefined;
  actions: ChannelSidebarEntryProps['actions'];
  t: BotHarnessTranslate;
  onClose: () => void;
  onChanged?: () => void;
}): ReactElement {
  const [schedule, setSchedule] = useState<BotScheduleView | null | undefined>(
    scheduleId === undefined ? null : undefined,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const lifetime = useRef(0);
  const mount = useMountedResource<HTMLSpanElement>(() => {
    const version = ++lifetime.current;
    setBusy(false);
    if (scheduleId !== undefined) {
      void actions
        .botSchedules(botSlug)
        .then((rows) => {
          if (lifetime.current === version)
            setSchedule(rows.find((row) => row.id === scheduleId) ?? null);
        })
        .catch((cause: unknown) => {
          if (lifetime.current !== version) return;
          setSchedule(null);
          setError(errorMessage(cause));
        });
    }
    return () => {
      ++lifetime.current;
    };
  }, [actions, botSlug, scheduleId]);

  const run = (action: () => Promise<unknown>): void => {
    const version = lifetime.current;
    setBusy(true);
    setError(undefined);
    void action()
      .then(() => {
        onChanged?.();
        if (lifetime.current === version) onClose();
      })
      .catch((cause: unknown) => {
        if (lifetime.current === version) setError(errorMessage(cause));
      })
      .finally(() => {
        if (lifetime.current === version) setBusy(false);
      });
  };

  if (schedule === undefined)
    return (
      <>
        <span ref={mount} hidden />
      </>
    );
  if (schedule === null && scheduleId !== undefined)
    return (
      <>
        <span ref={mount} hidden />
        <FormDialog
          title={t('schedule.edit')}
          labels={{ close: t('schedule.close'), cancel: t('schedule.cancel') }}
          submitLabel={t('schedule.close')}
          showCancel={false}
          onCancel={onClose}
          onSubmit={onClose}
        >
          <Note>{error ?? t('schedule.missing')}</Note>
        </FormDialog>
      </>
    );
  const editing = schedule ?? undefined;
  return (
    <>
      <span ref={mount} hidden />
      <ScheduleEditor
        initial={editing === undefined ? emptyScheduleForm() : scheduleFormOf(editing)}
        editing={editing}
        busy={busy}
        error={error}
        history={
          editing === undefined ? undefined : (
            <ScheduleHistory
              botSlug={botSlug}
              scheduleId={editing.id}
              loadHistory={actions.botScheduleHistory}
              onOpenSession={(sessionId) => {
                onClose();
                void actions.openSession(sessionId);
              }}
              t={t}
            />
          )
        }
        onClose={onClose}
        onSave={(form) => {
          const trigger = scheduleTriggerOf(form);
          if (trigger === undefined) return;
          run(() =>
            editing === undefined
              ? actions.createBotSchedule(botSlug, {
                  title: form.title,
                  prompt: form.prompt,
                  trigger,
                  ...(form.locked ? { locked: true } : {}),
                })
              : actions.updateBotSchedule(botSlug, editing.id, {
                  title: form.title,
                  prompt: form.prompt,
                  trigger,
                  ...(form.locked === editing.locked ? {} : { locked: form.locked }),
                }),
          );
        }}
        onDelete={() => {
          if (editing !== undefined) run(() => actions.deleteBotSchedule(botSlug, editing.id));
        }}
        preview={actions.botSchedulePreview}
        t={t}
      />
    </>
  );
}

export function BotSchedulesEntry({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <div />;
  return <BotScheduleList key={botSlug} botSlug={botSlug} actions={actions} t={t} />;
}

function BotScheduleList({
  botSlug,
  actions,
  t,
}: Pick<ChannelSidebarEntryProps, 'actions' | 't'> & { botSlug: string }): ReactElement {
  const [schedules, setSchedules] = useState<BotScheduleView[] | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [editor, setEditor] = useState<{ key: number; scheduleId: string | undefined }>();
  const [mutating, setMutating] = useState(false);
  const [started, setStarted] = useState<string | undefined>();
  const nextEditorKey = useRef(0);
  const active = useRef<
    | {
        refresh: () => Promise<void>;
        acknowledge: (scheduleId: string) => void;
      }
    | undefined
  >(undefined);

  const openEditor = (scheduleId: string | undefined): void => {
    setEditor({ key: ++nextEditorKey.current, scheduleId });
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    let latest = 0;
    let startedTimer: ReturnType<typeof setTimeout> | undefined;
    const resource = {
      refresh: async (): Promise<void> => {
        const request = ++latest;
        try {
          const rows = await actions.botSchedules(botSlug);
          if (active.current !== resource || request !== latest) return;
          setSchedules(rows);
          setLoadError(undefined);
        } catch (cause) {
          if (active.current === resource && request === latest) setLoadError(errorMessage(cause));
        }
      },
      acknowledge: (scheduleId: string): void => {
        setStarted(scheduleId);
        clearTimeout(startedTimer);
        startedTimer = setTimeout(() => setStarted(undefined), STARTED_MS);
      },
    };
    const consumeCreate = (): void => {
      if (pendingCreates.delete(botSlug)) openEditor(undefined);
    };
    active.current = resource;
    setSchedules(undefined);
    setLoadError(undefined);
    setMutating(false);
    setStarted(undefined);
    createListeners.add(consumeCreate);
    consumeCreate();
    void resource.refresh();
    const stopRefresh = visibleInterval(() => void resource.refresh(), REFRESH_MS);
    const unsubscribe = subscribeMessagingDefaults(() => void resource.refresh());
    return () => {
      active.current = undefined;
      createListeners.delete(consumeCreate);
      clearTimeout(startedTimer);
      stopRefresh();
      unsubscribe();
    };
  }, [actions, botSlug]);

  const mutate = (action: () => Promise<unknown>, acknowledge?: string): void => {
    const resource = active.current;
    if (resource === undefined) return;
    setMutating(true);
    setLoadError(undefined);
    void action()
      .then(() => {
        if (active.current !== resource) return;
        if (acknowledge !== undefined) resource.acknowledge(acknowledge);
        return resource.refresh();
      })
      .catch((cause: unknown) => {
        if (active.current === resource) setLoadError(errorMessage(cause));
      })
      .finally(() => {
        if (active.current === resource) setMutating(false);
      });
  };

  return (
    <div ref={mount} className="bh-schedules" data-bot-schedules="">
      {schedules === undefined && loadError === undefined ? (
        <LoadingSkeleton kind="sidebar" label={t('schedule.loading')} />
      ) : null}
      {loadError === undefined ? null : (
        <p className="bh-schedule-error" role="alert">
          {loadError}
        </p>
      )}
      {schedules !== undefined && schedules.length === 0 ? (
        <PanelEmptyState
          icon="alarm-clock"
          action={
            <Button variant="outline" size="sm" onClick={() => requestCreate(botSlug)}>
              {t('schedule.add')}
            </Button>
          }
        >
          {t('schedule.empty')}
        </PanelEmptyState>
      ) : null}
      {schedules === undefined || schedules.length === 0 ? null : (
        <SidebarCardList label={t('entry.schedules')}>
          {schedules.map((schedule) => (
            <SidebarCardRow
              key={schedule.id}
              icon="alarm-clock"
              title={schedule.title}
              muted={!schedule.enabled}
              dialog
              onClick={() => openEditor(schedule.id)}
              chips={
                <>
                  <Tag tone={schedule.enabled ? 'info' : 'outline'}>
                    {scheduleCadenceLabel(schedule.trigger, t)}
                  </Tag>
                  {schedule.lastFiring === undefined ? null : (
                    <FiringTag firing={schedule.lastFiring} t={t} />
                  )}
                  <Tooltip
                    label={t(`schedule.creator.${schedule.creator}`)}
                    side="top"
                    portal
                    delayMs={TOOLTIP_DELAY_MS}
                  >
                    <span
                      className="bh-card-glyph"
                      role="img"
                      aria-label={t(`schedule.creator.${schedule.creator}`)}
                    >
                      <ChannelSidebarIcon
                        name={schedule.creator === 'human' ? 'user' : 'bot'}
                        size={12}
                      />
                    </span>
                  </Tooltip>
                </>
              }
              meta={
                started === schedule.id
                  ? t('schedule.runNow.started')
                  : schedule.enabled && schedule.nextRunAt !== undefined
                    ? t('schedule.next', {
                        time: formatScheduleTime(schedule.nextRunAt),
                      })
                    : schedule.trigger.kind === 'once' && schedule.lastFiring !== undefined
                      ? t('schedule.done')
                      : t('schedule.paused')
              }
              trailing={
                <>
                  <Tooltip
                    label={t('schedule.runNow.tooltip')}
                    side="top"
                    portal
                    delayMs={TOOLTIP_DELAY_MS}
                  >
                    <IconButton
                      size="inline"
                      data-schedule-run-now=""
                      disabled={mutating}
                      aria-label={t('schedule.runNow', {
                        title: schedule.title,
                      })}
                      onClick={() =>
                        mutate(() => actions.runBotScheduleNow(botSlug, schedule.id), schedule.id)
                      }
                    >
                      <ChannelSidebarIcon name="play" size={14} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    label={schedule.locked ? t('schedule.locked') : t('schedule.lock.tooltip')}
                    side="top"
                    portal
                    delayMs={TOOLTIP_DELAY_MS}
                  >
                    <IconButton
                      size="inline"
                      data-schedule-lock=""
                      xstyle={schedule.locked ? styles.locked : styles.unlocked}
                      aria-pressed={schedule.locked}
                      disabled={mutating}
                      aria-label={
                        schedule.locked
                          ? t('schedule.unlock', { title: schedule.title })
                          : t('schedule.lock', { title: schedule.title })
                      }
                      onClick={() =>
                        mutate(() =>
                          actions.updateBotSchedule(botSlug, schedule.id, {
                            locked: !schedule.locked,
                          }),
                        )
                      }
                    >
                      <ChannelSidebarIcon name={schedule.locked ? 'lock' : 'lock-open'} size={14} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip
                    label={
                      schedule.enabled ? t('schedule.toggle.pause') : t('schedule.toggle.resume')
                    }
                    side="top"
                    portal
                    delayMs={TOOLTIP_DELAY_MS}
                  >
                    <span className="bh-schedule-switch">
                      <Switch
                        checked={schedule.enabled}
                        disabled={mutating}
                        label={t('schedule.enable', { title: schedule.title })}
                        onChange={(enabled) =>
                          mutate(() => actions.updateBotSchedule(botSlug, schedule.id, { enabled }))
                        }
                      />
                    </span>
                  </Tooltip>
                </>
              }
            />
          ))}
        </SidebarCardList>
      )}
      {editor === undefined ? null : (
        <ScheduleDialog
          key={editor.key}
          botSlug={botSlug}
          scheduleId={editor.scheduleId}
          actions={actions}
          t={t}
          onClose={() => setEditor((current) => (current === editor ? undefined : current))}
          onChanged={() => void active.current?.refresh()}
        />
      )}
    </div>
  );
}
