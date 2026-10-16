import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';

export function createSubagentAdvisorSettings(credentials: () => CredentialProvider | undefined) {
  const provider = (): CredentialProvider => {
    const current = credentials();
    if (current === undefined) throw new Error('Credentials service is unavailable');
    return current;
  };
  const reference = (slug: string) => credentialKey('botharness-subagent-advisor', `bot-${slug}`);
  return {
    async key(slug: string): Promise<string | undefined> {
      const record = await provider().readRecord(reference(slug));
      return record?.kind === 'api-key' ? record.key : undefined;
    },
    async configured(slug: string): Promise<boolean> {
      return (await provider().describeRecord(reference(slug))).configured;
    },
    async setKey(slug: string, key: string | undefined): Promise<void> {
      if (key === undefined) await provider().deleteRecord(reference(slug));
      else
        await provider().modifyRecord(reference(slug), async () => ({
          kind: 'api-key',
          key: key.trim(),
        }));
    },
  };
}
