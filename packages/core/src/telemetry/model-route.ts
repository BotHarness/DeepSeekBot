export const TELEMETRY_PROVIDER_KINDS = [
  'deepseek_official',
  'deepseek_account',
  'deepseek_api',
  'opencode_go',
  'custom',
  'other',
  'unknown',
] as const;

export type TelemetryProviderKind = (typeof TELEMETRY_PROVIDER_KINDS)[number];

const PROVIDER_PREFIXES: readonly (readonly [string, TelemetryProviderKind])[] = [
  ['deepseek-official', 'deepseek_official'],
  ['deepseek-account', 'deepseek_account'],
  ['deepseek', 'deepseek_api'],
  ['opencode-go', 'opencode_go'],
  ['custom', 'custom'],
];

export const TELEMETRY_MODEL_ID = /^[a-z0-9][a-z0-9._:/-]{0,79}$/u;

export interface TelemetryModelRoute {
  provider_kind: TelemetryProviderKind;
  model_id: string;
}

export function telemetryProviderKind(provider: string): TelemetryProviderKind {
  if (provider === 'unknown') return 'unknown';
  for (const [prefix, kind] of PROVIDER_PREFIXES)
    if (provider === prefix || new RegExp(`^${prefix}-\\d+$`, 'u').test(provider)) return kind;
  return 'other';
}

export function telemetryModelRoute(provider: string, model: string): TelemetryModelRoute {
  const kind = telemetryProviderKind(provider);
  if (kind === 'custom' || kind === 'other' || kind === 'unknown')
    return { provider_kind: kind, model_id: kind };
  const id = model.toLowerCase();
  return { provider_kind: kind, model_id: TELEMETRY_MODEL_ID.test(id) ? id : 'other' };
}
