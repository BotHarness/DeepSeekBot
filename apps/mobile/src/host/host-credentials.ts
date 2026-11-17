import { MethodRefused } from '@botharness/host-client/client';
import type { HostClient } from './host-settings';

export type CredentialInfo = {
  configured: boolean;
  source?: string;
  writable: boolean;
  masked?: string;
};

export type CredentialWriteResult =
  | { kind: 'saved' }
  | { kind: 'removed' }
  | { kind: 'rejected'; message: string }
  | { kind: 'refused' }
  | { kind: 'error' };

const REF = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function validCredentialRef(ref: string): boolean {
  return REF.test(ref);
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

function credentialInfo(value: unknown): CredentialInfo | undefined {
  const info = record(value);
  if (
    !info ||
    typeof info['configured'] !== 'boolean' ||
    typeof info['writable'] !== 'boolean' ||
    (info['source'] !== undefined && typeof info['source'] !== 'string') ||
    (info['masked'] !== undefined && typeof info['masked'] !== 'string')
  )
    return undefined;
  return {
    configured: info['configured'],
    writable: info['writable'],
    ...(info['source'] === undefined ? {} : { source: info['source'] as string }),
    ...(info['masked'] === undefined ? {} : { masked: info['masked'] as string }),
  };
}

export async function describeCredentials(
  client: HostClient,
  refs: readonly string[],
): Promise<Record<string, CredentialInfo>> {
  const raw = record(await client.call<unknown>('credentials/describe', { refs: [...refs] }));
  if (raw === undefined) return {};
  const result: Record<string, CredentialInfo> = {};
  for (const [ref, value] of Object.entries(raw)) {
    const info = credentialInfo(value);
    if (info !== undefined) result[ref] = info;
  }
  return result;
}

function redact(message: string, secrets: readonly string[]): string {
  let result = message;
  for (const secret of secrets) {
    if (secret.length < 4) continue;
    result = result
      .split(secret)
      .join('[redacted]')
      .split(encodeURIComponent(secret))
      .join('[redacted]');
  }
  return result;
}

function writeFailure(error: unknown, secrets: readonly string[] = []): CredentialWriteResult {
  if (error instanceof MethodRefused) {
    if (error.code === 'secret-route-refused') return { kind: 'refused' };
    return { kind: 'rejected', message: redact(error.message, secrets) };
  }
  return { kind: 'error' };
}

export async function setCredential(
  client: HostClient,
  ref: string,
  value: string,
): Promise<CredentialWriteResult> {
  try {
    await client.call('credentials/set', { ref, value });
    return { kind: 'saved' };
  } catch (error) {
    return writeFailure(error, [value]);
  }
}

export async function unsetCredential(
  client: HostClient,
  ref: string,
): Promise<CredentialWriteResult> {
  try {
    await client.call('credentials/unset', { ref });
    return { kind: 'removed' };
  } catch (error) {
    return writeFailure(error);
  }
}
