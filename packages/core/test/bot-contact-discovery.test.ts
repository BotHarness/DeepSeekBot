import { createTestRegistry } from './registry-fixture.js';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';

import { botDmChannelId } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';

import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { discoverBotContacts } from '../src/runtime/bot-contact-discovery.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import type { BotAgentAdapter, OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

function adapter(onRun: (run: OrchestratorAgentRun) => Promise<void>): BotAgentAdapter {
  return {
    runOrchestrator: onRun,
    async runAssignment() {},
    requestAssignment(): never {
      throw new Error('No Assignment expected');
    },
    async close() {},
  };
}

async function exercise(
  count: number,
  onRun: (run: OrchestratorAgentRun, core: ReturnType<typeof createCore>) => Promise<void>,
) {
  let failure: unknown;
  const core = createCore({
    dshHome: createTempRoot('botharness-contact-discovery-'),
    agents: adapter(async (run) => {
      if (run.bot.slug === 'owner') {
        try {
          await onRun(run, core);
        } catch (error) {
          failure = error;
          throw error;
        }
      }
    }),
  });
  try {
    core.registry.create({ slug: 'owner', displayName: 'Owner' });
    const registry = createTestRegistry({
      rootDir: core.registry.rootDir,
      database: core.operationalDatabase,
    });
    for (let index = count - 1; index >= 0; index--) {
      expect(
        registry.create({
          slug: `colleague-${index.toString().padStart(3, '0')}`,
          displayName: index > 0 ? 'Same display name' : 'First colleague',
          description: `Roster ${index}. ${'Long profile '.repeat(80)} Description-only needle-${index}.`,
          persona: 'Private Soul must not be returned.',
        }).ok,
      ).toBe(true);
    }
    core.registry.create({ slug: 'paused', displayName: 'Paused' });
    core.registry.setPaused('paused', true);
    core.registry.create({ slug: 'removed', displayName: 'Removed' });
    await core.deletions.confirm('removed', core.deletions.preview('removed').token, false);
    const dm = core.channels.getOrCreateDm('owner', 'Owner')!;
    await core.channels.appendMessage(dm.id, {
      id: 'human-start',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Find a colleague',
    });
    core.runtime.admitDmMessage({
      channelId: dm.id,
      messageId: 'human-start',
      body: 'Find a colleague',
    });
    await core.runtime.whenIdle();
    if (failure !== undefined) throw failure;
  } finally {
    await core.runtime.close();
    core.operationalDatabase.close();
  }
}

