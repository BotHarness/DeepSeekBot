export const ENGINE_IDS = ['codex', 'claude'] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

export const ENGINE_DEFINITIONS = {
  codex: { displayName: 'Codex' },
  claude: { displayName: 'Claude Code' },
} satisfies Record<EngineId, { displayName: string }>;

const ENGINE_EFFORT_NAMES = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
};

export type EngineEffortLevel = keyof typeof ENGINE_EFFORT_NAMES;

function isEngineEffortLevel(id: string): id is EngineEffortLevel {
  return Object.hasOwn(ENGINE_EFFORT_NAMES, id);
}

export function engineEffortName(
  id: string,
  translate?: (level: EngineEffortLevel) => string,
  catalogName?: string,
): string {
  if (isEngineEffortLevel(id)) return translate?.(id) ?? catalogName ?? ENGINE_EFFORT_NAMES[id];
  return catalogName ?? id.charAt(0).toUpperCase() + id.slice(1);
}

export function isEngineId(value: unknown): value is EngineId {
  return typeof value === 'string' && ENGINE_IDS.some((id) => id === value);
}

export const DEFAULT_CODEX_ACCOUNT = 'codex-default';

export function engineAccountKey(engine: EngineId, accountId?: string): string {
  return accountId ?? (engine === 'codex' ? DEFAULT_CODEX_ACCOUNT : engine);
}

export function enginePickerAccountKey(engine: EngineId, accountId?: string): string {
  return accountId === DEFAULT_CODEX_ACCOUNT ? engine : (accountId ?? engine);
}

export interface EngineAccountIdentity {
  accountId?: string;
  accountName?: string;
}

export interface NamedEngineAccount {
  id: string;
  engine: EngineId;
  name: string;
}

export interface RoutingGroupEngineMember {
  kind: 'engine';
  engine: EngineId;
  model?: string;
  accountId?: string;
  reasoningEffort?: string;
}

export function isRoutingGroupEngineMember(value: unknown): value is RoutingGroupEngineMember {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const member = value as Record<string, unknown>;
  const { model, accountId, reasoningEffort } = member;
  return (
    member['kind'] === 'engine' &&
    isEngineId(member['engine']) &&
    (model === undefined || (typeof model === 'string' && model.trim().length > 0)) &&
    (accountId === undefined || (typeof accountId === 'string' && accountId.trim().length > 0)) &&
    (reasoningEffort === undefined ||
      (typeof model === 'string' &&
        typeof reasoningEffort === 'string' &&
        reasoningEffort.trim() !== '')) &&
    Object.keys(member).every((key) =>
      ['kind', 'engine', 'model', 'accountId', 'reasoningEffort'].includes(key),
    )
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

export type RoutingGroupEngineOptions = { engine: EngineId } & EngineAccountIdentity &
  (
    | { available: true; models: RoutingGroupEngineModel[] }
    | { available: false; reason: RoutingGroupEngineUnavailable }
  );
