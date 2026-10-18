import { createHash, randomUUID } from 'node:crypto';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { isValidSlug } from '../bots/slug.js';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import {
  isGroupAvatar,
  LOCAL_HUMAN_ID,
  type ChannelRecord,
  type GroupInvitation,
  type GroupMemberWakePolicy,
} from './channel.js';
import type { ChannelStore } from './store.js';

export interface ChannelManagementCreateInput {
  name: string;
  members: string[];
}
export interface ChannelManagementInviteInput {
  channelId: string;
  botSlug: string;
  expectedChannel?: string;
}
export interface ChannelManagementEditInput {
  channelId: string;
  expectedChannel?: string;
}
export interface ChannelManagementRenameInput extends ChannelManagementEditInput {
  name: string;
}
export interface ChannelManagementAvatarInput extends ChannelManagementEditInput {
  avatar: string | null;
}
export interface ChannelManagementMemberInput extends ChannelManagementEditInput {
  botSlug: string;
}
export interface ChannelManagementWakeInput extends ChannelManagementMemberInput {
  mode: 'all' | 'mentions' | 'digest' | 'silent';
  count: number;
  intervalSeconds: number;
  inherit?: boolean;
}
export interface ChannelManagementCancelInviteInput extends ChannelManagementEditInput {
  invitationId: string;
}
export interface ChannelManagementDecideJoinInput extends ChannelManagementEditInput {
  requestId: string;
  accept: boolean;
}
export interface ChannelManagementReceipt {
  operationKey: string;
  kind: 'create' | 'invite';
  channelId: string;
  invitationId?: string;
  status: 'reserved' | 'completed';
}
export interface ChannelManagementSnapshot {
  channel: ChannelRecord;
  channelFingerprint: string;
  invitationPolicy: { autoAccept: boolean };
  wakePolicies: GroupMemberWakePolicy[];
}
export interface ChannelManagementResult extends ChannelManagementSnapshot {
  receipt?: ChannelManagementReceipt;
  invitation?: GroupInvitation;
}
export interface ChannelManagementService {
  snapshot(channelId: string): ChannelManagementSnapshot;
  wakePolicies(channelId: string): ChannelManagementSnapshot;
  rename(input: ChannelManagementRenameInput): ChannelManagementSnapshot;
  setAvatar(input: ChannelManagementAvatarInput): ChannelManagementSnapshot;
  setWake(input: ChannelManagementWakeInput): ChannelManagementSnapshot;
  removeMember(input: ChannelManagementMemberInput): ChannelManagementSnapshot;
  cancelInvite(input: ChannelManagementCancelInviteInput): ChannelManagementSnapshot;
  decideJoin(input: ChannelManagementDecideJoinInput): ChannelManagementSnapshot;
  create(input: ChannelManagementCreateInput, operationKey?: string): ChannelManagementResult;
  invite(input: ChannelManagementInviteInput, operationKey?: string): ChannelManagementResult;
  lookupCreate(
    operationKey: string,
    input: ChannelManagementCreateInput,
  ): ChannelManagementResult | undefined;
  lookupInvite(
    operationKey: string,
    input: ChannelManagementInviteInput,
  ): ChannelManagementResult | undefined;
}
export class ChannelManagementError extends Error {
  constructor(
    readonly code: string,
    message = code,
  ) {
    super(message);
    this.name = 'ChannelManagementError';
  }
}
interface TargetIdentity {
  slug: string;
  createdAt: string;
}
interface OperationRow {
  operation_key: string;
  kind: 'create' | 'invite';
  payload_hash: string;
  channel_id: string;
  invitation_id: string | null;
  targets_json: string;
  status: 'reserved' | 'completed';
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
function hash(value: unknown): string {
  return createHash('sha256')
    .update(JSON.stringify(canonical(value)))
    .digest('hex');
}
export function channelManagementFingerprint(
  channel: ChannelRecord,
  autoAccept = false,
  wakePolicies?: GroupMemberWakePolicy[],
): string {
  const { updatedAt: _updatedAt, avatar, ...state } = channel;
  return hash({
    ...state,
    ...(avatar === undefined ? {} : { avatarHash: hash(avatar) }),
    invitationPolicy: { autoAccept },
    ...(wakePolicies === undefined ? {} : { wakePolicies }),
  });
}
function key(value: string): void {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(value))
    throw new ChannelManagementError('invalid-operation-key');
}
function createInput(input: ChannelManagementCreateInput): void {
  if (
    Object.keys(input).some((field) => !['name', 'members'].includes(field)) ||
    typeof input.name !== 'string' ||
    !input.name.trim() ||
    input.name.length > 200 ||
    [...input.name].some(
      (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
    ) ||
    !Array.isArray(input.members) ||
    input.members.length > 100 ||
    new Set(input.members).size !== input.members.length ||
    !input.members.every((member) => typeof member === 'string' && isValidSlug(member))
  )
    throw new ChannelManagementError('invalid-input');
}
function inviteInput(input: ChannelManagementInviteInput): void {
  if (
    Object.keys(input).some(
      (field) => !['channelId', 'botSlug', 'expectedChannel'].includes(field),
    ) ||
    typeof input.channelId !== 'string' ||
    typeof input.botSlug !== 'string' ||
    !isValidSlug(input.botSlug) ||
    (input.expectedChannel !== undefined && !/^[a-f0-9]{64}$/u.test(input.expectedChannel))
  )
    throw new ChannelManagementError('invalid-input');
}
export function createChannelManagement(options: {
  database: OperationalDatabaseModulePort;
  channels: ChannelStore;
  registry: Pick<PersonaBotRegistry, 'get'>;
  isProtectedBot: (slug: string) => boolean;
  autoAcceptGroupInvitations?: () => boolean;
  onInvitation?: (dmChannelId: string, invitationId: string) => void;
  onJoinDecision?: (dmChannelId: string, requestId: string) => void;
}): ChannelManagementService {
  const { database, channels, registry } = options;
  const identity = (slug: string): TargetIdentity => {
    if (options.isProtectedBot(slug)) throw new ChannelManagementError('protected-bot');
    const bot = registry.get(slug);
    if (!bot) throw new ChannelManagementError('unknown-bot');
    if (bot.paused) throw new ChannelManagementError('archived-bot');
    return { slug: bot.slug, createdAt: bot.createdAt };
  };
  const assertTargets = (targets: TargetIdentity[]): void => {
    for (const target of targets)
      if (identity(target.slug).createdAt !== target.createdAt)
        throw new ChannelManagementError('channel-operation-unavailable');
  };
  const group = (id: string): ChannelRecord => {
    const record = channels.get(id);
    if (!record || record.deletedAt) throw new ChannelManagementError('unknown-channel');
    if (record.type !== 'group') throw new ChannelManagementError('not-group-channel');
    if (
      (record.ownerBotSlug !== undefined && options.isProtectedBot(record.ownerBotSlug)) ||
      record.members.some(options.isProtectedBot)
    )
      throw new ChannelManagementError('protected-bot');
    return record;
  };
  const snapshot = (id: string): ChannelManagementSnapshot => {
    const channel = group(id);
    const autoAccept = options.autoAcceptGroupInvitations?.() === true;
    const wakePolicies = channel.members.map((botSlug) => ({
      botSlug,
      inherited: channel.wakePolicies?.[botSlug] === undefined,
      policy: channels.getGroupWakePolicy(channel.id, botSlug),
    }));
    return {
      channel,
      channelFingerprint: channelManagementFingerprint(channel, autoAccept, wakePolicies),
      invitationPolicy: { autoAccept },
      wakePolicies,
    };
  };
  const humanSnapshot = (channelId: string): ChannelManagementSnapshot => {
    const result = snapshot(channelId);
    if (!channels.listHumanMembers(channelId).some((member) => member.humanId === LOCAL_HUMAN_ID))
      throw new ChannelManagementError('channel-access-denied');
    return result;
  };
  const edit = (input: ChannelManagementEditInput, fields: string[]) => {
    if (
      Object.keys(input).some(
        (field) => !['channelId', 'expectedChannel', ...fields].includes(field),
      ) ||
      typeof input.channelId !== 'string' ||
      !input.channelId.trim() ||
      (input.expectedChannel !== undefined && !/^[a-f0-9]{64}$/u.test(input.expectedChannel))
    )
      throw new ChannelManagementError('invalid-input');
    const before = humanSnapshot(input.channelId);
    if (input.expectedChannel !== undefined && before.channelFingerprint !== input.expectedChannel)
      throw new ChannelManagementError('stale-channel');
    return before;
  };
  const member = (channel: ChannelRecord, slug: string): void => {
    if (typeof slug !== 'string' || !isValidSlug(slug))
      throw new ChannelManagementError('invalid-input');
    if (options.isProtectedBot(slug)) throw new ChannelManagementError('protected-bot');
    if (!channel.members.includes(slug)) throw new ChannelManagementError('not-group-member');
    if (!registry.get(slug)) throw new ChannelManagementError('unknown-bot');
  };
  const current = (before: ChannelManagementSnapshot): void => {
    if (humanSnapshot(before.channel.id).channelFingerprint !== before.channelFingerprint)
      throw new ChannelManagementError('stale-channel');
  };
  const decisionTarget = (
    slug: string,
    createdAt: string,
    allowPaused = false,
    allowProtected = false,
  ) => {
    if (!allowProtected && options.isProtectedBot(slug))
      throw new ChannelManagementError('protected-bot');
    const record = registry.get(slug);
    if (!record) throw new ChannelManagementError('unknown-bot');
    if (record.createdAt !== createdAt) throw new ChannelManagementError('stale-profile');
    if (!allowPaused && record.paused) throw new ChannelManagementError('archived-bot');
    return record;
  };
  const decisionId = (value: unknown): void => {
    if (
      typeof value !== 'string' ||
      !value.trim() ||
      value !== value.trim() ||
      value.length > 512 ||
      [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new ChannelManagementError('invalid-input');
  };
  const read = (operationKey: string): OperationRow | undefined => {
    key(operationKey);
    return database.read(
      (db) =>
        db
          .prepare('SELECT * FROM channel_management_operations WHERE operation_key = ?')
          .get(operationKey) as OperationRow | undefined,
    );
  };
  const checked = (
    operationKey: string,
    kind: OperationRow['kind'],
    input: unknown,
  ): OperationRow | undefined => {
    const row = read(operationKey);
    if (row && (row.kind !== kind || row.payload_hash !== hash(input)))
      throw new ChannelManagementError('operation-key-conflict');
    if (row) {
      const targets = JSON.parse(row.targets_json) as TargetIdentity[];
      for (const target of targets)
        if (identity(target.slug).createdAt !== target.createdAt)
          throw new ChannelManagementError('channel-operation-unavailable');
    }
    return row;
  };
  const complete = (row: OperationRow): ChannelManagementResult | undefined => {
    const record = channels.get(row.channel_id);
    if (!record) {
      const exists = database.read((db) =>
        db.prepare('SELECT 1 FROM channel_records WHERE channel_id = ?').get(row.channel_id),
      );
      if (row.status === 'completed' || exists)
        throw new ChannelManagementError('channel-operation-unavailable');
      return undefined;
    }
    if (record.type !== 'group') throw new ChannelManagementError('channel-operation-unavailable');
    const invitation =
      row.kind === 'invite'
        ? record.invitations?.find((item) => item.id === row.invitation_id)
        : undefined;
    if (row.kind === 'invite' && !invitation) {
      if (row.status === 'completed')
        throw new ChannelManagementError('channel-operation-unavailable');
      return undefined;
    }
    return {
      ...snapshot(record.id),
      ...(invitation === undefined ? {} : { invitation }),
      receipt: {
        operationKey: row.operation_key,
        kind: row.kind,
        channelId: row.channel_id,
        ...(invitation === undefined ? {} : { invitationId: invitation.id }),
        status: 'completed',
      },
    };
  };
  const reserve = (
    operationKey: string,
    kind: OperationRow['kind'],
    input: unknown,
    channelId: string,
    targets: TargetIdentity[],
  ): OperationRow => {
    const row: OperationRow = {
      operation_key: operationKey,
      kind,
      payload_hash: hash(input),
      channel_id: channelId,
      invitation_id: kind === 'invite' ? 'group-invite-' + randomUUID() : null,
      targets_json: JSON.stringify(targets),
      status: 'reserved',
    };
    database.transaction((db) =>
      db
        .prepare(
          'INSERT INTO channel_management_operations (operation_key,kind,payload_hash,channel_id,invitation_id,targets_json,status) VALUES (?,?,?,?,?,?,?)',
        )
        .run(
          row.operation_key,
          row.kind,
          row.payload_hash,
          row.channel_id,
          row.invitation_id,
          row.targets_json,
          row.status,
        ),
    );
    return row;
  };
  const finish = (row: OperationRow, invitationId?: string): OperationRow => {
    const next = {
      ...row,
      status: 'completed' as const,
      invitation_id: invitationId ?? row.invitation_id,
    };
    database.transaction((db) =>
      db
        .prepare(
          'UPDATE channel_management_operations SET status = ?, invitation_id = ? WHERE operation_key = ?',
        )
        .run(next.status, next.invitation_id, row.operation_key),
    );
    return next;
  };
  return {
    snapshot,
    wakePolicies: humanSnapshot,
    rename(input) {
      if (
        typeof input.name !== 'string' ||
        !input.name.trim() ||
        input.name.length > 120 ||
        [...input.name].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
      )
        throw new ChannelManagementError('invalid-input');
      const before = edit(input, ['name']);
      current(before);
      if (!channels.rename(input.channelId, input.name.trim()))
        throw new ChannelManagementError('unknown-channel');
      return snapshot(input.channelId);
    },
    setAvatar(input) {
      if (input.avatar !== null && !isGroupAvatar(input.avatar))
        throw new ChannelManagementError('invalid-input');
      const before = edit(input, ['avatar']);
      current(before);
      channels.setGroupAvatar(input.channelId, input.avatar);
      return snapshot(input.channelId);
    },
    setWake(input) {
      if (
        !['all', 'mentions', 'digest', 'silent'].includes(input.mode) ||
        !Number.isSafeInteger(input.count) ||
        input.count < 1 ||
        input.count > 100 ||
        !Number.isSafeInteger(input.intervalSeconds) ||
        input.intervalSeconds < 1 ||
        input.intervalSeconds > 3600 ||
        (input.inherit !== undefined && typeof input.inherit !== 'boolean')
      )
        throw new ChannelManagementError('invalid-input');
      const before = edit(input, ['botSlug', 'mode', 'count', 'intervalSeconds', 'inherit']);
      member(before.channel, input.botSlug);
      const bot = registry.get(input.botSlug)!;
      if (bot.paused) throw new ChannelManagementError('archived-bot');
      current(before);
      channels.setGroupWakePolicy(
        input.channelId,
        input.botSlug,
        {
          mode: input.mode,
          count: input.count,
          intervalSeconds: input.intervalSeconds,
          ...(input.inherit === undefined ? {} : { inherit: input.inherit }),
        },
        { kind: 'human' },
      );
      return snapshot(input.channelId);
    },
    removeMember(input) {
      const before = edit(input, ['botSlug']);
      member(before.channel, input.botSlug);
      current(before);
      channels.removeGroupMember(input.channelId, input.botSlug);
      return snapshot(input.channelId);
    },
    cancelInvite(input) {
      decisionId(input.invitationId);
      const before = edit(input, ['invitationId']);
      const invitation = before.channel.invitations?.find((item) => item.id === input.invitationId);
      if (!invitation) throw new ChannelManagementError('unknown-invitation');
      if (invitation.status !== 'pending')
        throw new ChannelManagementError('invitation-not-pending');
      decisionTarget(invitation.targetBotSlug, invitation.targetBotCreatedAt, true);
      current(before);
      channels.cancelGroupInvite(input.channelId, input.invitationId);
      return snapshot(input.channelId);
    },
    decideJoin(input) {
      decisionId(input.requestId);
      if (typeof input.accept !== 'boolean') throw new ChannelManagementError('invalid-input');
      const before = edit(input, ['requestId', 'accept']);
      const request = before.channel.joinRequests?.find((item) => item.id === input.requestId);
      if (!request) throw new ChannelManagementError('unknown-join-request');
      if (input.accept && options.isProtectedBot(request.requesterBotSlug))
        throw new ChannelManagementError('protected-bot');
      if (request.status !== 'pending') {
        if (
          input.expectedChannel === undefined &&
          request.status === (input.accept ? 'accepted' : 'declined')
        )
          return before;
        throw new ChannelManagementError('join-request-not-pending');
      }
      if (before.channel.members.includes(request.requesterBotSlug))
        throw new ChannelManagementError('join-request-not-pending');
      const requester = decisionTarget(
        request.requesterBotSlug,
        request.requesterBotCreatedAt,
        false,
        !input.accept,
      );
      const dm = channels.getOrCreateDm(requester.slug, requester.displayName);
      if (!dm) throw new ChannelManagementError('channel-operation-unavailable');
      decisionTarget(request.requesterBotSlug, request.requesterBotCreatedAt, false, !input.accept);
      current(before);
      const decided = channels.decideGroupJoin({
        channelId: input.channelId,
        requestId: input.requestId,
        accept: input.accept,
        decidedBy: 'human',
        requesterBotCreatedAt: requester.createdAt,
        requesterDmChannelId: dm.id,
      });
      if (decided.notified) options.onJoinDecision?.(dm.id, request.id);
      return snapshot(input.channelId);
    },
    lookupCreate(operationKey, input) {
      createInput(input);
      const row = checked(operationKey, 'create', input);
      return row ? complete(row) : undefined;
    },
    lookupInvite(operationKey, input) {
      inviteInput(input);
      const row = checked(operationKey, 'invite', input);
      return row ? complete(row) : undefined;
    },
    create(input, operationKey) {
      createInput(input);
      let row = operationKey === undefined ? undefined : checked(operationKey, 'create', input);
      if (row) {
        const replay = complete(row);
        if (replay) return replay;
      }
      const targets = input.members.map(identity);
      if (operationKey !== undefined && !row)
        row = reserve(operationKey, 'create', input, 'group-' + randomUUID(), targets);
      assertTargets(targets);
      const channel = channels.createGroup({
        ...input,
        ...(row === undefined ? {} : { id: row.channel_id }),
      });
      if (!row) return snapshot(channel.id);
      return complete(finish(row))!;
    },
    invite(input, operationKey) {
      inviteInput(input);
      let row = operationKey === undefined ? undefined : checked(operationKey, 'invite', input);
      if (row) {
        const replay = complete(row);
        if (replay) return replay;
      }
      const target = identity(input.botSlug);
      const before = snapshot(input.channelId);
      if (
        input.expectedChannel !== undefined &&
        input.expectedChannel !== before.channelFingerprint
      )
        throw new ChannelManagementError('stale-channel');
      if (operationKey !== undefined && !row)
        row = reserve(operationKey, 'invite', input, input.channelId, [target]);
      const bot = registry.get(input.botSlug)!;
      const dm = channels.getOrCreateDm(bot.slug, bot.displayName);
      if (!dm) throw new ChannelManagementError('group-invite-unavailable');
      assertTargets([target]);
      if (snapshot(input.channelId).channelFingerprint !== before.channelFingerprint)
        throw new ChannelManagementError('stale-channel');
      let invitation: GroupInvitation;
      try {
        invitation = channels.inviteGroupBot({
          channelId: input.channelId,
          inviterHuman: true,
          targetBotSlug: target.slug,
          targetBotCreatedAt: target.createdAt,
          targetDmChannelId: dm.id,
          ...(row === undefined ? {} : { invitationId: row.invitation_id! }),
        });
      } catch (error) {
        if (error instanceof ChannelManagementError) throw error;
        throw new ChannelManagementError(
          'group-invite-unavailable',
          error instanceof Error ? error.message : 'Group invitation unavailable',
        );
      }
      const result = row
        ? complete(finish(row, invitation.id))!
        : { ...snapshot(input.channelId), invitation };
      if (!before.channel.invitations?.some((item) => item.id === invitation.id))
        options.onInvitation?.(dm.id, invitation.id);
      return result;
    },
  };
}
