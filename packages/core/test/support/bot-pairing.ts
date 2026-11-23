import {
  mountOperationalDatabase,
  attachOperationalModule,
  type OperationalDatabaseOwner,
} from '../../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../../src/database/schema-plan.js';
import { createBotPairing } from '../../src/messaging/pairing.js';
import { type BotHarnessCore } from '../../src/plugin.js';
import type { MessagingInboundEvent } from '../../src/messaging/provider.js';
import { createTempRoot } from '../helpers.js';

export const owners: OperationalDatabaseOwner[] = [];

export const cores: BotHarnessCore[] = [];

export const fingerprint: string = 'a'.repeat(64);

export function event(actorId = 'ou_alice', messageId = 'message-1'): MessagingInboundEvent {
  return {
    version: 1,
    channel: 'feishu',
    botId: 'lark-qa',
    fingerprint,
    eventId: messageId,
    messageId,
    actor: { kind: 'user', id: actorId, name: 'Alice QA' },
    conversation: { kind: 'dm', id: 'oc_private' },
    mentions: [],
    mentionedAccount: false,
    at: new Date().toISOString(),
    text: '/pair',
    reply: { messageId, conversationId: 'oc_private', actorId },
    replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
  };
}

interface PairingMount {
  owner: OperationalDatabaseOwner;
  db: ReturnType<typeof attachOperationalModule>;
  pairing: ReturnType<typeof createBotPairing>;
}

interface BotPairingFixture extends PairingMount {
  mount: () => PairingMount;
  advance: (ms: number) => void;
}

export function fixture(): BotPairingFixture {
  const home = createTempRoot('bh-pairing-');
  let clock = new Date();
  const mount = () => {
    const owner = mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
    owners.push(owner);
    const db = attachOperationalModule(owner, 'messaging');
    return {
      owner,
      db,
      pairing: createBotPairing(
        db,
        (slug) => slug === 'ada',
        () => clock,
      ),
    };
  };
  const value = mount();
  value.db.transaction((db) =>
    db
      .prepare(
        'INSERT INTO messaging_bindings (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      )
      .run(
        'binding',
        'ada',
        'dsh-im/feishu',
        'feishu',
        'lark-qa',
        fingerprint,
        clock.toISOString(),
        'Lark QA',
      ),
  );
  return {
    ...value,
    mount,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}
