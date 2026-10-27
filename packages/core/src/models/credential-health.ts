export type ProviderCredentialFailure = 'missing' | 'invalid';

export interface ProviderCredentialHealth {
  observe(provider: string, code: string): void;
  failure(provider: string): ProviderCredentialFailure | undefined;
  reset(): void;
}

const failureOf: Readonly<Record<string, ProviderCredentialFailure>> = {
  MISSING_CREDENTIAL: 'missing',
  INVALID_CREDENTIAL: 'invalid',
};

// A fix made outside DSH (environment, external secret store, provider console) raises no
// DSH event, so an observed failure only stands for a short while before it is re-checked.
export const CREDENTIAL_FAILURE_TTL_MS = 60_000;

export function createProviderCredentialHealth(
  options: { now?: () => number; ttlMs?: number } = {},
): ProviderCredentialHealth {
  const now = options.now ?? Date.now;
  const ttlMs = options.ttlMs ?? CREDENTIAL_FAILURE_TTL_MS;
  const failures = new Map<string, { failure: ProviderCredentialFailure; at: number }>();
  return {
    observe(provider, code) {
      const failure = failureOf[code];
      if (failure !== undefined) failures.set(provider, { failure, at: now() });
    },
    failure(provider) {
      const entry = failures.get(provider);
      if (entry === undefined) return undefined;
      if (now() - entry.at < ttlMs) return entry.failure;
      failures.delete(provider);
      return undefined;
    },
    reset: () => failures.clear(),
  };
}
