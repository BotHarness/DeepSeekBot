import { createHash, randomUUID } from 'node:crypto';
import { credentialKey, type CredentialProvider } from '@deepseek-ai/dsh-credentials';
import { z } from 'zod';

export interface PrivateAccountScope {
  botSlug: string;
  botCreatedAt: string;
  account: string;
}

const bindingSchema = z.strictObject({
  version: z.literal(1),
  botSlug: z.string(),
  botCreatedAt: z.string(),
  account: z.string(),
  revision: z.string().uuid(),
  grantId: z.string().uuid().nullable(),
});
export type PrivateAccountBinding = z.infer<typeof bindingSchema>;

export class PrivateAccountBindings {
  readonly #queues = new Map<string, Promise<void>>();

  constructor(readonly credentials: () => CredentialProvider | undefined) {}

  key(scope: PrivateAccountScope) {
    const digest = createHash('sha256')
      .update(JSON.stringify([scope.botSlug, scope.botCreatedAt, scope.account]))
      .digest('hex');
    return credentialKey('botharness-private', 'account-' + digest);
  }

  async serial<T>(scope: PrivateAccountScope, work: () => Promise<T>): Promise<T> {
    const key = this.key(scope);
    const previous = this.#queues.get(key) ?? Promise.resolve();
    const result = previous.then(work);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.#queues.set(key, tail);
    try {
      return await result;
    } finally {
      if (this.#queues.get(key) === tail) this.#queues.delete(key);
    }
  }

  async read(scope: PrivateAccountScope): Promise<PrivateAccountBinding | undefined> {
    const provider = this.credentials();
    if (provider === undefined) throw new Error('Private account authority is unavailable');
    const record = await provider.readRecord(this.key(scope)).catch(() => {
      throw new Error('Private account authority is unavailable');
    });
    if (record === undefined) return undefined;
    const parsed = bindingSchema.safeParse(record.kind === 'grant' ? record.payload : undefined);
    if (
      !parsed.success ||
      parsed.data.botSlug !== scope.botSlug ||
      parsed.data.botCreatedAt !== scope.botCreatedAt ||
      parsed.data.account !== scope.account
    )
      throw new Error('Private account authority is unavailable');
    return parsed.data;
  }

  async list(botSlug: string, botCreatedAt: string): Promise<PrivateAccountBinding[]> {
    const provider = this.credentials();
    if (provider === undefined) throw new Error('Private account authority is unavailable');
    const bindings: PrivateAccountBinding[] = [];
    for (const entry of await provider.listRecords()) {
      if (entry.kind !== 'grant' || !/^botharness-private\/account-[0-9a-f]{64}$/.test(entry.key))
        continue;
      const record = await provider.readRecord(entry.key);
      const parsed = bindingSchema.safeParse(record?.kind === 'grant' ? record.payload : undefined);
      if (
        parsed.success &&
        parsed.data.botSlug === botSlug &&
        parsed.data.botCreatedAt === botCreatedAt &&
        this.key(parsed.data) === entry.key
      )
        bindings.push(parsed.data);
    }
    return bindings;
  }

  async commit(
    scope: PrivateAccountScope,
    expectedRevision: string | undefined,
    grantId: string | null,
    valid: () => boolean,
  ): Promise<PrivateAccountBinding> {
    const provider = this.credentials();
    if (provider === undefined) throw new Error('Private account authority is unavailable');
    const binding: PrivateAccountBinding = {
      version: 1,
      ...scope,
      revision: randomUUID(),
      grantId,
    };
    await provider
      .modifyRecord(this.key(scope), async (record) => {
        const parsed =
          record === undefined
            ? undefined
            : bindingSchema.safeParse(record.kind === 'grant' ? record.payload : undefined);
        if (
          !valid() ||
          (parsed !== undefined &&
            (!parsed.success ||
              parsed.data.botSlug !== scope.botSlug ||
              parsed.data.botCreatedAt !== scope.botCreatedAt ||
              parsed.data.account !== scope.account)) ||
          (parsed?.success ? parsed.data.revision : undefined) !== expectedRevision
        )
          throw new Error('Private account version changed');
        return { kind: 'grant', payload: binding };
      })
      .catch(async () => {
        const committed = await this.read(scope).catch(() => undefined);
        if (committed?.revision !== binding.revision || committed.grantId !== grantId)
          throw new Error('Private account version changed or authority is unavailable');
      });
    return binding;
  }

  async drain(): Promise<void> {
    await Promise.all([...this.#queues.values()]);
  }
}
