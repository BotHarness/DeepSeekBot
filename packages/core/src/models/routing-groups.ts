import { randomUUID } from 'node:crypto';

import {
  isRoutingGroupEngineMember,
  type RoutingGroupEngineMember,
} from '@botharness/host-protocol/subscription-engine';

import { attachOperationalModule, type OperationalDatabaseOwner } from '../database/owner.js';
import { isModelRoute, type ModelRoute } from './presets.js';

export const ROUTING_GROUP_MEMBERS_MAX = 20;
export const ROUTING_GROUP_DEPTH_MAX = 8;

export type ModelChoice =
  | { kind: 'model'; provider: string; model: string; reasoningEffort?: string }
  | { kind: 'group'; id: string };

export type RoutingGroupMember = ModelChoice | RoutingGroupEngineMember;
export type RoutingTarget = { kind: 'route'; route: ModelRoute } | RoutingGroupEngineMember;

export const ROUTING_GROUP_MEMBER_SHAPES =
  '{kind:"model",provider,model,reasoningEffort?}, {kind:"group",id} or {kind:"engine",engine,model?,reasoningEffort?}';

export interface RoutingGroup {
  id: string;
  name: string;
  revision: number;
  mode: 'order';
  members: RoutingGroupMember[];
  createdAt: string;
  updatedAt: string;
}

export class RoutingGroupError extends Error {
  constructor(
    readonly code:
      | 'invalid-input'
      | 'name-conflict'
      | 'not-found'
      | 'stale-revision'
      | 'empty-group'
      | 'unknown-member'
      | 'cycle'
      | 'too-deep'
      | 'in-use',
    message: string,
    readonly references: string[] = [],
  ) {
    super(message);
  }
}

export interface RoutingGroupInput {
  name: string;
  members: RoutingGroupMember[];
}

export interface RoutingGroupStore {
  list(): RoutingGroup[];
  get(id: string): RoutingGroup | undefined;
  create(input: RoutingGroupInput): RoutingGroup;
  update(id: string, input: RoutingGroupInput & { expectedRevision: number }): RoutingGroup;
  delete(id: string, expectedRevision: number): RoutingGroup;
  routes(id: string): ModelRoute[];
  targets(id: string): RoutingTarget[];
  defaultGroup(): RoutingGroupDefault;
  setDefaultGroup(
    groupId: string | undefined,
    expectedRevision: number,
    effort?: string,
  ): RoutingGroupDefault;
}

export interface RoutingGroupDefault {
  groupId?: string;
  effort?: string;
  revision: number;
}

export function isRoutingGroupMember(value: unknown): value is RoutingGroupMember {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  if (member['kind'] === 'group')
    return (
      Object.keys(member).every((key) => key === 'kind' || key === 'id') &&
      typeof member['id'] === 'string' &&
      member['id'].trim().length > 0
    );
  if (member['kind'] === 'engine') return isRoutingGroupEngineMember(member);
  if (member['kind'] !== 'model') return false;
  const { kind: _kind, ...route } = member;
  return (
    Object.keys(route).every((key) => ['provider', 'model', 'reasoningEffort'].includes(key)) &&
    isModelRoute(route)
  );
}

function isRoutingGroup(value: unknown): value is RoutingGroup {
  if (typeof value !== 'object' || value === null) return false;
  const group = value as Record<string, unknown>;
  return (
    typeof group['id'] === 'string' &&
    typeof group['name'] === 'string' &&
    Number.isSafeInteger(group['revision']) &&
    group['mode'] === 'order' &&
    Array.isArray(group['members']) &&
    group['members'].every(isRoutingGroupMember) &&
    typeof group['createdAt'] === 'string' &&
    typeof group['updatedAt'] === 'string'
  );
}

function memberRecord(member: RoutingGroupMember): RoutingGroupMember {
  if (member.kind === 'group') return { kind: 'group', id: member.id.trim() };
  if (member.kind === 'engine')
    return {
      kind: 'engine',
      engine: member.engine,
      ...(member.model === undefined ? {} : { model: member.model.trim() }),
      ...(member.reasoningEffort === undefined
        ? {}
        : { reasoningEffort: member.reasoningEffort.trim() }),
    };
  return {
    kind: 'model',
    provider: member.provider.trim(),
    model: member.model.trim(),
    ...(member.reasoningEffort === undefined
      ? {}
      : { reasoningEffort: member.reasoningEffort.trim() }),
  };
}

