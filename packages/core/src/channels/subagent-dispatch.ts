const SUBAGENT_DISPATCH_KIND = 'subagent';

const SUBAGENT_DISPATCH_DESCRIPTION_MAX_CHARS = 120;

export type SubagentDispatchStatus = 'queued' | 'running' | 'completed' | 'failed' | 'declined';

export interface SubagentDispatchRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export interface SubagentDispatchProjection {
  dispatchId: string;
  kind: typeof SUBAGENT_DISPATCH_KIND;
  description: string;
  status: SubagentDispatchStatus;
  revision: number;
  updatedAt: string;
  parentSessionId: string;
  resolvedRoute?: SubagentDispatchRoute;
  advisor?: SubagentDispatchAdvisor;
}

export type SubagentDispatchAdvisor = 'unavailable' | SubagentDispatchRoute;

export interface SubagentDispatchRecord {
  channelId: string;
  messageId: string;
  projection: SubagentDispatchProjection;
}

export interface SubagentDispatchTransition {
  channelId: string;
  dispatchId: string;
  parentSessionId: string;
  status: SubagentDispatchStatus;
  at: string;
  description?: string;
  resolvedRoute?: SubagentDispatchRoute;
  advisor?: SubagentDispatchAdvisor;
}

export interface SubagentDispatchRegistry {
  preview(transition: SubagentDispatchTransition): SubagentDispatchRecord | undefined;
  apply(transition: SubagentDispatchTransition): SubagentDispatchRecord | undefined;
  forChannel(channelId: string): readonly SubagentDispatchRecord[];
}

const STATUS_RANK: Record<SubagentDispatchStatus, number> = {
  queued: 0,
  running: 1,
  completed: 2,
  failed: 2,
  declined: 2,
};

export function isTerminalSubagentDispatchStatus(status: SubagentDispatchStatus): boolean {
  return STATUS_RANK[status] === 2;
}

export function subagentDispatchStatusRank(status: SubagentDispatchStatus): number {
  return STATUS_RANK[status];
}

function isSubagentDispatchStatus(value: unknown): value is SubagentDispatchStatus {
  return typeof value === 'string' && Object.hasOwn(STATUS_RANK, value);
}

export function sanitizeSubagentDispatchDescription(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const normalized = value
    .replace(/[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]+/gu, '')
    .replace(/\s+/gu, ' ')
    .trim();
  if (normalized.length === 0) return undefined;
  return Array.from(normalized).slice(0, SUBAGENT_DISPATCH_DESCRIPTION_MAX_CHARS).join('');
}

export function parseSubagentDispatchRoute(value: unknown): SubagentDispatchRoute | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const { provider, model, reasoningEffort } = value as Record<string, unknown>;
  if (typeof provider !== 'string' || typeof model !== 'string') return undefined;
  return {
    provider,
    model,
    ...(typeof reasoningEffort === 'string' ? { reasoningEffort } : {}),
  };
}

export function subagentDispatchMessageId(dispatchId: string): string {
  return `subagent-dispatch-${dispatchId}`;
}

export function parseSubagentDispatchProjection(
  value: unknown,
): SubagentDispatchProjection | undefined {
  if (typeof value !== 'object' || value === null) return undefined;
  const projection = value as Record<string, unknown>;
  if (projection['kind'] !== SUBAGENT_DISPATCH_KIND) return undefined;
  if (typeof projection['dispatchId'] !== 'string') return undefined;
  if (typeof projection['parentSessionId'] !== 'string') return undefined;
  if (!isSubagentDispatchStatus(projection['status'])) return undefined;
  if (typeof projection['description'] !== 'string') return undefined;
  if (typeof projection['updatedAt'] !== 'string') return undefined;
  if (typeof projection['revision'] !== 'number') return undefined;
  const resolvedRoute = parseSubagentDispatchRoute(projection['resolvedRoute']);
  const advisor =
    projection['advisor'] === 'unavailable'
      ? 'unavailable'
      : parseSubagentDispatchRoute(projection['advisor']);
  return {
    kind: SUBAGENT_DISPATCH_KIND,
    dispatchId: projection['dispatchId'],
    parentSessionId: projection['parentSessionId'],
    status: projection['status'],
    description: projection['description'],
    updatedAt: projection['updatedAt'],
    revision: projection['revision'],
    ...(resolvedRoute === undefined ? {} : { resolvedRoute }),
    ...(advisor === undefined ? {} : { advisor }),
  };
}

export function terminalSubagentStatus(reason: unknown): SubagentDispatchStatus {
  const kind =
    typeof reason === 'string'
      ? reason
      : reason !== null && typeof reason === 'object' && 'kind' in reason
        ? (reason as { kind?: unknown }).kind
        : undefined;
  return kind === 'completed' ? 'completed' : 'failed';
}

function sameRoute(
  left: SubagentDispatchRoute | undefined,
  right: SubagentDispatchRoute | undefined,
): boolean {
  if (left === undefined || right === undefined) return left === right;
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    (left.reasoningEffort ?? '') === (right.reasoningEffort ?? '')
  );
}

export function createSubagentDispatchRegistry(): SubagentDispatchRegistry {
  const channels = new Map<string, Map<string, SubagentDispatchRecord>>();

  return {
    preview({
      channelId,
      dispatchId,
      parentSessionId,
      status,
      description,
      resolvedRoute,
      advisor,
      at,
    }) {
      const existing = channels.get(channelId)?.get(dispatchId);
      const previous = existing?.projection;
      if (previous !== undefined) {
        if (isTerminalSubagentDispatchStatus(previous.status)) return undefined;
        if (subagentDispatchStatusRank(status) < subagentDispatchStatusRank(previous.status))
          return undefined;
      }
      const route = status === 'declined' ? undefined : (resolvedRoute ?? previous?.resolvedRoute);
      const hint = advisor ?? previous?.advisor;
      const text =
        previous !== undefined && previous.description.length > 0
          ? previous.description
          : (sanitizeSubagentDispatchDescription(description) ?? '');
      if (
        previous !== undefined &&
        status === previous.status &&
        sameRoute(route, previous.resolvedRoute) &&
        JSON.stringify(hint) === JSON.stringify(previous.advisor) &&
        text === previous.description
      )
        return undefined;
      const projection: SubagentDispatchProjection = {
        dispatchId,
        kind: SUBAGENT_DISPATCH_KIND,
        description: text,
        status,
        revision: (previous?.revision ?? 0) + 1,
        updatedAt: at,
        parentSessionId,
        ...(route === undefined ? {} : { resolvedRoute: route }),
        ...(hint === undefined ? {} : { advisor: hint }),
      };
      const record: SubagentDispatchRecord = {
        channelId,
        messageId: existing?.messageId ?? subagentDispatchMessageId(dispatchId),
        projection,
      };
      return record;
    },
    apply(transition) {
      const record = this.preview(transition);
      if (record === undefined) return undefined;
      let group = channels.get(transition.channelId);
      if (group === undefined) {
        group = new Map();
        channels.set(transition.channelId, group);
      }
      group.set(transition.dispatchId, record);
      return record;
    },
    forChannel(channelId) {
      return [...(channels.get(channelId)?.values() ?? [])];
    },
  };
}
