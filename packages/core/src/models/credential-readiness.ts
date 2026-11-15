import type { ProviderCredentialFailure } from './credential-health.js';

interface NativeCredentialReadiness {
  providers(): { provider: string; settingsNs: string; settingsPath: readonly string[] }[];
  settings(): { ns: string; value: unknown }[];
  describe(ref: string): Promise<{ configured: boolean }>;
}
export function createCredentialReadiness(
  native: NativeCredentialReadiness,
): () => (provider: string) => Promise<ProviderCredentialFailure | undefined> {
  return () => {
    const providers = native.providers();
    const settings = native.settings();
    const descriptions = new Map<string, Promise<{ configured: boolean }>>();
    return async (provider) => {
      const entry = providers.find((candidate) => candidate.provider === provider);
      if (!entry) return undefined;
      let config = settings.find((candidate) => candidate.ns === entry.settingsNs)?.value;
      for (const key of entry.settingsPath) {
        config =
          typeof config === 'object' && config !== null
            ? (config as Record<string, unknown>)[key]
            : undefined;
      }
      const ref =
        typeof config === 'object' && config !== null
          ? (config as Record<string, unknown>)['apiKeyEnv']
          : undefined;
      if (typeof ref !== 'string' || !ref) return undefined;
      let description = descriptions.get(ref);
      if (description === undefined) {
        description = native.describe(ref);
        descriptions.set(ref, description);
      }
      return (await description).configured ? undefined : 'missing';
    };
  };
}
