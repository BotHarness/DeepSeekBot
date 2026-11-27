import { afterEach, expect, it } from 'vitest';
import { DEFAULT_CHANNEL_POLICY } from '../src/team-policy/channel-contract.js';
import { allowsBotMention } from '../src/team-policy/channel-access.js';
import { OWNER_HUMAN_CONTEXT as owner } from '../src/humans/context.js';
import { cleanup, enabledFixture } from './team-mode-fixtures.js';

afterEach(cleanup);

const selectedRoles = { kind: 'roles' as const, roleIds: ['research'] };
const denyWake = {
  ...DEFAULT_CHANNEL_POLICY,
  overrides: [
    { roleId: 'research', actions: { wakeBot: 'allow' as const } },
    { roleId: 'paused', actions: { wakeBot: 'deny' as const } },
  ],
};

it('intersects the Bot audience with the Channel action and gives matching role denials priority', () => {
  expect(allowsBotMention(denyWake, selectedRoles, new Set(['research']), false)).toBe(true);
  expect(allowsBotMention(denyWake, selectedRoles, new Set(['research', 'paused']), false)).toBe(
    false,
  );
  expect(allowsBotMention(denyWake, selectedRoles, new Set(), false)).toBe(false);
  expect(allowsBotMention(denyWake, selectedRoles, new Set(), true)).toBe(false);
  expect(allowsBotMention(denyWake, { kind: 'admins' }, new Set(), false)).toBe(false);
  expect(allowsBotMention(denyWake, { kind: 'admins' }, new Set(['paused']), true)).toBe(true);
});

it('keeps denied mentions visible and keeps the no-response list local to one Channel', async () => {
  const f = await enabledFixture();
  const botSlug = 'studio';
  f.registry.create({ slug: botSlug, displayName: 'Studio', ownerHumanId: owner.humanId });
  const a = f.channels.createGroup(owner, { name: 'A', members: [botSlug] }).id;
  const b = f.channels.createGroup(owner, { name: 'B', members: [botSlug] }).id;
  for (const channelId of [a, b]) f.team.channelAccess.addMember(owner, channelId, f.human.humanId);
  f.channels.setGroupWakePolicy!(a, botSlug, { mode: 'all', count: 1, intervalSeconds: 1 });
  const settings = (change: unknown) =>
    f.methods(owner).channelBotSettings({ channelId: a, botSlug, change });
  const send = async (channelId: string, marker: string, human = f.human, mention = true) => {
    const result = await f.methods(human).channelSend({
      channelId,
      body: mention ? `@Studio ${marker}` : marker,
      ...(mention ? { mentions: [{ botSlug, label: 'Studio', start: 0, end: 7 }] } : {}),
    });
    expect(result).toMatchObject({ ok: true });
    const message = f.channels.readMessages(channelId).find((row) => row.body.endsWith(marker));
    expect(message).toBeDefined();
    return message?.deliveries ?? [];
  };
  const adminsOnly = { kind: 'audience', audience: { kind: 'admins' } };
  expect(
    await f.methods(f.human).channelBotSettings({ channelId: a, botSlug, change: adminsOnly }),
  ).toMatchObject({ ok: false, error: { code: 'permission-required' } });
  expect(await settings(adminsOnly)).toMatchObject({ ok: true });
  expect(await send(a, 'member-admins-only')).toEqual([]);
  expect(await send(a, 'admin-admins-only', owner)).toMatchObject([{ botSlug }]);
  await settings({ kind: 'audience', audience: { kind: 'everyone' } });
  const block = (blocked: boolean) =>
    settings({ kind: 'block', humanId: f.human.humanId, blocked });
  expect(await block(true)).toMatchObject({
    ok: true,
    value: { bots: [{ blockedHumanIds: [f.human.humanId] }] },
  });
  expect(await send(a, 'blocked-a')).toEqual([]);
  expect(await send(a, 'blocked-a-ordinary', f.human, false)).toEqual([]);
  expect(await send(b, 'permitted-b')).toMatchObject([{ botSlug }]);
  expect(await block(false)).toMatchObject({
    ok: true,
    value: { bots: [{ blockedHumanIds: [] }] },
  });
  expect(await send(a, 'permitted-a')).toMatchObject([{ botSlug }]);
});
