import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

import {
  ScheduleId,
  ScheduleInputError,
  createAtScheduleRecord,
  createCronScheduleRecord,
  createDailyScheduleRecord,
  createEveryScheduleRecord,
  createWeeklyScheduleRecord,
  resolveRecurringOccurrence,
} from '@deepseek-ai/dsh-schedule';

import type { OperationalDatabaseModulePort } from '../database/owner.js';

export const BOT_SCHEDULE_ENABLED_LIMIT = 20;
export const BOT_SCHEDULE_HISTORY_LIMIT = 20;
const MAX_TIMER_MS = 60 * 60 * 1000;

export type BotScheduleTrigger =
  | { kind: 'every'; everySeconds: number }
  | { kind: 'daily'; time: string; timeZone: string }
  | { kind: 'weekly'; time: string; timeZone: string; weekdays: number[] }
  | { kind: 'once'; date: string; time: string; timeZone: string }
  | { kind: 'cron'; expression: string; timeZone: string };

export const BOT_SCHEDULE_PREVIEW_COUNT = 3;

export type BotScheduleCreator = 'human' | 'personabot';

export type BotScheduleFiringState = 'pending' | 'observed' | 'handled' | 'coalesced' | 'skipped';

export interface BotScheduleFiring {
  id: string;
  scheduleId: string;
  trigger: 'planned' | 'manual';
  occurrenceAt: string;
  firedAt: string;
  state: BotScheduleFiringState;
  sourceEventId?: string;
  sessionId?: string;
}

export interface BotSchedule {
  id: string;
  botSlug: string;
  title: string;
  prompt: string;
  trigger: BotScheduleTrigger;
  enabled: boolean;
  creator: BotScheduleCreator;
  locked: boolean;
  nextRunAt?: string;
  lastFiring?: BotScheduleFiring;
  createdAt: string;
  updatedAt: string;
}

export interface BotScheduleInput {
  title: string;
  prompt: string;
  trigger: BotScheduleTrigger;
  enabled?: boolean;
  locked?: boolean;
}

export interface BotScheduleChange {
  title?: string;
  prompt?: string;
  trigger?: BotScheduleTrigger;
  enabled?: boolean;
  locked?: boolean;
}

export type BotScheduleErrorCode =
  | 'not-found'
  | 'invalid-input'
  | 'limit-reached'
  | 'locked'
  | 'inactive';

export class BotScheduleError extends Error {
  readonly code: BotScheduleErrorCode;

  constructor(code: BotScheduleErrorCode, message: string) {
    super(message);
    this.name = 'BotScheduleError';
    this.code = code;
  }
}

export interface BotScheduleStore {
  list(botSlug: string): BotSchedule[];
  create(
    botSlug: string,
    input: BotScheduleInput,
    creator: BotScheduleCreator,
    creatorHumanId?: string,
  ): BotSchedule;
  update(
    botSlug: string,
    id: string,
    change: BotScheduleChange,
    actor: BotScheduleCreator,
  ): BotSchedule;
  remove(botSlug: string, id: string, actor: BotScheduleCreator): boolean;
  history(botSlug: string, id: string): BotScheduleFiring[];
  runNow(botSlug: string, id: string): BotScheduleFiring;
  tick(): void;
  start(): void;
  close(): void;
}

interface StoredBase {
  id: string;
  title: string;
  prompt: string;
  scheduledAt: string;
}

type StoredRecord =
  | (StoredBase & { kind: 'every'; everySeconds: number })
  | (StoredBase & { kind: 'daily'; time: string; timeZone: string })
  | (StoredBase & { kind: 'weekly'; time: string; timeZone: string; weekdays: number[] })
  | (StoredBase & { kind: 'at'; local: { date: string; time: string; timeZone: string } })
  | (StoredBase & { kind: 'cron'; expression: string; timeZone: string });

interface ScheduleRow {
  schedule_id: string;
  bot_slug: string;
  record_json: string;
  enabled: number;
  creator: BotScheduleCreator;
  creator_human_id: string | null;
  locked: number;
  created_at: string;
  updated_at: string;
}

