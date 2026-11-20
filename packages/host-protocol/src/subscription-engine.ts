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
  reasoningEffort?: string;
}

export function isRoutingGroupEngineMember(value: unknown): value is RoutingGroupEngineMember {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  const model = member['model'];
  const effort = member['reasoningEffort'];
  return (
    member['kind'] === 'engine' &&
    isEngineId(member['engine']) &&
    (model === undefined || (typeof model === 'string' && model.trim().length > 0)) &&
    (effort === undefined ||
      (typeof model === 'string' && typeof effort === 'string' && effort.trim() !== '')) &&
    Object.keys(member).every((key) => ['kind', 'engine', 'model', 'reasoningEffort'].includes(key))
  );
}

export const ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS = [
  'host-not-local',
  'not-installed',
  'signed-out',
  'not-subscription',
  'login-unknown',
  'models-unavailable',
] as const;

export type RoutingGroupEngineUnavailable =
  (typeof ROUTING_GROUP_ENGINE_UNAVAILABLE_REASONS)[number];

export interface EngineModelView {
  id: string;
  name: string;
  efforts: { id: string; name: string }[];
  defaultEffort?: string;
  isDefault?: boolean;
}

export interface RoutingGroupEngineModel extends EngineModelView {
  aliases?: string[];
}

export type RoutingGroupEngineOptions = { engine: EngineId } & (
  | { available: true; models: RoutingGroupEngineModel[] }
  | { available: false; reason: RoutingGroupEngineUnavailable }
);
