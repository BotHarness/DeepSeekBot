import { useId, useRef, useState, useSyncExternalStore, type ReactElement } from 'react';
import * as stylex from '@stylexjs/stylex';
import {
  Button,
  IconPlusOutlineRegular,
  SegmentedControl,
  Switch,
  Tag,
  Tooltip,
} from '@deepseek-ai/dsh-client-ui-primitives';

import type { ChannelSidebarEntryProps } from './channel-sidebar.js';
import { ChannelSidebarIcon } from './channel-sidebar-icon.js';
import {
  errorMessage,
  type BotScheduleFiringView,
  type BotScheduleTrigger,
  type BotScheduleView,
} from './bridge.js';
import { Callout } from './ds/callout.js';
import { Field, TextAreaField, TextField } from './ds/field.js';
import { DangerTextButton, FormDialog } from './ds/form-dialog.js';
import { Note } from './ds/note.js';
import { SettingsRow } from './ds/settings-row.js';
import { color, radius, space, text } from './ds/tokens.stylex.js';
import type { BotHarnessTranslate } from './locale.js';
import { LoadingSkeleton } from './loading-skeleton.js';
import { useMountedResource } from './mounted-resource.js';
import { SidebarCardList, SidebarCardRow } from './sidebar-card.js';
import { subscribeMessagingDefaults } from './messaging-defaults-live.js';

export const SCHEDULE_COST_WARNING_SECONDS = 15 * 60;
const REFRESH_MS = 30_000;

type CadenceUnit = 'minutes' | 'hours' | 'daily' | 'weekly' | 'once' | 'cron';

const WEEKDAYS = [
  [1, 'schedule.weekday.1'],
  [2, 'schedule.weekday.2'],
  [3, 'schedule.weekday.3'],
  [4, 'schedule.weekday.4'],
  [5, 'schedule.weekday.5'],
  [6, 'schedule.weekday.6'],
  [7, 'schedule.weekday.7'],
] as const;
const PREVIEW_DELAY_MS = 250;
const STARTED_MS = 4000;
const TOOLTIP_DELAY_MS = 400;
const TIME = /^\d{2}:\d{2}$/u;
const DATE = /^\d{4}-\d{2}-\d{2}$/u;

