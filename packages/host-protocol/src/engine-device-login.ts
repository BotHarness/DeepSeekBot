export const CODEX_DEVICE_VERIFICATION_URL = 'https://auth.openai.com/codex/device';

export interface EngineDeviceLoginChallenge {
  url: typeof CODEX_DEVICE_VERIFICATION_URL;
  code: string;
  expiresAt: string;
}

export type EngineDeviceLoginEnd = {
  status: 'completed' | 'failed' | 'expired' | 'cancelled';
};

export type EngineDeviceLoginProgress =
  | { status: 'starting' }
  | ({ status: 'pending' } & EngineDeviceLoginChallenge)
  | EngineDeviceLoginEnd;

export function isCodexDeviceCode(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Z0-9]{4,5}-[A-Z0-9]{4,5}$/u.test(value);
}

export function parseEngineDeviceLoginProgress(
  value: unknown,
): EngineDeviceLoginProgress | undefined {
  if (typeof value !== 'object' || value === null || !('status' in value)) return undefined;
  switch (value.status) {
    case 'starting':
    case 'completed':
    case 'failed':
    case 'expired':
    case 'cancelled':
      return { status: value.status };
    case 'pending':
      if (
        'url' in value &&
        value.url === CODEX_DEVICE_VERIFICATION_URL &&
        'code' in value &&
        isCodexDeviceCode(value.code) &&
        'expiresAt' in value &&
        typeof value.expiresAt === 'string' &&
        Number.isFinite(Date.parse(value.expiresAt))
      )
        return { status: 'pending', url: value.url, code: value.code, expiresAt: value.expiresAt };
      return undefined;
    default:
      return undefined;
  }
}
