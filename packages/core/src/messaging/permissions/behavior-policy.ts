export interface BehaviorPermission {
  id: string;
  botSlug: string;
  name: string;
  behavior: string;
  excludes?: string[];
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface BehaviorConflict {
  first: EffectiveBehaviorPermission;
  second: EffectiveBehaviorPermission;
}

export function withBehaviorPermission(
  items: BehaviorPermission[],
  item: BehaviorPermission,
): BehaviorPermission[] {
  const projected = items.map((peer) =>
    peer.id === item.id
      ? item
      : {
          ...peer,
          ...(item.excludes?.includes(peer.id)
            ? { excludes: [...new Set([...(peer.excludes ?? []), item.id])] }
            : peer.excludes?.includes(item.id)
              ? { excludes: peer.excludes.filter((id) => id !== item.id) }
              : {}),
        },
  );
  return items.some((entry) => entry.id === item.id) ? projected : [...projected, item];
}

export interface BehaviorGroup extends BehaviorSource {
  bindingId: string;
  memberIds: string[];
}

export interface BehaviorMember {
  id: string;
  bindingId: string;
  actorId: string;
  actorName?: string;
}

export function behaviorConflicts(
  items: BehaviorPermission[],
  groups: BehaviorSource[],
): BehaviorConflict[] {
  const allowed = resolveBehaviorPermissions(items, groups).filter(
    (item) => item.effect === 'allow',
  );
  return allowed.flatMap((first, index) =>
    allowed
      .slice(index + 1)
      .flatMap((second) =>
        first.excludes?.includes(second.id) || second.excludes?.includes(first.id)
          ? [{ first, second }]
          : [],
      ),
  );
}

export function behaviorConfigurationConflicts(
  items: BehaviorPermission[],
  groups: BehaviorGroup[],
  members: BehaviorMember[],
): { kind: 'group' | 'person'; id: string; name: string; conflicts: BehaviorConflict[] }[] {
  return [
    ...groups.map((group) => ({
      kind: 'group' as const,
      id: group.id,
      name: group.name,
      conflicts: behaviorConflicts(items, [group]),
    })),
    ...members.map((member) => ({
      kind: 'person' as const,
      id: member.id,
      name: member.actorName ?? member.actorId,
      conflicts: behaviorConflicts(
        items,
        groups.filter(
          (group) => group.bindingId === member.bindingId && group.memberIds.includes(member.id),
        ),
      ),
    })),
  ].filter((entry) => entry.conflicts.length);
}
export interface BehaviorChoices {
  behaviorAllow?: string[];
  behaviorDeny?: string[];
}
export interface BehaviorSource extends BehaviorChoices {
  id: string;
  name: string;
  revision: number;
}
export interface EffectiveBehaviorPermission extends BehaviorPermission {
  effect: 'allow' | 'deny';
  conflict: boolean;
  sources: { id: string; name: string; revision: number; effect: 'allow' | 'deny' }[];
}
export function resolveBehaviorPermissions(
  items: BehaviorPermission[],
  groups: BehaviorSource[],
): EffectiveBehaviorPermission[] {
  return items.flatMap((item) => {
    const sources = groups.flatMap((group) =>
      (['allow', 'deny'] as const)
        .filter((effect) =>
          (effect === 'allow' ? group.behaviorAllow : group.behaviorDeny)?.includes(item.id),
        )
        .map((effect) => ({ id: group.id, name: group.name, revision: group.revision, effect })),
    );
    if (!sources.length) return [];
    const denied = sources.some((source) => source.effect === 'deny');
    return [
      {
        ...item,
        effect: denied ? ('deny' as const) : ('allow' as const),
        conflict: denied && sources.some((source) => source.effect === 'allow'),
        sources,
      },
    ];
  });
}
