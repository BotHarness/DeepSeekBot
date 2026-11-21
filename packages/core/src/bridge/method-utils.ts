import type { AllBotPreview } from '../channels/all-bot-mention.js';

export interface BridgeError {
  details?: {
    preview?: AllBotPreview;
    permission?: string;
    path?: string;
    spaceId?: string;
    route?: string;
    references?: string[];
  };
  code: string;
  message: string;
}

export type BridgeResult<T> = { ok: true; value: T } | { ok: false; error: BridgeError };

export function asObject(payload: unknown): Record<string, unknown> {
  return typeof payload === 'object' && payload !== null
    ? (payload as Record<string, unknown>)
    : {};
}

export function asSlug(payload: unknown): string | undefined {
  const value = asObject(payload)['slug'];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function unknownBot(slug: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown PersonaBot: ${slug}` },
  };
}

export function unavailable(): BridgeResult<never> {
  return {
    ok: false,
    error: {
      code: 'storage-unavailable',
      message: 'roster storage is unavailable',
    },
  };
}

export function invalidInput(message: string): BridgeResult<never> {
  return { ok: false, error: { code: 'invalid-input', message } };
}

export function asNonBlank(source: Record<string, unknown>, key: string): string | undefined {
  const value = source[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

export function unknownChannel(id: string): BridgeResult<never> {
  return {
    ok: false,
    error: { code: 'not-found', message: `unknown Channel: ${id}` },
  };
}
