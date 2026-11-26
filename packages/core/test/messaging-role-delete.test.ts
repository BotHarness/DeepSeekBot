import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { afterEach, expect, it } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import { fixture, cleanup } from './messaging-default-traffic-fixtures.js';
import { reviewerSetup, type Fixture } from './messaging-pairing-text-fixtures.js';

afterEach(cleanup);

async function createRole(fx: Fixture, name: string) {
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  await methods.senderAccess({
    slug: 'ada',
    input: { kind: 'create-role', name, behavior: 'Temporary role.' },
  });
  const role = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (item) => item.name === name,
  )!;
  return { methods, role };
}

it('deletes an unused Role and clears it as the default approval Role', async () => {
  const fx = await fixture('slack');
  const { methods, role } = await createRole(fx, 'Spare');
  const before = await fx.core.externalMessaging.snapshot('ada');
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: {
        kind: 'default-role',
        roleId: role.id,
        expectedRevision: before.senderPolicy!.revision,
      },
    }),
  ).toMatchObject({ ok: true });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'delete-role', id: role.id, expectedRevision: role.revision + 1 },
    }),
  ).toMatchObject({ ok: false });
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'delete-role', id: role.id, expectedRevision: role.revision },
    }),
  ).toMatchObject({ ok: true });
  const after = await fx.core.externalMessaging.snapshot('ada');
  expect(after.roles!.some((item) => item.id === role.id)).toBe(false);
  expect(after.senderPolicy!.defaultRoleId).toBeUndefined();
  expect(after.senderPolicy!.revision).toBeGreaterThan(before.senderPolicy!.revision);
});

it('refuses to delete a Role that a paired person holds', async () => {
  const fx = await fixture('slack');
  await reviewerSetup(fx, 'slack', ['review-pairing']);
  const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, { ...fx.core });
  const reviewer = (await fx.core.externalMessaging.snapshot('ada')).roles!.find(
    (item) => item.name === 'Reviewer',
  )!;
  expect(
    await methods.senderAccess({
      slug: 'ada',
      input: { kind: 'delete-role', id: reviewer.id, expectedRevision: reviewer.revision },
    }),
  ).toMatchObject({ ok: false, error: { code: 'role-in-use' } });
  expect(
    (await fx.core.externalMessaging.snapshot('ada')).roles!.some(
      (item) => item.id === reviewer.id,
    ),
  ).toBe(true);
});
