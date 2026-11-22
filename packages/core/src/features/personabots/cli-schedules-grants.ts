import {
  BotScheduleError,
  createBotScheduleStore,
  previewBotScheduleTrigger,
  type BotSchedule,
  type BotScheduleFiring,
  type BotScheduleTrigger,
} from '../../schedules/bot-schedules.js';
import { WorkspaceGrantError, type WorkspaceGrant } from '../../workspaces/grants.js';
import { WorkspaceSpaces } from '../../workspaces/spaces.js';
import { TeamRoles } from '../../team/roles.js';
import { createGrants } from '../workspaces/plugin.js';
import { attachOperationalModule, type OperationalDatabaseOwner } from '../../database/owner.js';
import type { PersonaBotRegistry } from '../../bots/registry.js';
import { scheduleToggleFromFlags, scheduleTriggerFromFlags } from '../../bots/cli-schedules.js';
import type { BotCreateCliIo, CreateValues } from './cli-types.js';
import { CliFailure, usageError } from './cli-errors.js';
import { trimmed, resolveHome, openRegistry, requireBotRecord } from './cli-offline.js';
import { memoryBot } from './cli-memory.js';

function openSchedules(owner: OperationalDatabaseOwner, registry: PersonaBotRegistry) {
  return createBotScheduleStore({
    database: attachOperationalModule(owner, 'bot-schedules'),
    isBotActive: (botSlug) => {
      const bot = registry.get(botSlug);
      return bot !== undefined && bot.paused !== true;
    },
    onAdmitted: () => {},
  });
}

function openGrants(owner: OperationalDatabaseOwner, dshHome: string) {
  const roles = new TeamRoles(attachOperationalModule(owner, 'team'), () => {});
  const spaces = new WorkspaceSpaces(
    attachOperationalModule(owner, 'workspace-spaces'),
    dshHome,
    roles,
    undefined,
    false,
  );
  return createGrants(owner, spaces, {});
}

function scheduleFailure(error: unknown): never {
  if (error instanceof BotScheduleError) {
    if (error.code === 'not-found') {
      throw new CliFailure('unknown-schedule', error.message, 1);
    }
    throw new CliFailure(error.code, error.message, 1);
  }
  throw error;
}

function grantFailure(error: unknown): never {
  if (error instanceof WorkspaceGrantError) {
    throw new CliFailure(error.code, error.message, 1);
  }
  throw error;
}

export function runGrants(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grants: WorkspaceGrant[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grants needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    return {
      bot: memoryBot(record),
      grants: openGrants(owner, dshHome).list(record.slug),
    };
  } finally {
    owner.close();
  }
}

export function runGrantRevoke(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grant: WorkspaceGrant } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grant-revoke needs exactly one bot id.');
  const grantId = trimmed(values.grant);
  if (grantId === undefined) throw usageError('--grant is required for grant-revoke.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const grant = openGrants(owner, dshHome).revoke(record.slug, grantId);
      io.stderr(`tobs: revoked grant ${grantId} for ${record.slug}`);
      return { bot: memoryBot(record), grant };
    } catch (error) {
      grantFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runGrantWriteSet(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; grant: WorkspaceGrant } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('grant-write-set needs exactly one bot id.');
  const grantId = trimmed(values.grant);
  if (grantId === undefined) throw usageError('--grant is required for grant-write-set.');
  const enabled = values.enabled === true;
  const disabled = values.disabled === true;
  if (enabled === disabled) {
    throw usageError('grant-write-set needs --enabled or --disabled, not both or neither.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const grant = openGrants(owner, dshHome).setOrchestratorWrite(record.slug, grantId, enabled);
      io.stderr(`tobs: set orchestrator write ${enabled ? 'on' : 'off'} for grant ${grantId}`);
      return { bot: memoryBot(record), grant };
    } catch (error) {
      grantFailure(error);
    }
  } finally {
    owner.close();
  }
}

function parseTrigger(values: CreateValues): BotScheduleTrigger | undefined {
  return scheduleTriggerFromFlags(values, usageError);
}

function enabledFlag(
  values: CreateValues,
  on: 'enabled' | 'locked',
  off: 'disabled' | 'unlocked',
): boolean | undefined {
  return scheduleToggleFromFlags(values, on, off, usageError);
}

