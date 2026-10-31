import { expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createCore } from '../../packages/core/src/plugin.js';
import { createDshImProvider } from '../../packages/core/src/messaging/dsh-im.js';
import { attachOperationalModule } from '../../packages/core/src/database/owner.js';
import { verifyQqOrdinaryMedia } from '../verify-qq-ordinary-media.mjs';
import { qqOrdinaryMediaSource } from '../product-provider/qq-ordinary-media.mjs';

const seams = [
  'const sourceImages = addressed && this.#sourceImages() === true;',
  'const sourceFiles = addressed && this.#sourceFiles() === true;',
  'const mediaEnabled = addressed && message?.attachments?.length;',
];

it('patches only the three media gates and refuses missing or ambiguous source seams', () => {
  const source = [
    ...seams,
    'qualify(route) { if (!source.event.mentionedAccount) refuse(); }',
  ].join('\n');
  const result = qqOrdinaryMediaSource(source);
  expect(result.match(/addressed \|\| ordinary/g)).toHaveLength(3);
  expect(result).toContain('if (!source.event.mentionedAccount) refuse();');
  expect(() => qqOrdinaryMediaSource(result)).toThrow('source seam changed');
  for (const seam of seams) {
    expect(() => qqOrdinaryMediaSource(source.replace(seam, ''))).toThrow('source seam changed');
    expect(() => qqOrdinaryMediaSource(`${source}\n${seam}`)).toThrow('source seam changed');
  }
});

it.skipIf(!process.env.BH_QQ_PROVIDER_ROOT).each(['image', 'file'])(
  'preserves ordinary QQ %s through the real Provider and keeps its authority controls',
  async (kind) => {
    const result = await verifyQqOrdinaryMedia(process.env.BH_QQ_PROVIDER_ROOT, kind);
    expect(result.controls).toBe('passed');
  },
);

it.skipIf(!process.env.BH_QQ_PROVIDER_ROOT).each(['image', 'file'])(
  'persists the real Provider ordinary %s event through the Core adapter only after group opt-in',
  async (kind) => {
    const result = await verifyQqOrdinaryMedia(process.env.BH_QQ_PROVIDER_ROOT, kind);
    const event = result.event;
    const home = mkdtempSync(join(tmpdir(), 'bh-qq-core-'));
    vi.useFakeTimers({ toFake: ['Date'], now: Date.parse(event.at) });
    const core = createCore({ dshHome: home });
    try {
      let consumer;
      const transport = {
        contractVersion: 1,
        receiptVersion: 1,
        fileVersion: 1,
        replyContextVersion: 1,
        replyReceiptVersion: 1,
        replyFenceVersion: 1,
        listBots: async () => [{ botId: event.botId, channel: 'qq' }],
        listTargets: async () => [
          {
            targetId: 'group-target',
            kind: 'group',
            name: 'Synthetic group',
            route: { groupOpenId: event.conversation.id },
          },
        ],
        describeBot: async () => ({
          version: 1,
          botId: event.botId,
          channel: 'qq',
          connected: true,
          account: { fingerprint: event.fingerprint },
          capabilities: [
            'exclusive-text-consumer',
            'ordinary-text-consumer',
            'reply-text-checked',
            'reply-context-checked',
            'reply-receipt-checked',
            'reply-fence-checked',
            'source-image-checked',
            'reply-image-fence-checked',
            'source-file-checked',
            'reply-file-checked',
            'source-generic-file-checked',
            'reply-file-fence-checked',
          ],
        }),
        consumeInbound: async (_account, options) => {
          consumer = options;
          return () => {};
        },
        readSourceFile: async () =>
          (async function* () {
            yield new Uint8Array([1]);
          })(),
        qualifyReplyChecked: async () => {
          throw Object.assign(new Error('capability-unavailable'), {
            code: 'capability-unavailable',
          });
        },
        replyChecked: async () => {
          throw new Error('Ordinary media must not gain passive reply authority');
        },
        sendChecked: async () => {
          throw new Error('Posting is outside this test');
        },
      };
      const provider = createDshImProvider(transport, 'qq');
      if (!provider) throw new Error('QQ Provider adapter unavailable');
      core.externalMessaging.register(provider);
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      const target = (await provider.targets(event.botId))[0];
      const grant = await core.externalMessaging.authorize({
        botSlug: 'ada',
        providerId: provider.id,
        accountRef: event.botId,
        fingerprint: event.fingerprint,
        targetRef: target.ref,
        targetDigest: target.digest,
      });
      await core.externalMessaging.inbound.setEnabled('ada', grant.id, true);
      if (!consumer) throw new Error('Core did not acquire the QQ Consumer');
      const query = () =>
        attachOperationalModule(core.operationalDatabase, 'qq-provider-media-test').read((db) =>
          db
            .prepare(
              "SELECT source_event_id FROM source_events WHERE source_kind = 'bridge-message'",
            )
            .all(),
        );
      await consumer.onEvent(event, { signal: consumer.signal });
      expect(query()).toHaveLength(0);
      await core.externalMessaging.inbound.setPolicy(
        'ada',
        grant.id,
        { collection: 'all', wake: 'digest', count: 2, intervalSeconds: 60 },
        { kind: 'human' },
      );
      await consumer.onEvent(event, { signal: consumer.signal });
      const sources = query();
      expect(sources).toHaveLength(1);
      const persisted = core.externalMessaging.inbound.read('ada', sources[0].source_event_id);
      const { text, ...metadata } = event;
      expect(persisted.event).toEqual(metadata);
      expect(persisted.body).toBe(text);
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      vi.useRealTimers();
      rmSync(home, { recursive: true, force: true });
    }
  },
);
