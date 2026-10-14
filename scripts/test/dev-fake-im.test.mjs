import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as tick } from 'node:timers/promises';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';

import { createCore } from '../../packages/core/src/plugin.ts';
import { attachOperationalModule } from '../../packages/core/src/database/owner.ts';
import { createDshImProvider } from '../../packages/core/src/messaging/dsh-im.ts';
import {
  FAKE_IM_ACCOUNT,
  FAKE_IM_PLATFORMS,
  createFakeDshIm,
  fakeImEvent,
  fakeImFingerprint,
  fakeImPatch,
  fakeImSpool,
} from '../dev-fake-im.mjs';

const cores = [];
afterEach(async () => {
  for (const core of cores.splice(0)) {
    core.externalMessaging.close();
    await core.runtime.close();
    core.operationalDatabase.close();
  }
});

async function boundFake(platform) {
  const agents = {
    async runOrchestrator() {},
    async runAssignment() {},
    requestAssignment: () => ({ delivery: 'steer' }),
    async stopAssignment() {},
    async close() {},
  };
  const core = createCore({ dshHome: mkdtempSync(join(tmpdir(), 'fake-im-')), agents });
  cores.push(core);
  expect(core.registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const record = [];
  const fake = createFakeDshIm({ platform, record: (entry) => record.push(entry) });
  const provider = createDshImProvider(fake.service, platform);
  expect(provider).toBeDefined();
  core.externalMessaging.register(provider);
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: `dsh-im/${platform}`,
    accountRef: FAKE_IM_ACCOUNT,
    fingerprint: fakeImFingerprint(platform),
  });
  const settle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
    await tick();
  };
  await settle();
  const query = (sql) =>
    attachOperationalModule(core.operationalDatabase, 'test').read((db) => db.prepare(sql).all());
  return {
    fake,
    record,
    async deliver(event) {
      const result = await fake.deliver(event);
      await settle();
      return result;
    },
    admissions: () =>
      query(
        "SELECT a.reason, json_extract(e.payload_json, '$.external.event.messageId') AS messageId FROM inbox_admissions a JOIN source_events e USING(source_event_id)",
      ),
    entries: () =>
      query(
        "SELECT json_extract(body, '$.origin') AS origin, json_extract(body, '$.receiveScope.kind') AS kind FROM messaging_grants",
      ),
  };
}

describe('dev fake IM Provider', () => {
  it.each(FAKE_IM_PLATFORMS)(
    '%s passes the dshIm contract and admits a bound DM',
    async (platform) => {
      const fx = await boundFake(platform);
      expect(fx.fake.consumers).toBe(1);
      const dm = fakeImEvent({ platform, text: 'hello', id: 'dm-1' });
      expect(await fx.deliver(dm)).toEqual({ accepted: true });
      expect(fx.admissions()).toEqual([{ reason: 'human-dm', messageId: dm.messageId }]);
      expect(fx.entries()).toEqual([{ origin: 'implicit', kind: 'dm' }]);
    },
  );

  it.each(['feishu', 'slack', 'discord'])(
    '%s admits a group mention and leaves unmentioned chatter out',
    async (platform) => {
      const fx = await boundFake(platform);
      await fx.deliver(fakeImEvent({ platform, text: 'chatter', group: true, mention: false }));
      const mention = fakeImEvent({ platform, text: 'question', group: true, id: 'g-1' });
      await fx.deliver(mention);
      expect(fx.admissions()).toEqual([{ reason: 'group-mention', messageId: mention.messageId }]);
      expect(fx.entries()).toEqual([{ origin: 'implicit', kind: 'group' }]);
    },
  );

  it('refuses shapes a real Provider never delivers', () => {
    expect(() => fakeImEvent({ platform: 'weixin', text: 'x', group: true })).toThrow(/owner DMs/);
    expect(() => fakeImEvent({ platform: 'feishu', text: 'x', mention: true })).toThrow(/--group/);
    expect(() => fakeImEvent({ platform: 'line', text: 'x' })).toThrow(/platform/);
  });

  it('records checked replies and honours the send fence', async () => {
    const { service } = createFakeDshIm({ platform: 'feishu', record: () => {} });
    const route = { messageId: 'm', conversationId: 'c', actorId: 'a' };
    const signal = new AbortController().signal;
    const options = { expectedFingerprint: fakeImFingerprint('feishu'), signal };
    await expect(service.replyChecked(FAKE_IM_ACCOUNT, route, 'hi', options)).resolves.toEqual({
      sent: true,
      receipt: { version: 1, messageId: 'fake-reply-m', conversationId: 'c' },
    });
    await expect(
      service.replyChecked(FAKE_IM_ACCOUNT, route, 'hi', { ...options, beforeSend: () => false }),
    ).rejects.toMatchObject({ code: 'stale-route' });
  });

  it('builds a launch Patch that inserts only this Plugin with a task-owned spool', () => {
    const home = join(tmpdir(), 'fake-im-home');
    const [entry] = parse(fakeImPatch({ home, platform: 'slack' }));
    const [plugin] = entry.insert;
    expect(plugin.id).toBe('botharness-dev-fake-im');
    expect(plugin.name).toMatch(/scripts\/dev-fake-im\.mjs$/);
    expect(plugin.config).toEqual({ spool: fakeImSpool(home, 'slack'), platform: 'slack' });
  });
});