interface FiringRow {
  firing_id: string;
  schedule_id: string;
  trigger: 'planned' | 'manual';
  occurrence_at: string;
  fired_at: string;
  source_event_id: string | null;
  coalesced: number;
  skipped_reason: string | null;
  session_id: string | null;
  observed_at: string | null;
  handled_at: string | null;
  attempt_state: string | null;
}

export interface BotScheduleStoreOptions {
  database: OperationalDatabaseModulePort;
  isBotActive(botSlug: string): boolean;
  onAdmitted(botSlug: string, sourceEventId: string): void;
  onChanged?(botSlug: string): void;
  now?: () => Date;
  createId?: () => string;
  warn?: (message: string) => void;
}

const TOPICS = ['bot-schedules', 'source-event', 'bot-inbox'] as const;

function parseRecord(row: ScheduleRow): StoredRecord {
  return JSON.parse(row.record_json) as StoredRecord;
}

function triggerOf(record: StoredRecord): BotScheduleTrigger {
  switch (record.kind) {
    case 'every':
      return { kind: 'every', everySeconds: record.everySeconds };
    case 'daily':
      return { kind: 'daily', time: record.time.slice(0, 5), timeZone: record.timeZone };
    case 'weekly':
      return {
        kind: 'weekly',
        time: record.time.slice(0, 5),
        timeZone: record.timeZone,
        weekdays: [...record.weekdays],
      };
    case 'at':
      return { kind: 'once', ...record.local };
    case 'cron':
      return { kind: 'cron', expression: record.expression, timeZone: record.timeZone };
  }
}

function localTime(time: string): string {
  return /^\d{2}:\d{2}$/u.test(time) ? `${time}:00` : time;
}

function firingState(row: FiringRow): BotScheduleFiringState {
  if (row.skipped_reason !== null) return 'skipped';
  if (row.coalesced === 1) return 'coalesced';
  if (row.handled_at !== null || row.attempt_state === 'handled') return 'handled';
  if (row.observed_at !== null) return 'observed';
  return 'pending';
}

function firingView(row: FiringRow): BotScheduleFiring {
  return {
    id: row.firing_id,
    scheduleId: row.schedule_id,
    trigger: row.trigger,
    occurrenceAt: row.occurrence_at,
    firedAt: row.fired_at,
    state: firingState(row),
    ...(row.source_event_id === null ? {} : { sourceEventId: row.source_event_id }),
    ...(row.session_id === null ? {} : { sessionId: row.session_id }),
  };
}

const FIRING_COLUMNS = `
  f.firing_id, f.schedule_id, f.trigger, f.occurrence_at, f.fired_at, f.source_event_id,
  f.coalesced, f.skipped_reason, f.session_id,
  a.observed_at, a.handled_at, a.attempt_state`;
const FIRING_JOIN = `
  FROM bot_schedule_firings f
  LEFT JOIN inbox_admissions a
    ON a.source_event_id = f.source_event_id AND a.bot_slug = f.bot_slug`;

function normalizeText(value: string, name: string, max: number): string {
  const text = value.trim();
  if (text.length === 0) throw new BotScheduleError('invalid-input', `${name} must not be blank`);
  if (text.length > max)
    throw new BotScheduleError('invalid-input', `${name} must be at most ${max} characters`);
  return text;
}

function buildRecord(
  id: string,
  title: string,
  prompt: string,
  trigger: BotScheduleTrigger,
  now: number,
): StoredRecord {
  const scheduleId = ScheduleId(id);
  try {
    switch (trigger.kind) {
      case 'every':
        return {
          ...createEveryScheduleRecord(scheduleId, prompt, trigger.everySeconds, now, title),
        };
      case 'daily':
        return {
          ...createDailyScheduleRecord(
            scheduleId,
            prompt,
            { time: localTime(trigger.time), time_zone: trigger.timeZone },
            now,
            title,
          ),
        };
      case 'weekly': {
        const record = createWeeklyScheduleRecord(
          scheduleId,
          prompt,
          {
            time: localTime(trigger.time),
            time_zone: trigger.timeZone,
            weekdays: [...trigger.weekdays],
          },
          now,
          title,
        );
        return { ...record, weekdays: [...record.weekdays] };
      }
      case 'once':
        return {
          ...createAtScheduleRecord(
            scheduleId,
            prompt,
            { date: trigger.date, time: localTime(trigger.time), time_zone: trigger.timeZone },
            now,
            title,
          ),
          local: { date: trigger.date, time: trigger.time.slice(0, 5), timeZone: trigger.timeZone },
        };
      case 'cron':
        return {
          ...createCronScheduleRecord(
            scheduleId,
            prompt,
            { expression: trigger.expression, time_zone: trigger.timeZone },
            now,
            title,
          ),
        };
    }
  } catch (error) {
    if (error instanceof ScheduleInputError)
      throw new BotScheduleError('invalid-input', error.message);
    throw error;
  }
}