export function runSchedules(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedules: BotSchedule[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedules needs exactly one bot id.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    return {
      bot: memoryBot(record),
      schedules: openSchedules(owner, registry).list(record.slug),
    };
  } finally {
    owner.close();
  }
}

export function runScheduleCreate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedule: BotSchedule } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-create needs exactly one bot id.');
  const title = trimmed(values.title);
  const prompt = trimmed(values.prompt);
  if (title === undefined || prompt === undefined) {
    throw usageError('--title and --prompt are required for schedule-create.');
  }
  const trigger = parseTrigger(values);
  if (trigger === undefined) throw usageError('schedule-create needs a trigger flag.');
  const enabled = enabledFlag(values, 'enabled', 'disabled');
  const locked = enabledFlag(values, 'locked', 'unlocked');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const schedule = openSchedules(owner, registry).create(
        record.slug,
        {
          title,
          prompt,
          trigger,
          ...(enabled === undefined ? {} : { enabled }),
          ...(locked === undefined ? {} : { locked }),
        },
        'human',
      );
      io.stderr(`tobs: created schedule ${schedule.id} for ${record.slug}`);
      return { bot: memoryBot(record), schedule };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runScheduleUpdate(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; schedule: BotSchedule } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-update needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-update.');
  const title = trimmed(values.title);
  const prompt = trimmed(values.prompt);
  const trigger = parseTrigger(values);
  const enabled = enabledFlag(values, 'enabled', 'disabled');
  const locked = enabledFlag(values, 'locked', 'unlocked');
  if (
    title === undefined &&
    prompt === undefined &&
    trigger === undefined &&
    enabled === undefined &&
    locked === undefined
  ) {
    throw usageError('schedule-update needs at least one change flag.');
  }
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const schedule = openSchedules(owner, registry).update(
        record.slug,
        scheduleId,
        {
          ...(title === undefined ? {} : { title }),
          ...(prompt === undefined ? {} : { prompt }),
          ...(trigger === undefined ? {} : { trigger }),
          ...(enabled === undefined ? {} : { enabled }),
          ...(locked === undefined ? {} : { locked }),
        },
        'human',
      );
      io.stderr(`tobs: updated schedule ${scheduleId} for ${record.slug}`);
      return { bot: memoryBot(record), schedule };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runScheduleDelete(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; removed: boolean } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-delete needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-delete.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const removed = openSchedules(owner, registry).remove(record.slug, scheduleId, 'human');
      io.stderr(`tobs: deleted schedule ${scheduleId} for ${record.slug}`);
      return { bot: memoryBot(record), removed };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runScheduleHistory(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; firings: BotScheduleFiring[] } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-history needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-history.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      return {
        bot: memoryBot(record),
        firings: openSchedules(owner, registry).history(record.slug, scheduleId),
      };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runScheduleRunNow(
  id: string,
  values: CreateValues,
  io: BotCreateCliIo,
): { bot: { id: string; name: string }; firing: BotScheduleFiring } {
  const slug = id.trim();
  if (slug.length === 0) throw usageError('schedule-run-now needs exactly one bot id.');
  const scheduleId = trimmed(values.sid);
  if (scheduleId === undefined) throw usageError('--sid is required for schedule-run-now.');
  const dshHome = resolveHome(values, io);
  const { owner, registry } = openRegistry(dshHome);
  try {
    const record = requireBotRecord(registry, slug);
    try {
      const firing = openSchedules(owner, registry).runNow(record.slug, scheduleId);
      io.stderr(`tobs: recorded a manual firing for schedule ${scheduleId}; the Host executes it`);
      return { bot: memoryBot(record), firing };
    } catch (error) {
      scheduleFailure(error);
    }
  } finally {
    owner.close();
  }
}

export function runSchedulePreview(values: CreateValues): {
  trigger: BotScheduleTrigger;
  occurrences: string[];
} {
  const trigger = parseTrigger(values);
  if (trigger === undefined) throw usageError('schedule-preview needs a trigger flag.');
  try {
    return { trigger, occurrences: previewBotScheduleTrigger(trigger) };
  } catch (error) {
    if (error instanceof BotScheduleError) {
      throw new CliFailure(error.code, error.message, 1);
    }
    throw error;
  }
}
