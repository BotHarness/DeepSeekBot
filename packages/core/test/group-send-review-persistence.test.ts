import { fixture } from './group-send-review-fixtures.js';
import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { expect, it } from 'vitest';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { defineSchemaPlan } from '../src/database/schema.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { GroupSendReview } from '../src/channels/send-review.js';

it('adds review tables after the canonical Channel management migration while preserving existing identities', () => {
  const dshHome = createTempRoot('review-tob-upgrade-');
  const prior = mountOperationalDatabase({
    dshHome,
    schemaPlan: defineSchemaPlan(
      BOT_HARNESS_SCHEMA_PLAN.migrations.filter((migration) => migration.generation <= 98),
    ),
  });
  try {
    attachOperationalModule(prior, 'tob-upgrade-test').transaction((db) => {
      db.exec(
        "INSERT INTO channel_management_operations VALUES ('group-a', 'create', 'hash-a', 'channel-a', NULL, '[]', 'completed')",
      );
      db.exec(
        "INSERT INTO bot_creation_operations VALUES ('create-a', 'hash-a', 'created-bot', 'created')",
      );
      db.prepare('INSERT INTO tob_identity (singleton, bot_slug) VALUES (1, ?)').run(
        'protected-tob',
      );
    });
  } finally {
    prior.close();
  }
  const upgraded = mountOperationalDatabase({ dshHome, schemaPlan: BOT_HARNESS_SCHEMA_PLAN });
  try {
    const port = attachOperationalModule(upgraded, 'review-upgrade-test');
    expect(
      port.read(
        (db) =>
          db.prepare("SELECT bot_slug FROM tob_identity WHERE human_id = 'local-human'").get()
            ?.bot_slug,
      ),
    ).toBe('protected-tob');
    expect(
      port.read(
        (db) =>
          db
            .prepare('SELECT bot_slug FROM bot_creation_operations WHERE operation_key = ?')
            .get('create-a')?.bot_slug,
      ),
    ).toBe('created-bot');
    expect(
      port.read(
        (db) =>
          db
            .prepare('SELECT channel_id FROM channel_management_operations WHERE operation_key = ?')
            .get('group-a')?.channel_id,
      ),
    ).toBe('channel-a');
    const review = new GroupSendReview(port);
    expect(review.enabled('group-a')).toBe(false);
    review.configure('group-a', true);
    expect(review.enabled('group-a')).toBe(true);
    expect(
      port.read(
        (db) => db.prepare('SELECT COUNT(*) AS count FROM group_send_review_drafts').get()?.count,
      ),
    ).toBe(0);
  } finally {
    upgraded.close();
  }
});

it('refuses automatic recovery after restart or expiry and removes draft content on purge', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('original', 'Private original');
    const held = await tool('bot_send_message', { body: 'Private draft' });
    const owner = 'direct:ada';
    const draft = core.runtime.groupSendReview!.inspect(owner, channelId, held.draftId!)!;
    const database = attachOperationalModule(core.operationalDatabase, 'test');
    const input = {
      owner,
      channelId,
      sourceEventId: draft.sourceEventId,
      message: draft.current,
      draftId: draft.id,
    };
    const restarted = new GroupSendReview(database);
    expect(database.transaction((db) => restarted.check(db, input))?.reason).toBe('host-restarted');
    const expired = new GroupSendReview(database, () => new Date(draft.expires + 1));
    expect(database.transaction((db) => expired.check(db, input))?.status).toBe('expired');
    core.channels.deleteGroup(channelId);
    const preview = core.contentPurge.preview(OWNER_HUMAN_CONTEXT, channelId, [
      draft.sourceEventId,
    ]);
    core.contentPurge.confirm(
      OWNER_HUMAN_CONTEXT,
      channelId,
      preview.sourceEventIds,
      preview.token,
    );
    expect(core.runtime.groupSendReview!.inspect(owner, channelId, draft.id)).toBeUndefined();
    await expect(
      tool('bot_send_message', { body: 'Private draft', draft_id: draft.id }),
    ).rejects.toThrow();
  });
});

it('a Human stop invalidates a held Group draft so it can no longer be recovered or sent', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('question', 'What is the release date?');
    const read = await tool('channel_read', {});
    await human('correction', 'Use October 21, not October 20.');
    const held = await tool('bot_send_message', {
      body: 'October 20',
      observation_id: read.observationIds[channelId],
      end_turn: true,
    });
    expect(held.status).toBe('held');

    await core.runtime.stopTurn!('ada');

    expect(
      core.runtime.groupSendReview!.inspect('direct:ada', channelId, held.draftId!),
    ).toMatchObject({ state: 'dropped', terminationReason: 'stopped' });
    const fresh = await tool('channel_read', {});
    expect(
      await tool('bot_send_message', {
        body: 'October 21',
        draft_id: held.draftId,
        observation_id: fresh.observationIds[channelId],
        recover: true,
      }),
    ).toMatchObject({ status: 'refused', reason: 'draft-terminal' });
    expect(
      core.channels.readMessages(channelId).filter((message) => message.author.kind === 'bot'),
    ).toHaveLength(0);
  });
});

it('keeps a terminal draft terminal after its review window passes', async () => {
  await fixture(async ({ core, channelId, human, tool }) => {
    await human('question', 'What is the release date?');
    const read = await tool('channel_read', {});
    await human('correction', 'Use October 21, not October 20.');
    const held = await tool('bot_send_message', {
      body: 'October 20',
      observation_id: read.observationIds[channelId],
      end_turn: true,
    });
    await core.runtime.stopTurn!('ada');
    const owner = 'direct:ada';
    const draft = core.runtime.groupSendReview!.inspect(owner, channelId, held.draftId!)!;
    const database = attachOperationalModule(core.operationalDatabase, 'test');
    const later = new GroupSendReview(database, () => new Date(draft.expires + 1));

    expect(
      database.transaction((db) =>
        later.check(db, {
          owner,
          channelId,
          sourceEventId: draft.sourceEventId,
          message: draft.current,
          draftId: draft.id,
        }),
      ),
    ).toMatchObject({ status: 'expired', reason: 'draft-expired' });
    expect(later.drop(owner, channelId, draft.id)).toMatchObject({ status: 'expired' });
    expect(later.inspectRecords(owner, channelId, draft.id)).toMatchObject({
      drafts: [{ state: 'dropped', requiresRecovery: false }],
    });
    expect(later.inspect(owner, channelId, draft.id)).toMatchObject({
      state: 'dropped',
      terminationReason: 'stopped',
    });
  });
});
