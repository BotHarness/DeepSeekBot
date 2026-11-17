import { OWNER_HUMAN_CONTEXT, humanContext } from '../src/humans/context.js';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { humanAvatarVersion } from '../src/channels/channel.js';
import { createTempRoot } from './helpers.js';
import { attachOperationalModule } from '../src/database/owner.js';

const webp = (fill: number) => {
  const bytes = Buffer.alloc(64, fill);
  bytes.write('RIFF', 0, 'ascii');
  bytes.write('WEBP', 8, 'ascii');
  return `data:image/webp;base64,${bytes.toString('base64')}`;
};

describe('Human chat avatars', () => {
  it('sets, versions, shows to Channel members only and clears a Host-owned avatar', async () => {
    const home = createTempRoot('botharness-human-avatar-');
    const core = createCore({ dshHome: home });
    core.registry.create({ slug: 'ada', displayName: 'Ada' });
    const group = core.channels.createGroup(OWNER_HUMAN_CONTEXT, {
      name: 'Team room',
      members: ['ada'],
    });
    const database = attachOperationalModule(core.operationalDatabase, 'team');
    database.transaction(
      (db) => {
        db.prepare(`INSERT INTO humans VALUES ('mia', 'Mia', 'active', ?)`).run(
          new Date().toISOString(),
        );
      },
      ['team'],
    );
    const mia = humanContext('mia');
    try {
      const owner = createBridgeMethods(OWNER_HUMAN_CONTEXT, core);
      const member = createBridgeMethods(mia, core);
      const avatar = webp(1);
      expect(owner.humanAvatarSet({ avatar: 'https://example.com/me.png' })).toMatchObject({
        ok: false,
      });
      expect(owner.humanAvatarSet({ avatar })).toEqual({
        ok: true,
        value: expect.objectContaining({
          humanId: 'local-human',
          avatarVersion: humanAvatarVersion(avatar),
        }),
      });
      expect(owner.humanIdentity({})).toMatchObject({
        ok: true,
        value: { avatarVersion: humanAvatarVersion(avatar) },
      });
      expect(owner.humanAvatars({ humanIds: ['local-human'] })).toEqual({
        ok: true,
        value: {
          avatars: [{ humanId: 'local-human', version: humanAvatarVersion(avatar), avatar }],
        },
      });
      expect(core.channels.listHumanMembers(OWNER_HUMAN_CONTEXT, group.id)).toEqual([
        {
          humanId: 'local-human',
          displayName: expect.any(String),
          avatarVersion: humanAvatarVersion(avatar),
        },
      ]);

      expect(member.humanAvatars({ humanIds: ['local-human'] })).toEqual({
        ok: true,
        value: { avatars: [] },
      });
      database.transaction(
        (db) => {
          db.prepare(
            `INSERT INTO channel_human_members(channel_id, human_id, display_name, visible_from_revision, joined_at)
             VALUES (?, 'mia', 'Mia', 1, ?)`,
          ).run(group.id, new Date().toISOString());
        },
        ['channels'],
      );
      expect(member.humanAvatars({ humanIds: ['local-human', 'local-human'] })).toMatchObject({
        ok: true,
        value: { avatars: [{ humanId: 'local-human', avatar }] },
      });

      expect(owner.humanAvatarSet({ avatar: null })).toMatchObject({ ok: true });
      expect(owner.humanIdentity({})).toMatchObject({ ok: true });
      expect(
        (owner.humanIdentity({}) as { value: { avatarVersion?: string } }).value.avatarVersion,
      ).toBeUndefined();
      expect(member.humanAvatars({ humanIds: ['local-human'] })).toEqual({
        ok: true,
        value: { avatars: [] },
      });
      const wildcard = () =>
        database.read(
          (db) =>
            (
              db
                .prepare(`SELECT count(*) AS n FROM channel_changes WHERE channel_id = '*'`)
                .get() as { n: number }
            ).n,
        );
      const before = wildcard();
      expect(owner.humanAvatarSet({ avatar: webp(2) })).toMatchObject({ ok: true });
      expect(wildcard()).toBe(before + 1);
      expect(member.humanAvatars({ humanIds: ['local-human'] })).toMatchObject({
        value: { avatars: [{ humanId: 'local-human' }] },
      });
      core.channels.deleteGroup(group.id);
      expect(member.humanAvatars({ humanIds: ['local-human'] })).toEqual({
        ok: true,
        value: { avatars: [] },
      });
      expect(
        owner.humanAvatars({ humanIds: Array.from({ length: 65 }, (_, i) => `h${i}`) }),
      ).toMatchObject({ ok: false });
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
});
