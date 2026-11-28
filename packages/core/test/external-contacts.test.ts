import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { observeContact } from '../src/messaging/contact-identity.js';
import { blockSender, sourceBlocked } from '../src/messaging/permissions/sender-blocks.js';
import { cleanup, dm, fixture } from './messaging-default-traffic-fixtures.js';
import { directMessage } from './messaging-pairing-text-fixtures.js';
import { cleanup as cleanupTeam, enabledFixture } from './team-mode-fixtures.js';

afterEach(cleanup);
afterEach(cleanupTeam);

const actorId = 'U54321';

async function setup() {
  const fx = await fixture('slack', [], 'T12345');
  const { core } = fx;
  const methods = createBridgeMethods(owner, core);
  const database = attachOperationalModule(core.operationalDatabase, 'external-contacts-test');
  const addApp = (
    slug: string,
    account: string,
    platform: 'slack' | 'feishu',
    workspace: string,
  ) => {
    if (!core.registry.get(slug))
      expect(core.registry.create({ slug, displayName: slug }).ok).toBe(true);
    const id = crypto.randomUUID();
    const fingerprint = account.padEnd(64, 'f');
    const event = {
      ...(platform === 'feishu'
        ? dm('contact', { actor: { kind: 'user', id: actorId } })
        : directMessage('slack', 'contact', actorId)),
      botId: account,
      fingerprint,
    };
    database.transaction((db) => {
      db.prepare(`INSERT INTO messaging_bindings
        (id, bot_slug, provider_id, platform, account_ref, fingerprint, created_at, display_name, contact_workspace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id,
        slug,
        `dsh-im/${platform}`,
        platform,
        account,
        fingerprint,
        event.at,
        account,
        workspace,
      );
      observeContact(db, id, slug, event);
    });
    return { id, event };
  };
  return { ...fx, methods, database, addApp };
}

it('groups verified workspace identities across Bots while separating platforms and workspaces', async () => {
  const fx = await setup();
  fx.addApp('bea', 'feishu-1', 'feishu', 'verified-lark-workspace');
  fx.addApp('cy', 'feishu-2', 'feishu', 'verified-lark-workspace');
  fx.addApp('bea', 'slack-1', 'slack', 'T12345');
  fx.addApp('cy', 'slack-2', 'slack', 'T12345');
  fx.addApp('da', 'slack-3', 'slack', 'T98765');
  const result = await fx.methods.externalContacts({});
  expect(result).toMatchObject({ ok: true });
  if (!result.ok) throw new Error(result.error.code);
  expect(result.value.contacts).toHaveLength(3);
  expect(result.value.contacts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        platform: 'feishu',
        bots: [expect.objectContaining({ slug: 'bea' }), expect.objectContaining({ slug: 'cy' })],
      }),
      expect.objectContaining({
        platform: 'slack',
        workspaceId: 'T12345',
        bots: [expect.objectContaining({ slug: 'bea' }), expect.objectContaining({ slug: 'cy' })],
      }),
    ]),
  );
});

it('observes ordinary inbound users and shares one Bot-wide block across list scopes and Apps', async () => {
  const fx = await setup();
  await fx.receive(directMessage('slack', 'contact', actorId));
  const second = fx.addApp('ada', 'slack-2', 'slack', 'T12345');
  const other = fx.addApp('bea', 'slack-3', 'slack', 'T12345');
  const read = await fx.methods.externalContacts({ botSlugs: ['ada'] });
  if (!read.ok || !read.value.contacts[0]) throw new Error('Contact missing');
  const contactId = read.value.contacts[0].id;
  expect(read.value.contacts[0].accessibleBotSlugs).toEqual(['ada', 'bea']);
  expect(read.value.contacts[0].bots.map(({ slug }) => slug)).toEqual(['ada']);
  const change = (blocked: boolean) =>
    fx.methods.externalContactBlock({ slug: 'ada', contactId, blocked });

  expect(await change(true)).toEqual({ ok: true, value: { blocked: true } });
  expect(await fx.methods.externalContacts({ status: 'blocked', botSlugs: ['ada'] })).toMatchObject(
    {
      ok: true,
      value: {
        contacts: [
          { id: contactId, bots: [{ slug: 'ada', status: 'blocked', personBlocked: true }] },
        ],
      },
    },
  );
  expect(fx.database.read((db) => sourceBlocked(db, 'ada', second.event))).toBe(true);
  expect(fx.database.read((db) => sourceBlocked(db, 'bea', other.event))).toBe(false);
  expect(await change(false)).toEqual({ ok: true, value: { blocked: false } });
  expect(await fx.methods.externalContacts({ status: 'blocked' })).toEqual({
    ok: true,
    value: { contacts: [] },
  });
});

it('keeps the exact legacy App-scoped effect when the Bot-wide block is set and cleared', async () => {
  const fx = await setup();
  const first = fx.addApp('bea', 'slack-1', 'slack', 'T12345');
  const second = fx.addApp('bea', 'slack-2', 'slack', 'T12345');
  fx.database.transaction((db) => blockSender(db, 'bea', { bindingId: first.id, actorId }));
  const result = await fx.methods.externalContacts({});
  if (!result.ok || !result.value.contacts[0]) throw new Error('Contact missing');
  const contact = result.value.contacts[0];
  expect(contact.bots).toMatchObject([
    { status: 'blocked', personBlocked: false, hasLegacyBlock: true },
  ]);
  for (const blocked of [true, false]) {
    expect(
      await fx.methods.externalContactBlock({ slug: 'bea', contactId: contact.id, blocked }),
    ).toMatchObject({ ok: true });
  }
  expect(fx.database.read((db) => sourceBlocked(db, 'bea', first.event))).toBe(true);
  expect(fx.database.read((db) => sourceBlocked(db, 'bea', second.event))).toBe(false);
});

it('refuses contact discovery and mutation to an ordinary member and scopes im.bind to owned Bots', async () => {
  const f = await enabledFixture();
  const member = f.methods(f.human);
  expect(await member.externalContacts({})).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  const input = { slug: 'someone-elses-bot', contactId: 'a'.repeat(64), blocked: true };
  expect(await member.externalContactBlock(input)).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
  f.registry.create({ slug: input.slug, displayName: input.slug, ownerHumanId: owner.humanId });
  const role = f.team.roles.create(owner, 'Bind IM Apps', ['im.bind']).role;
  f.team.roles.set(owner, f.human.humanId, [role.roleId]);
  expect(await member.externalContacts({ botSlugs: [input.slug] })).toEqual({
    ok: true,
    value: { contacts: [] },
  });
  expect(await member.externalContactBlock(input)).toMatchObject({
    ok: false,
    error: { code: 'permission-required' },
  });
});