describe('Orchestrator bounded contact discovery', () => {
  it('dispatches compiled DSH contact arguments under the live owning Agent Scope', async () => {
    let contactTool: ToolDefinition | undefined;
    let called = false;
    const failures: unknown[] = [];
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          try {
            contactTool = tools.find((tool) => tool.name === 'list_bot_contacts');
            if (contactTool === undefined) throw new Error('Contact Tool missing');
            const call = async (args: unknown) =>
              JSON.parse(String(await contactTool!.execute(args, {} as ToolRunContext)));
            const first = await call({ query: 'Colleague', limit: 1 });
            expect(first.contacts[0].botId).toBe('bea');
            const next = await call({ query: 'colleague', cursor: first.nextCursor });
            expect(next.contacts.map((contact: { botId: string }) => contact.botId)).toEqual([
              'cee',
            ]);
            expect((await call({ bot_id: 'cee' })).contacts[0].description).toBe('Detail profile');
            await expect(call({ limit: 1.5 })).rejects.toThrow();
            await expect(call({ query: 'Other', cursor: first.nextCursor })).rejects.toThrow(
              'invalid cursor',
            );
            await expect(call({ bot_id: 'cee', query: 'Colleague' })).rejects.toThrow(
              'cannot be combined',
            );
            called = true;
          } catch (error) {
            failures.push(error);
            throw error;
          }
        },
      },
    );
    const core = createCore({
      dshHome: createTempRoot('botharness-contact-tools-'),
      agents: createDshBotAgentAdapter({
        agents: host,
        orchestratorCwd: (bot) => '/memory/' + bot.slug,
        ensureWorkspace: () => undefined,
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      }),
    });
    try {
      core.registry.create({ slug: 'owner', displayName: 'Owner' });
      core.registry.create({ slug: 'bea', displayName: 'Colleague' });
      core.registry.create({
        slug: 'cee',
        displayName: 'Colleague',
        description: 'Detail profile',
      });
      const dm = core.channels.getOrCreateDm('owner', 'Owner')!;
      await core.channels.appendMessage(dm.id, {
        id: 'compiled',
        at: new Date().toISOString(),
        author: { kind: 'human' },
        body: 'Find colleagues',
      });
      core.runtime.admitDmMessage({
        channelId: dm.id,
        messageId: 'compiled',
        body: 'Find colleagues',
      });
      await core.runtime.whenIdle();
      expect(failures).toEqual([]);
      expect(called).toBe(true);
      await expect(contactTool!.execute({}, {} as ToolRunContext)).rejects.toThrow(
        'Orchestrator run is unavailable',
      );
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  });
  it.each([0, 3, 125])(
    'exhausts a %i-contact roster without duplicates or missing active identities',
    async (count) => {
      let checked = false;
      await exercise(count, async (run) => {
        const contacts = [];
        let cursor: string | undefined;
        do {
          const page = run.channels.contacts(cursor === undefined ? {} : { cursor });
          expect(JSON.stringify(page).length).toBeLessThanOrEqual(12_000);
          expect(page.contacts.length).toBeLessThanOrEqual(20);
          for (const contact of page.contacts) {
            expect(contact.description?.length).toBeLessThanOrEqual(160);
            expect(contact.descriptionTruncated).toBe(true);
            expect(JSON.stringify(contact)).not.toContain('Private Soul');
          }
          contacts.push(...page.contacts);
          cursor = page.nextCursor;
        } while (cursor !== undefined);
        expect(contacts.map((contact) => contact.botId)).toEqual(
          Array.from(
            { length: count },
            (_, index) => `colleague-${index.toString().padStart(3, '0')}`,
          ),
        );
        checked = true;
      });
      expect(checked).toBe(true);
    },
  );

  it('searches beyond previews, binds continuation to normalized filters and returns bounded detail', async () => {
    let checked = false;
    await exercise(25, async (run, core) => {
      const first = run.channels.contacts({ query: ' SAME DISPLAY NAME ', limit: 3 });
      expect(first.contacts.map((contact) => contact.botId)).toEqual([
        'colleague-001',
        'colleague-002',
        'colleague-003',
      ]);
      expect(() =>
        discoverBotContacts(core.registry, 'colleague-024', {
          query: 'same display name',
          cursor: first.nextCursor!,
        }),
      ).toThrow('invalid cursor');
      const second = run.channels.contacts({
        query: 'same display name',
        cursor: first.nextCursor!,
        limit: 5,
      });
      expect(second.contacts[0]?.botId).toBe('colleague-004');
      expect(() => run.channels.contacts({ query: 'First', cursor: first.nextCursor! })).toThrow(
        'invalid cursor',
      );
      expect(() => run.channels.contacts({ cursor: 'broken' })).toThrow('invalid cursor');
      for (const limit of [0, 51, 1.5, NaN, Infinity])
        expect(() => run.channels.contacts({ limit })).toThrow('integer from 1 to 50');
      expect(() => run.channels.contacts({ query: 'x'.repeat(201) })).toThrow('200 characters');
      const result = run.channels.contacts({ query: 'needle-24' });
      expect(result.contacts.map((contact) => contact.botId)).toEqual(['colleague-024']);
      expect(result.contacts[0]?.description).not.toContain('needle-24');
      const detail = run.channels.contacts({ botId: 'colleague-024' });
      expect(detail.contacts[0]?.description?.length).toBe(1_000);
      expect(detail.contacts[0]?.descriptionTruncated).toBe(true);
      expect(JSON.stringify(detail).length).toBeLessThanOrEqual(12_000);
      expect(() => run.channels.contacts({ botId: 'colleague-024', limit: 1 })).toThrow(
        'cannot be combined',
      );
      for (const botId of ['owner', 'paused', 'removed', 'missing'])
        expect(() => run.channels.contacts({ botId })).toThrow('active colleague');
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('bounds escaped names/descriptions while advancing from the last returned identity', async () => {
    let checked = false;
    await exercise(25, async (run, core) => {
      const registry = createTestRegistry({
        rootDir: core.registry.rootDir,
        database: core.operationalDatabase,
      });
      for (const bot of registry.list().filter((bot) => bot.slug.startsWith('colleague-'))) {
        registry.update(bot.slug, {
          displayName: '\u0001'.repeat(2_000),
          description: '\u0002'.repeat(3_000),
        });
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = run.channels.contacts({
          limit: 50,
          ...(cursor === undefined ? {} : { cursor }),
        });
        expect(JSON.stringify(page).length).toBeLessThanOrEqual(12_000);
        expect(page.contacts.length).toBeGreaterThan(0);
        expect(page.contacts.length).toBeLessThan(25);
        expect(
          page.contacts.every(
            (contact) => contact.displayNameTruncated && contact.descriptionTruncated,
          ),
        ).toBe(true);
        seen.push(...page.contacts.map((contact) => contact.botId));
        cursor = page.nextCursor;
      } while (cursor !== undefined);
      expect(new Set(seen).size).toBe(25);
      expect(seen).toHaveLength(25);
      expect(
        JSON.stringify(run.channels.contacts({ botId: 'colleague-024' })).length,
      ).toBeLessThanOrEqual(12_000);
      checked = true;
    });
    expect(checked).toBe(true);
  });

  it('uses a later-page ID for real DM, invitation and mention consumers and rejects a newly stale recipient', async () => {
    let checked = false;
    await exercise(25, async (run, core) => {
      const first = run.channels.contacts();
      const later = run.channels.contacts({ cursor: first.nextCursor! });
      const contact = later.contacts.find((contact) => contact.botId === 'colleague-024')!;
      expect(contact).toBeDefined();
      const sent = await run.channels.sendToBot({
        botSlug: contact.botId,
        body: 'Found you on a later page',
      });
      expect(sent.channelId).toBe(botDmChannelId('owner', contact.botId));
      expect(core.channels.readMessages(sent.channelId).map((message) => message.body)).toEqual([
        'Found you on a later page',
      ]);
      expect(
        core.channels
          .readMessages('dm-owner')
          .some((message) => message.botDmAction?.recipientBotSlug === contact.botId),
      ).toBe(true);
      const group = run.channels.createGroup('Discovered colleagues');
      const invitation = run.channels.inviteGroup({
        channelId: group.id,
        targetBotSlug: contact.botId,
      });
      expect(invitation.targetBotSlug).toBe(contact.botId);
      core.channels.respondToGroupInvite({
        invitationId: invitation.id,
        targetBotSlug: contact.botId,
        targetBotCreatedAt: core.registry.get(contact.botId)!.createdAt,
        accept: true,
      });
      await run.channels.send({
        channelId: group.id,
        body: 'Please check',
        mentionBotIds: [contact.botId],
      });
      expect(core.channels.readMessages(group.id)[0]?.mentions?.[0]?.botSlug).toBe(contact.botId);
      core.registry.setPaused(contact.botId, true);
      expect(() => run.channels.contacts({ botId: contact.botId })).toThrow('active colleague');
      await expect(
        run.channels.sendToBot({ botSlug: contact.botId, body: 'Must not commit' }),
      ).rejects.toThrow('active PersonaBot');
      expect(core.channels.readMessages(sent.channelId)).toHaveLength(1);
      checked = true;
    });
    expect(checked).toBe(true);
  });
});
