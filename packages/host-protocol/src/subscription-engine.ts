export const ENGINE_IDS = ['codex', 'claude'] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export const ENGINE_DEFINITIONS = {
  codex: { displayName: 'Codex' },
  claude: { displayName: 'Claude Code' },
} satisfies Record<EngineId, { displayName: string }>;

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && ENGINE_IDS.some((id) => id === value);
}

export interface RoutingGroupEngineMember {
  kind: 'engine';
  engine: EngineId;
  model?: string;
}

export function isRoutingGroupEngineMember(value: unknown): value is RoutingGroupEngineMember {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  const model = member['model'];
  return (
    member['kind'] === 'engine' &&
    isEngineId(member['engine']) &&
    (model === undefined || (typeof model === 'string' && model.trim().length > 0)) &&
    Object.keys(member).every((key) => key === 'kind' || key === 'engine' || key === 'model')
  );
}

export const ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS = [
  'host-not-local',
  'not-installed',
  'signed-out',
  'not-subscription',
  'login-unknown',
] as const;

export type RoutingGroupEngineUnavailable =
  (typeof ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS)[number];

export type RoutingGroupEngineOptions = { engine: EngineId } & (
  | { available: true; models: { id: string; name: string }[] }
  | { available: false; reason: RoutingGroupEngineUnavailable }
);
