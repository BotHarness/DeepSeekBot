import { describe, expect, it } from 'vitest';

import {
  botChannels,
  botProfileResource,
  loadBotProfile,
  loadMemoryFile,
  loadMemoryFiles,
  memoryEntries,
} from '../src/host/bot-profile';
import { parseProfileActivity, weekGlance } from '../src/host/bot-activity';
import { createHostClient } from '../src/host/client';
import { FakeHost } from './fake-host';
import hostWire from './fixtures/host-wire.json';
import profileWire from './fixtures/profile-wire.json';

const recordedActivity = hostWire.rpc.profileActivity[0]!.body.result.value;

const ROUTE = 'https://studio.tailnet-example.ts.net';

type Recorded = keyof typeof profileWire.rpc;
const recorded = (name: Recorded) => () => structuredClone(profileWire.rpc[name]);
const slug = profileWire.bot.slug;
const dm = `dm-${slug}`;

function host(): FakeHost {
  const fake = new FakeHost();
  fake.methods.set('memorySnapshot', recorded('memorySnapshot'));
  fake.methods.set('memoryFile', (args) =>
    structuredClone(
      profileWire.rpc.memoryFile[args['path'] as keyof typeof profileWire.rpc.memoryFile] ?? {},
    ),
  );
  fake.methods.set('scheduleList', recorded('scheduleList'));
  fake.methods.set('grants', recorded('grants'));
  return fake;
}

function client(fake: FakeHost) {
  return createHostClient({ routes: [ROUTE], credential: fake.credential, carrier: fake.carrier });
}