export function memberLabel(member: RoutingGroupMember): string {
  if (member.kind === 'engine')
    return member.model === undefined
      ? member.engine
      : `${member.engine}/${member.model}${member.reasoningEffort ? ` (${member.reasoningEffort})` : ''}`;
  return member.kind === 'group'
    ? `group ${member.id}`
    : `${member.provider}/${member.model}${member.reasoningEffort ? ` (${member.reasoningEffort})` : ''}`;
}

export function expandRoutingGroup(
  id: string,
  groups: ReadonlyMap<string, Pick<RoutingGroup, 'id' | 'name' | 'members'>>,
): ModelRoute[] {
  return expandRoutingTargets(id, groups).flatMap((target) =>
    target.kind === 'route' ? [target.route] : [],
  );
}

export function expandRoutingTargets(
  id: string,
  groups: ReadonlyMap<string, Pick<RoutingGroup, 'id' | 'name' | 'members'>>,
): RoutingTarget[] {
  const targets: RoutingTarget[] = [];
  const seen = new Set<string>();
  const visit = (groupId: string, path: string[]): void => {
    const group = groups.get(groupId);
    if (group === undefined)
      throw new RoutingGroupError('unknown-member', `Routing Group ${groupId} does not exist`);
    if (path.includes(groupId))
      throw new RoutingGroupError(
        'cycle',
        `Routing Group ${[...path, groupId].map((entry) => groups.get(entry)?.name ?? entry).join(' → ')} would contain itself`,
      );
    if (path.length >= ROUTING_GROUP_DEPTH_MAX)
      throw new RoutingGroupError(
        'too-deep',
        `Routing Groups nest at most ${ROUTING_GROUP_DEPTH_MAX} levels deep`,
      );
    for (const member of group.members) {
      if (member.kind === 'group') {
        visit(member.id, [...path, groupId]);
        continue;
      }
      const key = JSON.stringify(
        member.kind === 'engine'
          ? [member.kind, member.engine, member.model]
          : [member.kind, member.provider, member.model, member.reasoningEffort],
      );
      if (seen.has(key)) continue;
      seen.add(key);
      if (member.kind === 'engine') targets.push(member);
      else {
        const { kind: _kind, ...route } = member;
        targets.push({ kind: 'route', route });
      }
    }
  };
  visit(id, []);
  return targets;
}

export interface RoutingGroupStoreOptions {
  database: OperationalDatabaseOwner;
  now?: () => Date;
  references?: (groupId: string) => string[];
}

