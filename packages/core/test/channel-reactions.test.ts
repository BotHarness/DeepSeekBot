import { describe, expect, it } from 'vitest';

import { createBridgeMethods } from '../src/bridge/methods.js';
import { isReactionEmoji } from '../src/channels/channel.js';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';

async function fixture() {
  const home = createTempRoot('botharness-reactions-');
  const core = createCore({ dshHome: home });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const dm = core.channels.getOrCreateDm('ada', 'Ada')!;
  await core.channels.appendMessage(dm.id, {
    id: 'human-one',
    at: '2026-10-14T00:00:00.000Z',
    author: { kind: 'human' },
    body: 'Where is the launch checklist?',
  });
  await core.channels.appendMessage(dm.id, {
    id: 'bot-one',
    at: '2026-10-14T00:00:05.000Z',
    author: { kind: 'bot', slug: 'ada' },
    body: 'The launch checklist lives in docs/launch.md',
  });
  const methods = createBridgeMethods({ ...core });
  const close = async () => {
    await core.runtime.close();
    core.operationalDatabase.close();
  };
  return { home, core, dm, methods, close };
}

describe('Channel reactions', () => {
  it('accepts single emoji and refuses text', () => {
    for (const emoji of ['👍', '❤️', '🎉', '👍🏽', '🇨🇳', '👨‍👩‍👧'])
      expect(isReactionEmoji(emoji)).toBe(true);
    for (const value of ['', 'a', 'ok👍', '👍 ', '1', '👍'.repeat(9), 7])
      expect(isReactionEmoji(value)).toBe(false);
  });

  it('toggles the local Human reaction, projects it on reads and publishes it live', async () => {
    const { home, core, dm, methods, close } = await fixture();
    try {
      const response = core.live!.open(
        new Request(`http://localhost/api/botharness/stream?channelId=${dm.id}&after=2`),
      );
      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let opened = '';
      while (!opened.includes('channel/draft-baseline'))
        opened += decoder.decode((await reader.read()).value);

      const added = methods.channelReact({ channelId: dm.id, messageId: 'bot-one', emoji: '👍' });
      expect(added).toEqual({
        ok: true,
        value: { reactions: [{ emoji: '👍', actors: [{ kind: 'human', id: 'local-human' }] }] },
      });
      let frame = '';
      while (!frame.includes('channel/reaction'))
        frame += decoder.decode((await reader.read()).value);
      expect(frame).toContain('event: channel/reaction');
      expect(frame).toContain('"messageId":"bot-one"');
      await reader.cancel();

      expect(
        methods.channelReact({ channelId: dm.id, messageId: 'bot-one', emoji: '👍' }),
      ).toMatchObject({ ok: true, value: { reactions: [{ emoji: '👍' }] } });
      methods.channelReact({ channelId: dm.id, messageId: 'bot-one', emoji: '🎉' });
      expect(core.channels.message(dm.id, 'bot-one')?.reactions?.map((r) => r.emoji)).toEqual([
        '👍',
        '🎉',
      ]);
      const timeline = methods.channelTimeline({ channelId: dm.id });
      expect(timeline.ok && timeline.value.page.entries.at(-1)?.reactions).toHaveLength(2);
      expect(
        methods.channelReact({
          channelId: dm.id,
          messageId: 'bot-one',
          emoji: '👍',
          active: false,
        }),
      ).toEqual({
        ok: true,
        value: { reactions: [{ emoji: '🎉', actors: [{ kind: 'human', id: 'local-human' }] }] },
      });
    } finally {
      await close();
    }
    const reopened = createCore({ dshHome: home });
    try {
      const dm = reopened.channels.list().find((item) => item.type === 'dm')!;
      expect(reopened.channels.message(dm.id, 'bot-one')?.reactions).toEqual([
        { emoji: '🎉', actors: [{ kind: 'human', id: 'local-human' }] },
      ]);
    } finally {
      await reopened.runtime.close();
      reopened.operationalDatabase.close();
    }
  });

  it('refuses invalid targets and caps one message at 20 reactions', async () => {
    const { dm, methods, close } = await fixture();
    try {
      expect(
        methods.channelReact({ channelId: dm.id, messageId: 'bot-one', emoji: 'like' }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        methods.channelReact({ channelId: dm.id, messageId: 'missing', emoji: '👍' }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
      expect(
        methods.channelReact({ channelId: 'dm-missing', messageId: 'bot-one', emoji: '👍' }),
      ).toMatchObject({ ok: false, error: { code: 'not-found' } });
      const emoji = [...'😀😁😂🤣😃😄😅😆😉😊😋😎😍😘🥰😗😙🥲😚🙂'];
      for (const item of emoji)
        expect(
          methods.channelReact({ channelId: dm.id, messageId: 'human-one', emoji: item }).ok,
        ).toBe(true);
      expect(
        methods.channelReact({ channelId: dm.id, messageId: 'human-one', emoji: '🤗' }),
      ).toMatchObject({ ok: false, error: { message: expect.stringContaining('20') } });
    } finally {
      await close();
    }
  });
});

describe('Channel search', () => {
  it('pages case-insensitive matches newest first', async () => {
    const { dm, methods, close } = await fixture();
    try {
      const first = methods.channelSearch({ channelId: dm.id, text: 'LAUNCH', limit: 1 });
      expect(first.ok && first.value.messages.map((m) => m.id)).toEqual(['bot-one']);
      const cursor = first.ok ? first.value.nextCursor : undefined;
      expect(cursor).toBeTypeOf('string');
      const second = methods.channelSearch({ channelId: dm.id, text: 'launch', cursor, limit: 1 });
      expect(second.ok && second.value.messages.map((m) => m.id)).toEqual(['human-one']);
      expect(second.ok && second.value.nextCursor).toBeUndefined();
      expect(methods.channelSearch({ channelId: dm.id, text: 'nowhere' })).toEqual({
        ok: true,
        value: { messages: [] },
      });
      expect(methods.channelSearch({ channelId: dm.id, text: '  ' })).toMatchObject({
        ok: false,
        error: { code: 'invalid-input' },
      });
      expect(
        methods.channelSearch({ channelId: dm.id, text: 'launch', cursor: 'bogus' }),
      ).toMatchObject({ ok: false, error: { code: 'invalid-input' } });
    } finally {
      await close();
    }
  });

  it('hides group history from before the Human joined', async () => {
    const { core, methods, close } = await fixture();
    try {
      const group = core.channels.createGroup({ name: 'Team', members: ['ada'] });
      await core.channels.appendMessage(group.id, {
        id: 'bot-group',
        at: '2026-10-14T00:01:00.000Z',
        author: { kind: 'bot', slug: 'ada' },
        body: 'launch moved to Friday',
      });
      const found = methods.channelSearch({ channelId: group.id, text: 'launch' });
      expect(found.ok && found.value.messages.map((m) => m.id)).toEqual(['bot-group']);
      expect(
        core.channels.searchHumanMessages?.(group.id, { text: 'launch' })?.messages,
      ).toHaveLength(1);
      expect(
        core.channels.queryMessages(group.id, { text: 'launch', visibleFrom: 2 }).messages,
      ).toHaveLength(0);
    } finally {
      await close();
    }
  });
});
