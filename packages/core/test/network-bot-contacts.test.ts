import { expect, it } from 'vitest';
import { discoverBotContacts } from '../src/runtime/bot-contact-discovery.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTempRoot } from './helpers.js';

it('finds same-named colleagues on distinct Hosts through bounded contact discovery', () => {
  const registry = createTestRegistry({ rootDir: createTempRoot('network-contacts-') });
  registry.create({ slug: 'owner', displayName: 'Owner' });
  registry.create({ slug: 'ios', displayName: 'iOS' });
  const colleagues = ['host-a', 'host-b'].map((hostId) => ({
    hostId,
    botSlug: 'ios',
    displayName: 'iOS',
    description: 'Investigates iOS bugs',
    device: { model: 'Mac mini', platform: 'darwin' },
    capabilities: ['computer'],
    memoryDir: '/private/memory',
    persona: 'Private SOUL',
  }));
  const first = discoverBotContacts(registry, 'owner', { query: 'Mac mini', limit: 1 }, colleagues);
  expect(first.contacts).toEqual([
    {
      botId: 'remote:host-a:ios',
      displayName: 'iOS',
      description: 'Investigates iOS bugs',
      hostId: 'host-a',
      botSlug: 'ios',
      device: { model: 'Mac mini', platform: 'darwin' },
      capabilities: ['computer'],
    },
  ]);
  const second = discoverBotContacts(
    registry,
    'owner',
    {
      query: 'Mac mini',
      cursor: first.nextCursor!,
    },
    colleagues,
  );
  expect(second.contacts.map((contact) => contact.botId)).toEqual(['remote:host-b:ios']);
  expect(second.nextCursor).toBeUndefined();
  expect(JSON.stringify(first)).not.toContain('private');
  expect(JSON.stringify(first)).not.toContain('SOUL');
  expect(
    discoverBotContacts(registry, 'owner', { botId: 'remote:host-b:ios' }, colleagues).contacts[0]
      ?.hostId,
  ).toBe('host-b');
});

it('keeps an escaped remote profile within the same output budget in detail and pagination', () => {
  const registry = createTestRegistry({ rootDir: createTempRoot('network-contact-budget-') });
  registry.create({ slug: 'owner', displayName: 'Owner' });
  const colleagues = [
    {
      hostId: 'host-a',
      botSlug: 'ios',
      displayName: '\u0001'.repeat(500),
      description: '\u0002'.repeat(3000),
      device: { model: '\u0003'.repeat(500), platform: '\u0004'.repeat(500) },
      capabilities: Array.from({ length: 20 }, (_, i) => String(i) + '\u0005'.repeat(100)),
    },
  ];
  const detail = discoverBotContacts(registry, 'owner', { botId: 'remote:host-a:ios' }, colleagues);
  expect(JSON.stringify(detail).length).toBeLessThanOrEqual(12000);
  const page = discoverBotContacts(registry, 'owner', {}, colleagues);
  expect(page.contacts).toHaveLength(1);
  expect(page.nextCursor).toBeUndefined();
  expect(JSON.stringify(page).length).toBeLessThanOrEqual(12000);
});