export function createRoutingGroupStore(options: RoutingGroupStoreOptions): RoutingGroupStore {
  const now = options.now ?? (() => new Date());
  const port = attachOperationalModule(options.database, 'routing-groups');
  const read = (): RoutingGroup[] =>
    port.read((database) =>
      database
        .prepare('SELECT body FROM routing_groups ORDER BY rowid')
        .all()
        .map((row) => {
          const parsed: unknown = JSON.parse(String(row['body']));
          if (!isRoutingGroup(parsed)) throw new Error('Invalid Routing Group record');
          return parsed;
        }),
    );
  const byId = (groups: RoutingGroup[]) => new Map(groups.map((group) => [group.id, group]));
  const checked = (
    groups: RoutingGroup[],
    id: string,
    input: RoutingGroupInput,
  ): { name: string; members: RoutingGroupMember[] } => {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (name.length === 0 || name.length > 100 || [...name].some((char) => char < ' '))
      throw new RoutingGroupError(
        'invalid-input',
        'A Routing Group name of 1 to 100 characters is required',
      );
    if (groups.some((group) => group.id !== id && group.name.toLowerCase() === name.toLowerCase()))
      throw new RoutingGroupError('name-conflict', `Routing Group ${name} already exists`);
    if (!Array.isArray(input.members) || !input.members.every(isRoutingGroupMember))
      throw new RoutingGroupError(
        'invalid-input',
        `Each member must match one of these shapes: ${ROUTING_GROUP_MEMBER_SHAPES}`,
      );
    if (input.members.length === 0)
      throw new RoutingGroupError('empty-group', 'A Routing Group needs at least one member');
    if (input.members.length > ROUTING_GROUP_MEMBERS_MAX)
      throw new RoutingGroupError(
        'invalid-input',
        `A Routing Group has at most ${ROUTING_GROUP_MEMBERS_MAX} members`,
      );
    const members = input.members.map(memberRecord);
    const keys = members.map((member) => JSON.stringify(member));
    if (new Set(keys).size !== keys.length)
      throw new RoutingGroupError('invalid-input', 'Routing Group members must be unique');
    const draft = byId(groups);
    draft.set(id, {
      id,
      name,
      members,
      revision: 0,
      mode: 'order',
      createdAt: '',
      updatedAt: '',
    });
    for (const group of draft.values()) {
      if (expandRoutingGroup(group.id, draft).length === 0)
        throw new RoutingGroupError(
          'empty-group',
          `Routing Group ${group.name} would have no model to run on`,
        );
    }
    return { name, members };
  };
  const write = (group: RoutingGroup): void => {
    port.transaction(
      (database) => {
        database
          .prepare(
            `INSERT INTO routing_groups (id, body) VALUES (?, ?)
            ON CONFLICT (id) DO UPDATE SET body = excluded.body`,
          )
          .run(group.id, JSON.stringify(group));
      },
      ['routing-groups'],
    );
  };
  const current = (groups: RoutingGroup[], id: string, expectedRevision: number) => {
    const group = groups.find((entry) => entry.id === id);
    if (group === undefined)
      throw new RoutingGroupError('not-found', `Routing Group ${id} does not exist`);
    if (group.revision !== expectedRevision)
      throw new RoutingGroupError(
        'stale-revision',
        `Routing Group ${group.name} changed (revision ${group.revision}); read it again before saving`,
      );
    return group;
  };
  const readDefault = (): RoutingGroupDefault =>
    port.read((database) => {
      const row = database
        .prepare('SELECT group_id, effort, revision FROM routing_group_default WHERE singleton = 1')
        .get();
      if (row === undefined) return { revision: 0 };
      return {
        ...(typeof row['group_id'] === 'string' ? { groupId: row['group_id'] } : {}),
        ...(typeof row['group_id'] === 'string' && typeof row['effort'] === 'string'
          ? { effort: row['effort'] }
          : {}),
        revision: Number(row['revision']),
      };
    });
  return {
    list: read,
    get: (id) => read().find((group) => group.id === id),
    defaultGroup: readDefault,
    setDefaultGroup(groupId, expectedRevision, effort) {
      const existing = readDefault();
      if (existing.revision !== expectedRevision)
        throw new RoutingGroupError(
          'stale-revision',
          `The default model changed (revision ${existing.revision}); read it again before saving`,
        );
      if (groupId !== undefined && !read().some((group) => group.id === groupId))
        throw new RoutingGroupError('not-found', `Routing Group ${groupId} does not exist`);
      const kept = groupId === undefined || !effort?.trim() ? undefined : effort.trim();
      const next: RoutingGroupDefault = {
        ...(groupId === undefined ? {} : { groupId }),
        ...(kept === undefined ? {} : { effort: kept }),
        revision: existing.revision + 1,
      };
      port.transaction(
        (database) => {
          database
            .prepare(
              `INSERT INTO routing_group_default (singleton, group_id, effort, revision) VALUES (1, ?, ?, ?)
              ON CONFLICT (singleton) DO UPDATE SET group_id = excluded.group_id, effort = excluded.effort, revision = excluded.revision`,
            )
            .run(groupId ?? null, kept ?? null, next.revision);
        },
        ['routing-groups'],
      );
      return next;
    },
    create(input) {
      const groups = read();
      const id = randomUUID();
      const { name, members } = checked(groups, id, input);
      const at = now().toISOString();
      const group: RoutingGroup = {
        id,
        name,
        revision: 1,
        mode: 'order',
        members,
        createdAt: at,
        updatedAt: at,
      };
      write(group);
      return group;
    },
    update(id, input) {
      const groups = read();
      const existing = current(groups, id, input.expectedRevision);
      const { name, members } = checked(groups, id, input);
      const group: RoutingGroup = {
        ...existing,
        name,
        members,
        revision: existing.revision + 1,
        updatedAt: now().toISOString(),
      };
      write(group);
      return group;
    },
    delete(id, expectedRevision) {
      const groups = read();
      const existing = current(groups, id, expectedRevision);
      const parents = groups
        .filter((group) =>
          group.members.some((member) => member.kind === 'group' && member.id === id),
        )
        .map((group) => `Routing Group ${group.name}`);
      const references = [
        ...parents,
        ...(readDefault().groupId === id ? ['the default model'] : []),
        ...(options.references?.(id) ?? []),
      ];
      if (references.length > 0)
        throw new RoutingGroupError(
          'in-use',
          `Routing Group ${existing.name} is used by ${references.join(', ')}`,
          references,
        );
      port.transaction(
        (database) => {
          database.prepare('DELETE FROM routing_groups WHERE id = ?').run(id);
        },
        ['routing-groups'],
      );
      return existing;
    },
    routes(id) {
      return expandRoutingGroup(id, byId(read()));
    },
    targets(id) {
      return expandRoutingTargets(id, byId(read()));
    },
  };
}
