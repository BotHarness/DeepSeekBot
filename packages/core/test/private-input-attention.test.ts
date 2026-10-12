import { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { createCore } from '../src/plugin.js';
import { PrivateInputs } from '../src/credentials/private-inputs.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createTempRoot } from './helpers.js';

const declaration = {
  account: 'controlled-account',
  purpose: 'Authenticate a controlled service',
  fields: [
    { id: 'key', label: 'Key', required: true },
    { id: 'password', label: 'Password', required: true },
  ],
};
const values = { key: 'synthetic-key-attention', password: ' synthetic password attention ' };

async function fixture() {
  const home = createTempRoot('bh-private-attention-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(home, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  let owner: PrivateInputs;
  const core = createCore({
    dshHome: home,
    activePrivateInputMessageIds: () => owner?.activeMessageIds() ?? [],
    agents: {
      async runOrchestrator() {},
      async runAssignment() {},
      async close() {},
      requestAssignment() {
        throw new Error('No Assignment expected');
      },
    },
  });
  const log = vi.fn();
  const deps = {
    channels: core.channels,
    ownership: core.ownership,
    registry: core.registry,
    credentials: () => ctx.credentials,
    isLive: () => true,
    canRequest: () => true,
    qualified: async () => true,
    log,
    changed: (slug: string, count: number) => core.states.setPrivateInputCount(slug, count),
  };
  owner = new PrivateInputs(deps);
  await owner.recover();
  const start = async (slug: string) => {
    core.registry.create({ slug, displayName: slug });
    const channel = core.channels.getOrCreateDm(slug, slug)!;
    const sessionId = 'private-' + slug;
    core.ownership.claim({
      sessionId,
      botSlug: slug,
      rootRole: 'orchestrator',
      at: new Date().toISOString(),
    });
    const agent = { session: { id: sessionId } } as Agent;
    const wait = owner.ask(
      agent,
      { ...declaration, account: slug + '-account' },
      new AbortController().signal,
    );
    await vi.waitFor(() => expect(core.channels.readMessages(channel.id)).toHaveLength(1));
    return {
      agent,
      wait,
      channelId: channel.id,
      id: core.channels.readMessages(channel.id)[0]!.id,
    };
  };
  return {
    core,
    owner,
    log,
    start,
    replacement: () => new PrivateInputs(deps),
    close: async () => {
      await owner.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      await fiber.dispose();
    },
  };
}

describe('private input committed attention and admission', () => {
  it('rechecks cancellation inside the canonical SQLite commit and leaves no usable grant', async () => {
    const f = await fixture();
    let release!: () => void;
    try {
      const a = await f.start('ada');
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const append = f.core.channels.appendMessageOnce.bind(f.core.channels);
      vi.spyOn(f.core.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return append(...args);
      });
      const submit = f.owner.submit(true, { channelId: a.channelId, messageId: a.id, values });
      await entry;
      const cancel = f.owner.cancel(true, a.channelId, a.id);
      release();
      expect(await submit).toBe(false);
      expect(await cancel).toBe(true);
      expect(await a.wait).toMatchObject({ status: 'cancelled', references: {} });
      expect(
        f.core.channels.message(a.channelId, 'private-resolution-' + a.id)?.privateInputResolution,
      ).toMatchObject({ state: 'cancelled', references: {} });
      expect(f.core.humanAttention.actionSummary().count).toBe(0);
    } finally {
      release?.();
      await f.close();
    }
  });

  it('retains a configured grant when the persistence response fails after its commit', async () => {
    const f = await fixture();
    try {
      const a = await f.start('ada');
      const append = f.core.channels.appendMessageOnce.bind(f.core.channels);
      vi.spyOn(f.core.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
        await append(...args);
        throw new Error('Lost response after commit');
      });
      expect(await f.owner.submit(true, { channelId: a.channelId, messageId: a.id, values })).toBe(
        true,
      );
      const result = await a.wait;
      expect(result.status).toBe('configured');
      expect(
        await f.owner.consume(a.agent, 'ada-account', result.references, async (resolved) => ({
          ...resolved,
        })),
      ).toEqual(values);
      expect(f.core.humanAttention.actionSummary().count).toBe(0);
    } finally {
      await f.close();
    }
  });

  it('projects separate Bot/account cards and clears each committed outcome without admitting a Human message', async () => {
    const f = await fixture();
    try {
      const a = await f.start('ada');
      const b = await f.start('bea');
      expect(
        f.core.humanAttention
          .list({ category: 'action' })
          .items.sort((left, right) => right.botSlug.localeCompare(left.botSlug)),
      ).toMatchObject([
        {
          kind: 'private-input',
          botSlug: 'bea',
          messageId: b.id,
          summary: 'bea-account · Authenticate a controlled service',
        },
        {
          kind: 'private-input',
          botSlug: 'ada',
          messageId: a.id,
          summary: 'ada-account · Authenticate a controlled service',
        },
      ]);
      expect(f.core.humanAttention.actionSummary().count).toBe(2);
      expect(f.core.states.snapshot('ada').attention?.privateInputCount).toBe(1);
      const accepted = await Promise.all([
        f.owner.submit(true, { channelId: a.channelId, messageId: a.id, values }),
        f.owner.submit(true, { channelId: a.channelId, messageId: a.id, values }),
      ]);
      expect(accepted.sort()).toEqual([false, true]);
      expect((await a.wait).status).toBe('configured');
      expect(f.core.humanAttention.list({ category: 'action' }).items).toMatchObject([
        { botSlug: 'bea', messageId: b.id },
      ]);
      expect(f.core.states.snapshot('ada').attention?.privateInputCount).toBeUndefined();
      expect(f.core.states.snapshot('bea').attention?.privateInputCount).toBe(1);
      expect(await f.owner.cancel(true, b.channelId, b.id)).toBe(true);
      expect((await b.wait).status).toBe('cancelled');
      expect(f.core.humanAttention.actionSummary().count).toBe(0);
      expect(f.core.states.snapshot('bea').attention?.privateInputCount).toBeUndefined();
      const rows = attachOperationalModule(f.core.operationalDatabase, 'messaging').read((db) =>
        db
          .prepare(`SELECT count(*) AS count FROM inbox_admissions a JOIN source_events e
          ON e.source_event_id = a.source_event_id
          WHERE json_extract(e.payload_json, '$.privateInputResolution') IS NOT NULL`)
          .all(),
      );
      expect(rows).toEqual([{ count: 0 }]);
      const visible = JSON.stringify({
        messages: [
          ...f.core.channels.readMessages(a.channelId),
          ...f.core.channels.readMessages(b.channelId),
        ],
        logs: f.log.mock.calls,
      });
      for (const value of Object.values(values)) expect(visible).not.toContain(value);
    } finally {
      await f.close();
    }
  });

  it('does not publish pending attention until persistence and expires lost history without a new Inbox admission', async () => {
    const f = await fixture();
    let release!: () => void;
    try {
      let entered!: () => void;
      const entry = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const append = f.core.channels.appendMessageOnce.bind(f.core.channels);
      vi.spyOn(f.core.channels, 'appendMessageOnce').mockImplementationOnce(async (...args) => {
        entered();
        await gate;
        return append(...args);
      });
      const starting = f.start('ada');
      await entry;
      expect(f.core.humanAttention.actionSummary().count).toBe(0);
      expect(f.core.states.snapshot('ada').attention?.privateInputCount).toBeUndefined();
      release();
      const a = await starting;
      expect(f.core.humanAttention.actionSummary().count).toBe(1);
      expect(await f.owner.cancel(true, a.channelId, a.id)).toBe(true);
      await a.wait;
      const lostId = randomUUID();
      await f.core.channels.appendMessageOnce(a.channelId, {
        id: lostId,
        at: new Date().toISOString(),
        author: { kind: 'bot', slug: 'ada' },
        body: declaration.purpose,
        privateInputRequest: { ...declaration, sessionId: 'lost-session' },
      });
      const replacement = f.replacement();
      try {
        await replacement.recover();
        expect(replacement.status(a.channelId, lostId)).toBe('expired');
        expect(f.core.humanAttention.actionSummary().count).toBe(0);
        const expired = f.core.channels.message(a.channelId, 'private-resolution-' + lostId)!;
        expect(expired.privateInputResolution?.state).toBe('expired');
        expect(expired.deliveries).toBeUndefined();
      } finally {
        await replacement.close();
      }
    } finally {
      release?.();
      await f.close();
    }
  });
});
