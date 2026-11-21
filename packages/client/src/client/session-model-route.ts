import { asRecord } from './bridge-transport.js';

export interface SessionModelRoute {
  provider: string;
  model: string;
  reasoningEffort?: string;
}

export function parseSessionModelRoute(value: unknown): SessionModelRoute | undefined {
  const record = asRecord(value);
  const provider = record?.['provider'];
  const model = record?.['model'];
  const effort = record?.['reasoningEffort'];
  if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '')
    return undefined;
  return {
    provider,
    model,
    ...(typeof effort === 'string' ? { reasoningEffort: effort } : {}),
  };
}
