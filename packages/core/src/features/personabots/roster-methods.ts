import {
  invalidInput,
  unavailable,
  unknownChannel,
  type BridgeResult,
} from '../../bridge/method-utils.js';
import { type HumanContext } from '../../humans/context.js';
import { z } from 'zod';
import {
  MAX_ROSTER_BATCH_SIZE,
  RosterUnavailableError,
  RosterUnknownSectionError,
  type RosterSection,
  type RosterSnapshot,
} from '../../roster/store.js';
import type { TopOrderEntry } from '../../roster/spec.js';
import type { BridgeMethodsDeps } from '../../bridge/methods.js';
function unknownSection(sectionId: string): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'not-found',
      message: `unknown Channel section: ${sectionId}`,
    },
  };
}

const sectionCreatePayload = z.object({ name: z.string() });

const sectionRenamePayload = z.object({
  sectionId: z.string().min(1),
  name: z.string(),
});

const sectionRemovePayload = z.object({ sectionId: z.string().min(1) });

const channelAssignPayload = z.object({
  channelId: z.string().min(1),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
  index: z.number().int().min(0).optional(),
});

const sectionReorderPayload = z.object({ order: z.array(z.string()) });

const topReorderPayload = z.object({
  order: z.array(z.object({ kind: z.enum(['section', 'channel']), id: z.string().min(1) })),
});

const pinsSetPayload = z.object({ pins: z.array(z.string()) });

const hiddenSetPayload = z.object({ hidden: z.array(z.string()) });

const channelMuteSetPayload = z.object({
  channelId: z.string().trim().min(1),
  muted: z.boolean(),
});

const rosterBatchPayload = z.object({
  action: z.enum(['pin', 'unpin', 'hide', 'move']),
  channelIds: z
    .array(z.string().min(1))
    .min(1)
    .max(MAX_ROSTER_BATCH_SIZE)
    .refine((ids) => new Set(ids).size === ids.length),
  sectionId: z.union([z.string().min(1), z.null()]).optional(),
});

export interface RosterBridgeMethods {
  rosterGet(payload: unknown): BridgeResult<RosterSnapshot>;
  sectionCreate(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRename(payload: unknown): Promise<BridgeResult<{ section: RosterSection }>>;
  sectionRemove(payload: unknown): Promise<BridgeResult<{ removed: boolean }>>;
  channelAssign(payload: unknown): Promise<BridgeResult<Record<string, never>>>;
  sectionReorder(payload: unknown): Promise<BridgeResult<{ sectionOrder: string[] }>>;
  topReorder(payload: unknown): Promise<BridgeResult<{ topOrder: TopOrderEntry[] }>>;
  pinsSet(payload: unknown): Promise<BridgeResult<{ pins: string[] }>>;
  hiddenSet(payload: unknown): Promise<BridgeResult<{ hidden: string[] }>>;
  channelMuteSet(payload: unknown): Promise<BridgeResult<{ muted: string[] }>>;
  rosterBatch(payload: unknown): Promise<BridgeResult<RosterSnapshot>>;
}

export function createRosterBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
): RosterBridgeMethods {
  const rosterWrite = async <T>(operation: () => Promise<T>): Promise<BridgeResult<T>> => {
    try {
      return { ok: true, value: await operation() };
    } catch (error) {
      if (error instanceof RosterUnavailableError) return unavailable();
      if (error instanceof RosterUnknownSectionError) return unknownSection(error.sectionId);
      throw error;
    }
  };
  return {
    rosterGet() {
      try {
        return { ok: true, value: deps.roster.snapshot() };
      } catch (error) {
        if (error instanceof RosterUnavailableError) return unavailable();
        throw error;
      }
    },
    async sectionCreate(payload) {
      const parsed = sectionCreatePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionCreate payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({
        section: await deps.roster.sectionCreate(name),
      }));
    },
    async sectionRename(payload) {
      const parsed = sectionRenamePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRename payload');
      const name = parsed.data.name.trim();
      if (name.length === 0) return invalidInput('name is required');
      return rosterWrite(async () => ({
        section: await deps.roster.sectionRename(parsed.data.sectionId, name),
      }));
    },
    async sectionRemove(payload) {
      const parsed = sectionRemovePayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionRemove payload');
      return rosterWrite(async () => ({
        removed: await deps.roster.sectionRemove(parsed.data.sectionId),
      }));
    },
    async channelAssign(payload) {
      const parsed = channelAssignPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid channelAssign payload');
      const { channelId, index } = parsed.data;
      const sectionId = parsed.data.sectionId ?? undefined;
      return rosterWrite(async () => {
        await deps.roster.channelAssign(channelId, sectionId, index);
        return {};
      });
    },
    async sectionReorder(payload) {
      const parsed = sectionReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid sectionReorder payload');
      return rosterWrite(async () => ({
        sectionOrder: await deps.roster.sectionReorder(parsed.data.order),
      }));
    },
    async topReorder(payload) {
      const parsed = topReorderPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid topReorder payload');
      return rosterWrite(async () => ({
        topOrder: await deps.roster.topReorder(parsed.data.order),
      }));
    },
    async pinsSet(payload) {
      const parsed = pinsSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid pinsSet payload');
      return rosterWrite(async () => ({
        pins: await deps.roster.pinsSet(parsed.data.pins),
      }));
    },
    async hiddenSet(payload) {
      const parsed = hiddenSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('invalid hiddenSet payload');
      return rosterWrite(async () => ({
        hidden: await deps.roster.hiddenSet(parsed.data.hidden),
      }));
    },
    async channelMuteSet(payload) {
      const parsed = channelMuteSetPayload.safeParse(payload);
      if (!parsed.success) return invalidInput('channelId and a boolean muted are required');
      const { channelId, muted } = parsed.data;
      if (muted && deps.channels.get(channelId) === undefined) return unknownChannel(channelId);
      return rosterWrite(async () => ({
        muted: await deps.roster.mutedSet(channelId, muted),
      }));
    },
    async rosterBatch(payload) {
      const parsed = rosterBatchPayload.safeParse(payload);
      if (!parsed.success) {
        return invalidInput(`rosterBatch requires 1–${MAX_ROSTER_BATCH_SIZE} distinct channel ids`);
      }
      const { action, channelIds, sectionId } = parsed.data;
      if (action !== 'move' && sectionId !== undefined) {
        return invalidInput('sectionId is only valid for a rosterBatch move');
      }
      const channels = deps.channels
        .list()
        .filter((channel) => !deps.team || deps.team.channelAccess.canRead(human, channel.id));
      const known = new Set([
        ...channels.map((channel) => channel.id),
        ...deps.registry.list().map((bot) => bot.slug),
        ...(deps.team?.bots.reachable(human).map((bot) => bot.slug) ?? []),
        ...channels.flatMap((channel) =>
          channel.type === 'dm' && channel.botSlug !== undefined ? [channel.botSlug] : [],
        ),
      ]);
      if (channelIds.some((id) => !known.has(id))) {
        return invalidInput('rosterBatch contains an unknown Channel');
      }
      const aliases = new Map(
        channels.flatMap((channel) =>
          channel.type === 'dm' && channel.botSlug !== undefined
            ? [[channel.botSlug, channel.id] as const]
            : [],
        ),
      );
      const change =
        action === 'move'
          ? { action, channelIds, ...(sectionId == null ? {} : { sectionId }) }
          : { action, channelIds };
      return rosterWrite(() => deps.roster.applyBatch(change, (pin) => aliases.get(pin) ?? pin));
    },
  };
}