function sameTrigger(left: BotScheduleTrigger, right: BotScheduleTrigger): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function nextOccurrence(record: StoredRecord, at: number): string | undefined {
  if (record.kind === 'at') return undefined;
  return resolveRecurringOccurrence(record as Parameters<typeof resolveRecurringOccurrence>[0], at)
    .nextScheduledAt;
}

export function previewBotScheduleTrigger(
  trigger: BotScheduleTrigger,
  now: Date = new Date(),
  count = BOT_SCHEDULE_PREVIEW_COUNT,
): string[] {
  let record = buildRecord('preview', 'preview', 'preview', trigger, now.getTime());
  const occurrences = [record.scheduledAt];
  while (occurrences.length < count) {
    const next = nextOccurrence(record, Date.parse(record.scheduledAt));
    if (next === undefined) break;
    occurrences.push(next);
    record = { ...record, scheduledAt: next };
  }
  return occurrences;
}

export function relativeBotScheduleTrigger(
  minutes: number,
  timeZone: string,
  now: Date = new Date(),
): BotScheduleTrigger {
  if (!Number.isSafeInteger(minutes) || minutes < 1 || !Number.isSafeInteger(minutes * 60_000))
    throw new BotScheduleError('invalid-input', 'once_in_minutes must be a positive safe integer');
  const deadline = new Date(Math.ceil((now.getTime() + minutes * 60_000) / 60_000) * 60_000);
  if (!Number.isFinite(deadline.getTime()))
    throw new BotScheduleError('invalid-input', 'Relative reminder date is out of range');
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(deadline);
  } catch {
    throw new BotScheduleError('invalid-input', 'A valid IANA time_zone is required');
  }
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  const trigger: BotScheduleTrigger = {
    kind: 'once',
    date: [part('year'), part('month'), part('day')].join('-'),
    time: [part('hour'), part('minute')].join(':'),
    timeZone,
  };
  if (previewBotScheduleTrigger(trigger, now, 1)[0] !== deadline.toISOString())
    throw new BotScheduleError(
      'invalid-input',
      'Relative reminder falls in an ambiguous local time; choose an unambiguous later time',
    );
  return trigger;
}

