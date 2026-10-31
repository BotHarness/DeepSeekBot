import { elsewhereAction } from '../src/client/bot-channel-post-line.js';
import { expect, it } from 'vitest';
import { parseChannelMessage, parseChannelRecord } from '../src/client/bridge.js';
import { botDmTitle, isHumanReadOnlyDmChannel } from '../src/client/channel-kind.js';

it('retains the remote Host identity when reading a Bot DM', () => {
  const message = parseChannelMessage({
    id: 'remote-message',
    at: '2026-11-01T00:00:00.000Z',
    body: 'Checked iOS',
    author: { kind: 'remote-bot', hostId: 'host-a', slug: 'ios' },
  });
  expect(message?.author).toEqual({ kind: 'remote-bot', hostId: 'host-a', slug: 'ios' });
});

it('keeps a remote Bot conversation in the existing Human read-only DM surface', () => {
  const channel = parseChannelRecord({
    id: 'dm-remote-test',
    type: 'dm',
    name: 'iOS colleague',
    members: ['caller'],
    remoteBot: { hostId: 'host_a', botSlug: 'ios', displayName: 'iOS colleague' },
  });
  expect(channel?.remoteBot?.hostId).toBe('host_a');
  expect(isHumanReadOnlyDmChannel(channel)).toBe(true);
  expect(botDmTitle(channel!, [])).toBe('caller ↔ iOS colleague');
  expect(
    elsewhereAction('posted', channel!.id, 'caller', [channel!], [], (_key, args) =>
      String(args?.name),
    ),
  ).toBe('iOS colleague');
});

it('projects only matching public remote contact facts into the conversation', () => {
  const record = {
    id: 'dm-remote-profile',
    type: 'dm',
    name: 'iOS',
    members: ['caller'],
    remoteBot: { hostId: 'mac', botSlug: 'ios', displayName: 'iOS' },
    remoteContact: {
      hostId: 'mac',
      botSlug: 'ios',
      displayName: 'iOS specialist',
      description: 'Checks iOS bugs',
      device: { model: null, platform: 'darwin' },
      capabilities: ['browser'],
      privateMemory: 'must not project',
    },
  };
  const contact = parseChannelRecord(record)?.remoteContact;
  expect(contact).toMatchObject({
    description: 'Checks iOS bugs',
    device: { model: null, platform: 'darwin' },
    capabilities: ['browser'],
  });
  expect(contact).not.toHaveProperty('privateMemory');
  expect(
    parseChannelRecord({ ...record, remoteContact: { ...record.remoteContact, hostId: 'foreign' } })
      ?.remoteContact,
  ).toBeUndefined();
});
