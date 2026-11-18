import { rmSync } from 'node:fs';
import fc from 'fast-check';
import { expect, it } from 'vitest';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import { createTempRoot } from './helpers.js';

type Effect = 'accept' | 'reject' | 'hang';
interface Step {
  key: 'request-a' | 'request-b' | 'request-c';
  text: 'x' | 'y';
  effect: Effect;
  restart: boolean;
}

const step = fc.record<Step>({
  key: fc.constantFrom('request-a', 'request-b', 'request-c'),
  text: fc.constantFrom('x', 'y'),
  effect: fc.constantFrom('accept', 'reject', 'hang'),
  restart: fc.boolean(),
});

async function run(steps: Step[]) {
  const home = createTempRoot('botharness-outbox-property-');
  let owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  let effect: Effect = 'accept';
  let current = '';
  const sends = new Map<string, number>();
  const provider: MessagingProvider = {
    id: 'test-provider',
    accounts: async () => [
      {
        ref: 'account',
        platform: 'test',
        name: 'Account',
        fingerprint: 'a'.repeat(64),
        connected: true,
      },
    ],
    targets: async () => [{ ref: 'self', name: 'Self', digest: 'b'.repeat(64) }],
    async inspect() {
      return {
        account: (await provider.accounts())[0]!,
        target: (await provider.targets('account'))[0]!,
      };
    },
    async send() {
      sends.set(current, (sends.get(current) ?? 0) + 1);
      if (effect === 'reject') throw new Error('provider refused');
      if (effect === 'hang') return new Promise(() => undefined);
      return { accepted: true };
    },
  };
  const make = () =>
    createOutboundMessaging({
      database: attachOperationalModule(owner, 'messaging'),
      isBotActive: () => true,
      timeoutMs: 5,
    });
  let service = make();
  service.register(provider);
  const sent = new Map<string, { text: string; id: string; state: string }>();
  try {
    const grant = await service.authorize({
      botSlug: 'ada',
      providerId: provider.id,
      accountRef: 'account',
      targetRef: 'self',
      fingerprint: 'a'.repeat(64),
      targetDigest: 'b'.repeat(64),
    });
    for (const { key, text, effect: next, restart } of steps) {
      if (restart) {
        service.close();
        owner.close();
        owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
        service = make();
        service.register(provider);
      }
      effect = next;
      current = key;
      const total = [...sends.values()].reduce((sum, count) => sum + count, 0);
      const earlier = sent.get(key);
      if (earlier !== undefined && earlier.text !== text) {
        await expect(service.send('ada', grant.id, key, text)).rejects.toThrow('request-conflict');
        expect([...sends.values()].reduce((sum, count) => sum + count, 0)).toBe(total);
        continue;
      }
      const intent = await service.send('ada', grant.id, key, text);
      const result = { id: intent.id, state: intent.state };
      if (earlier !== undefined) {
        expect(result.id).toBe(earlier.id);
        if (earlier.state === 'unknown-outcome' || earlier.state === 'provider-accepted')
          expect(result.state).toBe(earlier.state);
      }
      sent.set(key, { text, ...result });
    }
    for (const count of sends.values()) expect(count).toBeLessThanOrEqual(1);
  } finally {
    service.close();
    owner.close();
    rmSync(home, { recursive: true, force: true });
  }
}

it('one request key reaches the provider at most once across results and restarts', async () => {
  await fc.assert(fc.asyncProperty(fc.array(step, { minLength: 1, maxLength: 12 }), run), {
    numRuns: 40,
  });
});