export function createBotScheduleStore(options: BotScheduleStoreOptions): BotScheduleStore {
  const { database } = options;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? randomUUID;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let started = false;
  let closed = false;

  const write = <T>(command: (db: DatabaseSync) => T): T => {
    try {
      return database.transaction(command, TOPICS);
    } catch (error) {
      if (error instanceof Error && error.cause instanceof BotScheduleError) throw error.cause;
      throw error;
    }
  };

  const readRow = (db: DatabaseSync, botSlug: string, id: string): ScheduleRow => {
    const row = db
      .prepare('SELECT * FROM bot_schedules WHERE schedule_id = ? AND bot_slug = ?')
      .get(id, botSlug) as ScheduleRow | undefined;
    if (row === undefined) throw new BotScheduleError('not-found', `Bot Schedule ${id} not found`);
    return row;
  };

  const lastFiring = (db: DatabaseSync, id: string): BotScheduleFiring | undefined => {
    const row = db
      .prepare(
        `SELECT ${FIRING_COLUMNS} ${FIRING_JOIN} WHERE f.schedule_id = ?
          ORDER BY f.fired_at DESC, f.rowid DESC LIMIT 1`,
      )
      .get(id) as FiringRow | undefined;
    return row === undefined ? undefined : firingView(row);
  };

  const view = (db: DatabaseSync, row: ScheduleRow): BotSchedule => {
    const record = parseRecord(row);
    const last = lastFiring(db, row.schedule_id);
    return {
      id: row.schedule_id,
      botSlug: row.bot_slug,
      title: record.title,
      prompt: record.prompt,
      trigger: triggerOf(record),
      enabled: row.enabled === 1,
      creator: row.creator,
      locked: row.locked === 1,
      ...(row.enabled === 1 ? { nextRunAt: record.scheduledAt } : {}),
      ...(last === undefined ? {} : { lastFiring: last }),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  };

  const enabledCount = (db: DatabaseSync, botSlug: string, except?: string): number =>
    (
      db
        .prepare(
          'SELECT COUNT(*) AS count FROM bot_schedules WHERE bot_slug = ? AND enabled = 1 AND schedule_id != ?',
        )
        .get(botSlug, except ?? '') as { count: number }
    ).count;

  const requireCapacity = (db: DatabaseSync, botSlug: string, except?: string): void => {
    if (enabledCount(db, botSlug, except) >= BOT_SCHEDULE_ENABLED_LIMIT)
      throw new BotScheduleError(
        'limit-reached',
        `A PersonaBot can have at most ${BOT_SCHEDULE_ENABLED_LIMIT} enabled schedules`,
      );
  };

  const admitFiring = (
    db: DatabaseSync,
    row: ScheduleRow,
    record: StoredRecord,
    trigger: 'planned' | 'manual',
    occurrenceAt: string,
    at: string,
  ): { sourceEventId: string; coalesced: boolean } => {
    const payload = JSON.stringify({
      author: { kind: 'system' },
      schedule: {
        id: row.schedule_id,
        title: record.title,
        prompt: record.prompt,
        occurrenceAt,
        trigger,
        creator: row.creator,
      },
    });
    const pending = db
      .prepare(`
        SELECT f.source_event_id FROM bot_schedule_firings f
          JOIN source_events e ON e.source_event_id = f.source_event_id
          JOIN inbox_admissions a ON a.source_event_id = f.source_event_id AND a.bot_slug = f.bot_slug
         WHERE f.schedule_id = ? AND f.coalesced = 0 AND e.observed_at IS NULL
           AND a.observed_at IS NULL AND a.attempt_state IN ('pending', 'retryable')
         ORDER BY f.rowid DESC LIMIT 1
      `)
      .get(row.schedule_id) as { source_event_id: string } | undefined;
    const firingId = createId();
    if (pending !== undefined) {
      db.prepare(
        'UPDATE source_events SET body = ?, payload_json = ? WHERE source_event_id = ?',
      ).run(record.title, payload, pending.source_event_id);
      db.prepare(`
        INSERT INTO bot_schedule_firings
          (firing_id, schedule_id, bot_slug, trigger, occurrence_at, fired_at, source_event_id, coalesced)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `).run(
        firingId,
        row.schedule_id,
        row.bot_slug,
        trigger,
        occurrenceAt,
        at,
        pending.source_event_id,
      );
      return { sourceEventId: pending.source_event_id, coalesced: true };
    }
    const sourceEventId = createId();
    db.prepare(`
      INSERT INTO source_events (source_event_id, source_kind, bot_slug, body, created_at, payload_json, human_id)
      VALUES (?, 'schedule', ?, ?, ?, ?, ?)
    `).run(sourceEventId, row.bot_slug, record.title, at, payload, row.creator_human_id);
    db.prepare(`
      INSERT INTO inbox_admissions (source_event_id, bot_slug, reason, source_policy_wake_mode)
      VALUES (?, ?, 'schedule', 'immediate')
    `).run(sourceEventId, row.bot_slug);
    db.prepare(`
      INSERT INTO bot_schedule_firings
        (firing_id, schedule_id, bot_slug, trigger, occurrence_at, fired_at, source_event_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(firingId, row.schedule_id, row.bot_slug, trigger, occurrenceAt, at, sourceEventId);
    return { sourceEventId, coalesced: false };
  };

  const arm = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!started || closed) return;
    let next: string | null | undefined;
    try {
      next = database.read(
        (db) =>
          (
            db
              .prepare(
                "SELECT MIN(json_extract(record_json, '$.scheduledAt')) AS next FROM bot_schedules WHERE enabled = 1",
              )
              .get() as { next: string | null }
          ).next,
      );
    } catch (error) {
      options.warn?.(`bot-schedule-arm-failed error=${JSON.stringify(String(error))}`);
      return;
    }
    if (next === null || next === undefined) return;
    const delay = Math.min(MAX_TIMER_MS, Math.max(0, Date.parse(next) - now().getTime()));
    timer = setTimeout(() => {
      timer = undefined;
      tick();
    }, delay);
    timer.unref?.();
  };

  const tick = (): void => {
    if (closed) return;
    const at = now();
    const admitted: Array<{ botSlug: string; sourceEventId: string }> = [];
    const changed = new Set<string>();
    try {
      database.transaction((db) => {
        const due = db
          .prepare(
            "SELECT * FROM bot_schedules WHERE enabled = 1 AND json_extract(record_json, '$.scheduledAt') <= ? ORDER BY json_extract(record_json, '$.scheduledAt'), schedule_id",
          )
          .all(at.toISOString()) as unknown as ScheduleRow[];
        for (const row of due) {
          const record = parseRecord(row);
          const occurrence =
            record.kind === 'at'
              ? { occurrenceAt: record.scheduledAt, nextScheduledAt: undefined }
              : resolveRecurringOccurrence(
                  record as Parameters<typeof resolveRecurringOccurrence>[0],
                  at.getTime(),
                );
          const nextRecord: StoredRecord = {
            ...record,
            scheduledAt: occurrence.nextScheduledAt ?? record.scheduledAt,
          };
          db.prepare(
            'UPDATE bot_schedules SET record_json = ?, enabled = ? WHERE schedule_id = ?',
          ).run(
            JSON.stringify(nextRecord),
            occurrence.nextScheduledAt === undefined ? 0 : 1,
            row.schedule_id,
          );
          changed.add(row.bot_slug);
          const firedAt = at.toISOString();
          if (!options.isBotActive(row.bot_slug)) {
            db.prepare(`
              INSERT INTO bot_schedule_firings
                (firing_id, schedule_id, bot_slug, trigger, occurrence_at, fired_at, skipped_reason)
              VALUES (?, ?, ?, 'planned', ?, ?, 'inactive')
            `).run(createId(), row.schedule_id, row.bot_slug, occurrence.occurrenceAt, firedAt);
            continue;
          }
          const result = admitFiring(db, row, record, 'planned', occurrence.occurrenceAt, firedAt);
          if (!result.coalesced)
            admitted.push({ botSlug: row.bot_slug, sourceEventId: result.sourceEventId });
        }
      }, TOPICS);
    } catch (error) {
      options.warn?.(`bot-schedule-tick-failed error=${JSON.stringify(String(error))}`);
    }
    for (const slug of changed) options.onChanged?.(slug);
    for (const item of admitted) {
      try {
        options.onAdmitted(item.botSlug, item.sourceEventId);
      } catch (error) {
        options.warn?.(
          `bot-schedule-wake-failed bot=${item.botSlug} error=${JSON.stringify(String(error))}`,
        );
      }
    }
    arm();
  };

  const mutated = (botSlug: string): void => {
    options.onChanged?.(botSlug);
    arm();
  };

  return {
    list(botSlug) {
      return database.read((db) =>
        (
          db
            .prepare(
              'SELECT * FROM bot_schedules WHERE bot_slug = ? ORDER BY created_at, schedule_id',
            )
            .all(botSlug) as unknown as ScheduleRow[]
        ).map((row) => view(db, row)),
      );
    },

    create(botSlug, input, creator, creatorHumanId) {
      const title = normalizeText(input.title, 'title', 120);
      const prompt = normalizeText(input.prompt, 'prompt', 4000);
      const id = createId();
      const at = now();
      const record = buildRecord(id, title, prompt, input.trigger, at.getTime());
      const enabled = input.enabled ?? true;
      if (creator === 'personabot' && input.locked !== undefined)
        throw new BotScheduleError('locked', 'Only the Human can lock or unlock a Bot Schedule');
      const locked = input.locked === true;
      const created = write((db) => {
        if (enabled) requireCapacity(db, botSlug);
        db.prepare(`
          INSERT INTO bot_schedules
            (schedule_id, bot_slug, record_json, enabled, creator, locked, created_at, updated_at, creator_human_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          id,
          botSlug,
          JSON.stringify(record),
          enabled ? 1 : 0,
          creator,
          locked ? 1 : 0,
          at.toISOString(),
          at.toISOString(),
          creatorHumanId ?? null,
        );
        return view(db, readRow(db, botSlug, id));
      });
      mutated(botSlug);
      return created;
    },

    update(botSlug, id, change, actor) {
      const at = now();
      const updated = write((db) => {
        const row = readRow(db, botSlug, id);
        if (actor === 'personabot' && row.locked === 1)
          throw new BotScheduleError('locked', `Bot Schedule ${id} is locked by the Human`);
        if (actor === 'personabot' && change.locked !== undefined)
          throw new BotScheduleError('locked', 'Only the Human can lock or unlock a Bot Schedule');
        const record = parseRecord(row);
        const title =
          change.title === undefined ? record.title : normalizeText(change.title, 'title', 120);
        const prompt =
          change.prompt === undefined
            ? record.prompt
            : normalizeText(change.prompt, 'prompt', 4000);
        const trigger = change.trigger ?? triggerOf(record);
        const enabled = change.enabled ?? row.enabled === 1;
        const locked = change.locked ?? row.locked === 1;
        if (enabled && row.enabled === 0) requireCapacity(db, botSlug, id);
        const restart = (enabled && row.enabled === 0) || !sameTrigger(trigger, triggerOf(record));
        const next: StoredRecord = restart
          ? buildRecord(id, title, prompt, trigger, at.getTime())
          : { ...record, title, prompt };
        db.prepare(
          'UPDATE bot_schedules SET record_json = ?, enabled = ?, locked = ?, updated_at = ? WHERE schedule_id = ?',
        ).run(JSON.stringify(next), enabled ? 1 : 0, locked ? 1 : 0, at.toISOString(), id);
        return view(db, readRow(db, botSlug, id));
      });
      mutated(botSlug);
      return updated;
    },

    remove(botSlug, id, actor) {
      const removed = write((db) => {
        const row = db
          .prepare('SELECT locked FROM bot_schedules WHERE schedule_id = ? AND bot_slug = ?')
          .get(id, botSlug) as { locked: number } | undefined;
        if (row === undefined) return false;
        if (actor === 'personabot' && row.locked === 1)
          throw new BotScheduleError('locked', `Bot Schedule ${id} is locked by the Human`);
        db.prepare('DELETE FROM bot_schedule_firings WHERE schedule_id = ?').run(id);
        db.prepare('DELETE FROM bot_schedules WHERE schedule_id = ?').run(id);
        return true;
      });
      if (removed) mutated(botSlug);
      return removed;
    },

    history(botSlug, id) {
      return database.read((db) => {
        readRow(db, botSlug, id);
        return (
          db
            .prepare(
              `SELECT ${FIRING_COLUMNS} ${FIRING_JOIN} WHERE f.schedule_id = ?
                ORDER BY f.fired_at DESC, f.rowid DESC LIMIT ?`,
            )
            .all(id, BOT_SCHEDULE_HISTORY_LIMIT) as unknown as FiringRow[]
        ).map(firingView);
      });
    },

    runNow(botSlug, id) {
      if (!options.isBotActive(botSlug))
        throw new BotScheduleError('inactive', 'The PersonaBot is paused or unavailable');
      const at = now().toISOString();
      const result = write((db) => {
        const row = readRow(db, botSlug, id);
        const admitted = admitFiring(db, row, parseRecord(row), 'manual', at, at);
        const firing = db
          .prepare(
            `SELECT ${FIRING_COLUMNS} ${FIRING_JOIN} WHERE f.schedule_id = ?
              ORDER BY f.rowid DESC LIMIT 1`,
          )
          .get(id) as unknown as FiringRow;
        return { admitted, firing: firingView(firing) };
      });
      options.onChanged?.(botSlug);
      if (!result.admitted.coalesced) options.onAdmitted(botSlug, result.admitted.sourceEventId);
      return result.firing;
    },

    tick,

    start() {
      if (closed || started) return;
      started = true;
      tick();
    },

    close() {
      closed = true;
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    },
  };
}