describe('Bot profile', () => {
  it('shows the previous profile during refresh, deduplicates reads and isolates Hosts', async () => {
    const fake = host();
    const connection = client(fake);
    const bot = { slug, dmChannelId: dm };
    const resource = botProfileResource(connection, bot);
    expect(resource.peek()).toBeUndefined();
    const first = await resource.refresh();
    expect(botProfileResource(connection, bot)).toBe(resource);
    let release: (() => void) | undefined;
    fake.methods.set(
      'scheduleList',
      () =>
        new Promise((done) => {
          release = () => done({ schedules: [] });
        }),
    );
    const refresh = resource.refresh();
    expect(resource.refresh()).toBe(refresh);
    expect(resource.peek()).toBe(first);
    await new Promise((done) => setTimeout(done, 0));
    expect(release).toBeDefined();
    release?.();
    expect((await refresh).routines).toEqual({ status: 'ready', value: [] });
    expect(botProfileResource(client(host()), bot).peek()).toBeUndefined();
    expect(
      botProfileResource(connection, { slug: 'another', dmChannelId: 'other' }).peek(),
    ).toBeUndefined();
  });

  it('keeps last successful sections with an explicit stale error when refresh fails', async () => {
    const fake = host();
    const resource = botProfileResource(client(fake), { slug, dmChannelId: dm });
    const first = await resource.refresh();
    fake.methods.set('memorySnapshot', () => {
      throw new Error('offline');
    });
    const next = await resource.refresh();
    expect(next.memory).toEqual({ ...first.memory, staleError: 'offline' });
    fake.methods.set('memorySnapshot', recorded('memorySnapshot'));
    expect((await resource.refresh()).memory).toEqual(first.memory);
  });

  it('reads the Soul, Core Memory, Memory files, routines and shared folders through the DM', async () => {
    const fake = host();
    const profile = await loadBotProfile(client(fake), { slug, dmChannelId: dm });

    expect(profile.identity).toEqual({
      status: 'ready',
      value: profileWire.rpc.memoryFile['SOUL.md'].file.body.trim(),
    });
    expect(profile.memory).toEqual({
      status: 'ready',
      value: { files: profileWire.rpc.memorySnapshot.snapshot.files },
    });
    expect(profile.routines).toEqual({
      status: 'ready',
      value: profileWire.rpc.scheduleList.schedules,
    });
    expect(
      profile.files.status === 'ready' && profile.files.value.map((grant) => grant.id),
    ).toEqual(
      profileWire.rpc.grants.grants
        .filter((grant) => !('revokedAt' in grant))
        .map((grant) => grant.id),
    );
    expect(fake.calls.map((call) => [call.method, call.args])).toEqual(
      expect.arrayContaining([
        ['memorySnapshot', { channelId: dm }],
        ['memoryFile', { channelId: dm, path: 'SOUL.md' }],
        ['scheduleList', { slug }],
        ['grants', { slug }],
      ]),
    );
    expect(fake.calls.some((call) => call.method === 'channelDm')).toBe(false);
  });

  it('opens the DM first when the Bot has none yet, and reports empty sections', async () => {
    const fake = new FakeHost();
    fake.methods.set('memorySnapshot', () => ({
      snapshot: { head: null, files: [], provisional: false, standing: [] },
    }));
    fake.methods.set('scheduleList', () => ({ schedules: [] }));
    fake.methods.set('grants', () => ({ grants: [] }));

    const profile = await loadBotProfile(client(fake), { slug: 'quiet', displayName: 'Quiet' });

    expect(profile).toEqual({
      identity: { status: 'ready', value: undefined },
      memory: { status: 'ready', value: { files: [] } },
      routines: { status: 'ready', value: [] },
      files: { status: 'ready', value: [] },
      activity: { status: 'ready', value: parseProfileActivity(recordedActivity) },
    });
    expect(fake.calls[0]).toEqual({
      method: 'channelDm',
      args: { slug: 'quiet', displayName: 'Quiet' },
    });
    expect(fake.calls.filter((call) => call.method === 'memoryFile')).toEqual([]);
  });

  it('keeps the other sections when one is refused', async () => {
    const fake = host();
    fake.methods.set('scheduleList', () => {
      throw new Error('Unknown PersonaBot');
    });

    const profile = await loadBotProfile(client(fake), { slug, dmChannelId: dm });

    expect(profile.routines).toEqual({ status: 'failed', error: 'Unknown PersonaBot' });
    expect(profile.identity.status).toBe('ready');
    expect(profile.memory.status).toBe('ready');
    expect(profile.files.status).toBe('ready');
  });

  it('lists the group Channels the Bot is a member of', () => {
    const channel = (id: string, members: string[]) => ({
      id,
      name: id,
      memberCount: members.length,
      members,
    });
    expect(
      botChannels(
        { bots: [], channels: [channel('team', [slug, 'other']), channel('ops', ['other'])] },
        slug,
      ).map((entry) => entry.id),
    ).toEqual(['team']);
    expect(botChannels(undefined, slug)).toEqual([]);
  });

  it('turns the Memory repository into a folder tree, folders first', () => {
    const files = profileWire.rpc.memorySnapshot.snapshot.files;
    expect(memoryEntries(files, '')).toEqual([
      { kind: 'folder', name: '.botharness', path: '.botharness', count: 2 },
      { kind: 'folder', name: 'notes', path: 'notes', count: 1 },
      { kind: 'file', name: '.gitattributes', path: '.gitattributes' },
      { kind: 'file', name: 'MEMORY.md', path: 'MEMORY.md' },
      { kind: 'file', name: 'SOUL.md', path: 'SOUL.md' },
    ]);
    expect(memoryEntries(files, 'notes')).toEqual([
      { kind: 'file', name: 'reading.md', path: 'notes/reading.md' },
    ]);
    expect(memoryEntries(['a/b/c.md', 'a/d.md'], 'a')).toEqual([
      { kind: 'folder', name: 'b', path: 'a/b', count: 1 },
      { kind: 'file', name: 'd.md', path: 'a/d.md' },
    ]);
    expect(memoryEntries(files, 'missing')).toEqual([]);
  });

  it('reads the file list and one file through the DM for the Memory browser', async () => {
    const fake = host();
    const hostClient = client(fake);

    expect(await loadMemoryFiles(hostClient, { slug, dmChannelId: dm })).toEqual(
      profileWire.rpc.memorySnapshot.snapshot.files,
    );
    expect(await loadMemoryFile(hostClient, { slug, dmChannelId: dm }, 'MEMORY.md')).toEqual(
      profileWire.rpc.memoryFile['MEMORY.md'].file,
    );
    expect(await loadMemoryFile(hostClient, { slug, dmChannelId: dm }, 'gone.md')).toBeUndefined();
    expect(fake.calls.at(-1)).toEqual({
      method: 'memoryFile',
      args: { channelId: dm, path: 'gone.md' },
    });
  });

  it('reads the last week of activity through the DM, and keeps the profile when it fails', async () => {
    const fake = host();
    const profile = await loadBotProfile(client(fake), { slug, dmChannelId: dm });
    expect(fake.calls).toContainEqual({
      method: 'profileActivity',
      args: { channelId: dm, weeks: 1 },
    });
    expect(profile.activity.status).toBe('ready');
    const glance = weekGlance(parseProfileActivity(recordedActivity));
    expect(glance.days.at(-1)).toBe(recordedActivity.today);
    expect(glance.total).toEqual({ status: 'ready', total: 207_439 });
    expect(glance.tokens.at(-1)).toBe(207_439);
    expect(glance.activity.at(-1)).toBe(4);
    expect(glance.quiet).toBe(false);

    fake.methods.set('profileActivity', () => {
      throw new Error('Unknown PersonaBot');
    });
    const failed = await loadBotProfile(client(fake), { slug, dmChannelId: dm });
    expect(failed.activity).toEqual({ status: 'failed', error: 'Unknown PersonaBot' });
    expect(failed.identity.status).toBe('ready');
    expect(failed.routines.status).toBe('ready');
  });
});