const styles = stylex.create({
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
    minWidth: '40px',
    paddingBlock: space.x3,
    paddingInline: 0,
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: color.border,
      ':is([aria-pressed=true])': color.fg,
    },
    borderRadius: radius.row,
    backgroundColor: {
      default: 'transparent',
      ':hover': color.hover,
      ':is([aria-pressed=true])': color.fg,
    },
    color: {
      default: color.muted,
      ':is([aria-pressed=true])': 'var(--dsw-alias-bg-base)',
    },
    fontFamily: 'inherit',
    fontSize: text.metaSize,
    cursor: 'pointer',
    outline: { default: 'none', ':focus-visible': `2px solid ${color.accent}` },
    outlineOffset: '1px',
  },
  preview: {
    display: 'flex',
    flexDirection: 'column',
    gap: space.x2,
    paddingBlock: space.x3,
    paddingInline: space.x4,
    borderRadius: radius.row,
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
    borderTopWidth: '0.5px',
    borderTopStyle: 'solid',
    borderTopColor: color.border,
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
    maxHeight: '200px',
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

export interface ScheduleForm {
  title: string;
  prompt: string;
  unit: CadenceUnit;
  every: string;
  time: string;
  timeZone: string;
  weekdays: number[];
  date: string;
  expression: string;
  locked: boolean;
}

const createRequests = new Map<string, number>();
const listeners = new Set<() => void>();
function requestCreate(slug: string): void {
  createRequests.set(slug, (createRequests.get(slug) ?? 0) + 1);
  for (const listener of listeners) listener();
}
function subscribeCreate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function browserTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

function localDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function emptyScheduleForm(
  timeZone = browserTimeZone(),
  now: Date = new Date(),
): ScheduleForm {
  return {
    title: '',
    prompt: '',
    unit: 'hours',
    every: '1',
    time: '09:00',
    timeZone,
    weekdays: [1, 2, 3, 4, 5],
    date: localDate(new Date(now.getTime() + 24 * 60 * 60 * 1000)),
    expression: '0 9 * * 1-5',
    locked: false,
  };
}

export function scheduleFormOf(schedule: BotScheduleView): ScheduleForm {
  const base = {
    ...emptyScheduleForm(),
    title: schedule.title,
    prompt: schedule.prompt,
    locked: schedule.locked,
  };
  const trigger = schedule.trigger;
  switch (trigger.kind) {
    case 'every': {
      const hours = trigger.everySeconds % 3600 === 0;
      return {
        ...base,
        unit: hours ? 'hours' : 'minutes',
        every: String(trigger.everySeconds / (hours ? 3600 : 60)),
      };
    }
    case 'daily':
      return {
        ...base,
        unit: 'daily',
        time: trigger.time,
        timeZone: trigger.timeZone,
      };
    case 'weekly':
      return {
        ...base,
        unit: 'weekly',
        time: trigger.time,
        timeZone: trigger.timeZone,
        weekdays: [...trigger.weekdays],
      };
    case 'once':
      return {
        ...base,
        unit: 'once',
        date: trigger.date,
        time: trigger.time,
        timeZone: trigger.timeZone,
      };
    case 'cron':
      return {
        ...base,
        unit: 'cron',
        expression: trigger.expression,
        timeZone: trigger.timeZone,
      };
  }
}

export function scheduleTriggerOf(form: ScheduleForm): BotScheduleTrigger | undefined {
  const timeZone = form.timeZone.trim();
  if (form.unit === 'minutes' || form.unit === 'hours') {
    const every = Number(form.every);
    if (!Number.isSafeInteger(every) || every < 1) return undefined;
    return {
      kind: 'every',
      everySeconds: every * (form.unit === 'hours' ? 3600 : 60),
    };
  }
  if (timeZone.length === 0) return undefined;
  if (form.unit === 'cron') {
    const expression = form.expression.trim().replace(/\s+/gu, ' ');
    return expression.length === 0 ? undefined : { kind: 'cron', expression, timeZone };
  }
  if (!TIME.test(form.time)) return undefined;
  if (form.unit === 'daily') return { kind: 'daily', time: form.time, timeZone };
  if (form.unit === 'weekly')
    return form.weekdays.length === 0
      ? undefined
      : {
          kind: 'weekly',
          time: form.time,
          timeZone,
          weekdays: [...new Set(form.weekdays)].sort((a, b) => a - b),
        };
  return DATE.test(form.date)
    ? { kind: 'once', date: form.date, time: form.time, timeZone }
    : undefined;
}

export function scheduleCadenceLabel(trigger: BotScheduleTrigger, t: BotHarnessTranslate): string {
  if (trigger.kind === 'daily') return t('schedule.cadence.daily', { time: trigger.time });
  if (trigger.kind === 'weekly')
    return t('schedule.cadence.weekly', {
      days: weekdayList(trigger.weekdays, t),
      time: trigger.time,
    });
  if (trigger.kind === 'once')
    return t('schedule.cadence.once', {
      time: `${trigger.date.slice(5)} ${trigger.time}`,
    });
  if (trigger.kind === 'cron')
    return t('schedule.cadence.cron', { expression: trigger.expression });
  if (trigger.everySeconds % 3600 === 0) {
    const n = trigger.everySeconds / 3600;
    return n === 1 ? t('schedule.cadence.hour') : t('schedule.cadence.hours', { n });
  }
  const n = Math.round(trigger.everySeconds / 60);
  return n === 1 ? t('schedule.cadence.minute') : t('schedule.cadence.minutes', { n });
}

function weekdayList(weekdays: number[], t: BotHarnessTranslate): string {
  const days = [...weekdays].sort((a, b) => a - b).join(',');
  if (days === '1,2,3,4,5') return t('schedule.weekdays.workdays');
  if (days === '6,7') return t('schedule.weekdays.weekend');
  if (days === '1,2,3,4,5,6,7') return t('schedule.weekdays.everyDay');
  return WEEKDAYS.filter(([day]) => weekdays.includes(day))
    .map(([, key]) => t(key))
    .join(t('schedule.weekdays.separator'));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function formatSchedulePreview(iso: string): string {
  const at = new Date(iso);
  return `${localDate(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export function formatScheduleTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const clock = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
  return at.toDateString() === now.toDateString()
    ? clock
    : `${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${clock}`;
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

export function BotSchedulesHeaderAction({ botSlug, t }: ChannelSidebarEntryProps): ReactElement {
  if (botSlug === undefined) return <></>;
  return (
    <Tooltip label={t('schedule.add')} side="bottom" delayMs={500}>
      <button
        type="button"
        className="bh-channel-sidebar-entry-action"
        aria-label={t('schedule.add')}
        aria-haspopup="dialog"
        onClick={() => requestCreate(botSlug)}
      >
        <IconPlusOutlineRegular size={16} />
      </button>
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
  const key = trigger === undefined ? '' : JSON.stringify(trigger);
  const [result, setResult] = useState<{
    key: string;
    occurrences?: string[];
    error?: string;
  }>();
  const mount = useMountedResource<HTMLDivElement>(() => {
    if (trigger === undefined) return;
    let live = true;
    const timer = setTimeout(() => {
      void preview(trigger)
        .then((occurrences) => {
          if (live) setResult({ key, occurrences });
        })
        .catch((cause: unknown) => {
          if (live) setResult({ key, error: errorMessage(cause) });
        });
    }, PREVIEW_DELAY_MS);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key, preview]);
  const current = result?.key === key ? result : undefined;
  return (
    <div ref={mount} aria-live="polite" data-schedule-preview="" {...stylex.props(styles.preview)}>
      <span {...stylex.props(styles.muted)}>{t('schedule.preview')}</span>
      {trigger === undefined ? (
        <span {...stylex.props(styles.muted)}>{t('schedule.preview.incomplete')}</span>
      ) : current === undefined ? (
        <span {...stylex.props(styles.muted)}>{t('schedule.preview.loading')}</span>
      ) : current.error !== undefined ? (
        <span role="alert" {...stylex.props(styles.danger)}>
          {t('schedule.preview.invalid', { reason: current.error })}
        </span>
      ) : (
        <ol {...stylex.props(styles.list)}>
          {current.occurrences!.map((occurrence) => (
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
  onOpenSession,
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
  history: BotScheduleFiringView[] | undefined;
  onOpenSession: (sessionId: string) => void;
  preview: (trigger: BotScheduleTrigger) => Promise<string[]>;
  t: BotHarnessTranslate;
}): ReactElement {
  const id = useId();
  const [form, setForm] = useState(initial);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const trigger = scheduleTriggerOf(form);
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
      {form.unit === 'minutes' || form.unit === 'hours' ? (
        <TextField
          label={
            form.unit === 'hours' ? t('schedule.form.everyHours') : t('schedule.form.everyMinutes')
          }
          type="number"
          min={1}
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
      {form.unit === 'minutes' || form.unit === 'hours' ? null : (
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
      {editing === undefined ? null : (
        <section aria-label={t('schedule.history')} {...stylex.props(styles.history)}>
          <h4 {...stylex.props(styles.historyTitle)}>{t('schedule.history')}</h4>
          {history === undefined ? (
            <LoadingSkeleton kind="sidebar" label={t('schedule.loading')} />
          ) : history.length === 0 ? (
            <p {...stylex.props(styles.muted)}>{t('schedule.historyEmpty')}</p>
          ) : (
            <ol {...stylex.props(styles.firings)}>
              {history.map((firing) => (
                <li key={firing.id} {...stylex.props(styles.firing)}>
                  <span {...stylex.props(styles.firingTime)}>
                    {formatScheduleTime(firing.occurrenceAt)}
                  </span>
                  {firing.trigger === 'manual' ? (
                    <Tag tone="outline">{t('schedule.history.manual')}</Tag>
                  ) : null}
                  <FiringTag firing={firing} t={t} />
                  {firing.sessionId === undefined ? null : (
                    <button
                      type="button"
                      onClick={() => onOpenSession(firing.sessionId!)}
                      {...stylex.props(styles.link)}
                    >
                      {t('schedule.openSession')}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </FormDialog>
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
  const [history, setHistory] = useState<BotScheduleFiringView[] | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const mount = useMountedResource<HTMLSpanElement>(() => {
    if (scheduleId === undefined) return;
    let live = true;
    void actions
      .botSchedules(botSlug)
      .then((rows) => {
        if (live) setSchedule(rows.find((row) => row.id === scheduleId) ?? null);
      })
      .catch((cause: unknown) => {
        if (!live) return;
        setSchedule(null);
        setError(errorMessage(cause));
      });
    void actions
      .botScheduleHistory(botSlug, scheduleId)
      .then((rows) => {
        if (live) setHistory(rows);
      })
      .catch(() => {
        if (live) setHistory([]);
      });
    return () => {
      live = false;
    };
  }, [actions, botSlug, scheduleId]);

  const run = (action: () => Promise<unknown>): void => {
    setBusy(true);
    setError(undefined);
    void action()
      .then(() => {
        onChanged?.();
        onClose();
      })
      .catch((cause: unknown) => setError(errorMessage(cause)))
      .finally(() => setBusy(false));
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
        history={history}
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
        onOpenSession={(sessionId) => {
          onClose();
          void actions.openSession(sessionId);
        }}
        preview={actions.botSchedulePreview}
        t={t}
      />
    </>
  );
}

export function BotSchedulesEntry({ botSlug, actions, t }: ChannelSidebarEntryProps): ReactElement {
  const [schedules, setSchedules] = useState<BotScheduleView[] | undefined>();
  const [loadError, setLoadError] = useState<string | undefined>();
  const [editor, setEditor] = useState<{
    key: number;
    scheduleId: string | undefined;
  }>();
  const [toggling, setToggling] = useState<string | undefined>();
  const [started, setStarted] = useState<string | undefined>();
  const active = useRef<string | undefined>(undefined);
  const editorKey = useRef(0);
  const createRevision = useSyncExternalStore(
    subscribeCreate,
    () => (botSlug === undefined ? 0 : (createRequests.get(botSlug) ?? 0)),
    () => 0,
  );
  const seenCreate = useRef(createRevision);
  if (seenCreate.current !== createRevision) {
    seenCreate.current = createRevision;
    editorKey.current += 1;
    setEditor({ key: editorKey.current, scheduleId: undefined });
  }

  const refresh = async (slug: string): Promise<void> => {
    try {
      const rows = await actions.botSchedules(slug);
      if (active.current !== slug) return;
      setSchedules(rows);
      setLoadError(undefined);
    } catch (cause) {
      if (active.current === slug) setLoadError(errorMessage(cause));
    }
  };

  const mount = useMountedResource<HTMLDivElement>(() => {
    active.current = botSlug;
    setSchedules(undefined);
    setLoadError(undefined);
    if (botSlug === undefined) return;
    void refresh(botSlug);
    const timer = setInterval(() => void refresh(botSlug), REFRESH_MS);
    const unsubscribe = subscribeMessagingDefaults(() => void refresh(botSlug));
    return () => {
      clearInterval(timer);
      unsubscribe();
      active.current = undefined;
    };
  }, [actions, botSlug]);

  if (botSlug === undefined) return <div ref={mount} />;

  const openEditor = (scheduleId: string): void => {
    editorKey.current += 1;
    setEditor({ key: editorKey.current, scheduleId });
  };

  const change = (
    schedule: BotScheduleView,
    patch: { enabled?: boolean; locked?: boolean },
  ): void => {
    setToggling(schedule.id);
    setLoadError(undefined);
    void actions
      .updateBotSchedule(botSlug, schedule.id, patch)
      .then(() => refresh(botSlug))
      .catch((cause: unknown) => setLoadError(errorMessage(cause)))
      .finally(() => setToggling(undefined));
  };

  const runNow = (schedule: BotScheduleView): void => {
    setToggling(schedule.id);
    setLoadError(undefined);
    void actions
      .runBotScheduleNow(botSlug, schedule.id)
      .then(() => {
        setStarted(schedule.id);
        setTimeout(
          () => setStarted((current) => (current === schedule.id ? undefined : current)),
          STARTED_MS,
        );
        return refresh(botSlug);
      })
      .catch((cause: unknown) => setLoadError(errorMessage(cause)))
      .finally(() => setToggling(undefined));
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
        <div className="bh-schedule-empty">
          <p className="bh-schedule-muted">{t('schedule.empty')}</p>
          <Button variant="outline" size="sm" onClick={() => requestCreate(botSlug)}>
            {t('schedule.add')}
          </Button>
        </div>
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
                      tabIndex={0}
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
                    <button
                      type="button"
                      className="bh-card-action bh-schedule-run-now"
                      disabled={toggling !== undefined}
                      aria-label={t('schedule.runNow', {
                        title: schedule.title,
                      })}
                      onClick={() => runNow(schedule)}
                    >
                      <ChannelSidebarIcon name="play" size={14} />
                    </button>
                  </Tooltip>
                  <Tooltip
                    label={schedule.locked ? t('schedule.locked') : t('schedule.lock.tooltip')}
                    side="top"
                    portal
                    delayMs={TOOLTIP_DELAY_MS}
                  >
                    <button
                      type="button"
                      className="bh-card-action bh-schedule-lock-toggle"
                      data-locked={schedule.locked ? 'true' : undefined}
                      aria-pressed={schedule.locked}
                      disabled={toggling !== undefined}
                      aria-label={
                        schedule.locked
                          ? t('schedule.unlock', { title: schedule.title })
                          : t('schedule.lock', { title: schedule.title })
                      }
                      onClick={() => change(schedule, { locked: !schedule.locked })}
                    >
                      <ChannelSidebarIcon name={schedule.locked ? 'lock' : 'lock-open'} size={14} />
                    </button>
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
                        disabled={toggling !== undefined}
                        label={t('schedule.enable', { title: schedule.title })}
                        onChange={(enabled) => change(schedule, { enabled })}
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
          onClose={() => setEditor(undefined)}
          onChanged={() => void refresh(botSlug)}
        />
      )}
    </div>
  );
}
