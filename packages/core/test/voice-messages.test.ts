import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';

import { Context } from '@deepseek-ai/cordis';
import LocalCredentialProvider from '@deepseek-ai/dsh-credentials-local';
import { afterEach, describe, expect, it } from 'vitest';

import { attachmentIdentity } from '../src/attachments/ref.js';
import { createAttachmentStore } from '../src/attachments/store.js';
import type { ChannelMessage } from '../src/channels/channel.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createBotRuntime } from '../src/runtime/bot-runtime.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { createBotSubagentModelTools } from '../src/runtime/subagent-model-tools.js';
import { createSessionOwnership } from '../src/sessions/ownership.js';
import { createVoiceBridgeMethods } from '../src/voice/bridge.js';
import { createVoiceMessages } from '../src/voice/messages.js';
import { VoiceProviders } from '../src/voice/providers.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot, FIXED_NOW, trackTestOwner } from './helpers.js';
import { createTestRegistry } from './registry-fixture.js';
import { createTestWorkspaceGrants } from './workspace-grant-fixture.js';

const MP3 = Buffer.concat([Buffer.from('ID3'), Buffer.alloc(256, 7)]);
const cleanup: (() => Promise<void> | void)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
});

async function setup(status = 200, speak?: Parameters<typeof createVoiceMessages>[0]['speak']) {
  const spoken: string[] = [];
  const server = createServer((request, response) => {
    let raw = '';
    request.on('data', (chunk) => (raw += chunk));
    request.on('end', () => {
      spoken.push(String((JSON.parse(raw) as { input?: string }).input));
      response.writeHead(status, { 'Content-Type': status === 200 ? 'audio/mpeg' : 'text/plain' });
      response.end(status === 200 ? MP3 : 'quota exceeded');
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanup.push(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const home = createTempRoot('botharness-voice-messages-');
  const ctx = new Context();
  const fiber = ctx.plugin(LocalCredentialProvider, {
    path: join(home, '.credentials.yaml'),
    watch: false,
  });
  await fiber.await();
  cleanup.push(() => fiber.dispose());
  const owner = trackTestOwner(
    mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
  );
  const registry = createTestRegistry({ rootDir: join(home, 'bots'), now: FIXED_NOW });
  expect(registry.create({ slug: 'ada', displayName: 'Ada' }).ok).toBe(true);
  const attachments = createAttachmentStore({ rootDir: join(home, 'attachments') });
  const notifications: { messageId: string; message: ChannelMessage }[] = [];
  const channels = createSqliteChannelStore({
    database: attachOperationalModule(owner, 'channels'),
    rootDir: join(home, 'channels'),
    attachments,
    now: FIXED_NOW,
    onVoiceChanged: (_channelId, messageId, message) => notifications.push({ messageId, message }),
  });
  const dm = channels.getOrCreateDm('ada', 'Ada')!;
  const providers = new VoiceProviders({
    database: attachOperationalModule(owner, 'voice'),
    credentials: () => ctx.credentials,
  });
  const voiceMessages = createVoiceMessages({
    providers,
    bot: (slug) => registry.get(slug),
    channels,
    attachments: () => attachments,
    ...(speak === undefined ? {} : { speak }),
  });
  const bridge = createVoiceBridgeMethods({ providers, registry });
  const agents = createDshBotAgentAdapter({
    agents: new FakeAgentHost({ kind: 'completed' }),
    defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    orchestratorCwd: () => join(home, 'memory'),
    ensureWorkspace: () => undefined,
    subagentTools: () => createBotSubagentModelTools({} as Context, () => undefined),
  });
  const runtime = createBotRuntime({
    database: owner,
    ownership: createSessionOwnership(attachOperationalModule(owner, 'session-ownership')),
    grants: createTestWorkspaceGrants(owner, home),
    registry,
    channels,
    attachments,
    agents,
    voiceMessages,
    now: FIXED_NOW,
  });
  cleanup.push(() => runtime.close());
  const send = (args: Record<string, unknown>) =>
    runtime.runDirectBotTool!(
      'ada',
      'bot_send_message',
      { channel_id: dm.id, ...args },
      new AbortController().signal,
    );
  const bind = async () => {
    const added = await bridge.voiceProviderAdd({
      preset: 'custom',
      baseUrl: `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1`,
      defaultVoice: 'af_bella',
    });
    if (!added.ok) throw new Error(added.error.message);
    const bound = bridge.botVoiceSet({ slug: 'ada', providerId: added.value.provider.id });
    expect(bound.ok).toBe(true);
    return added.value.provider;
  };
  return { send, bind, channels, dm, spoken, notifications, attachments, bridge, registry };
}

describe('Bot voice messages', () => {
  it('commits the text and attaches synthesized audio when voice is true', async () => {
    const { send, bind, channels, dm, spoken, notifications, attachments } = await setup();
    await bind();
    const sent = await send({
      voice: true,
      body: 'All checks **passed**.\n\n```sh\npnpm test\n```',
    });
    const result = sent.result as { messageId: string; voice: Record<string, unknown> };
    expect(result).toMatchObject({ status: 'committed', voice: { status: 'ready' } });
    const message = channels.message(dm.id, result.messageId)!;
    expect(message.body).toBe('All checks **passed**.\n\n```sh\npnpm test\n```');
    expect(message.voice).toMatchObject({ state: 'ready' });
    expect(message.attachments).toHaveLength(1);
    const audio = message.attachments![0]!;
    expect(audio).toMatchObject({ mime: 'audio/mpeg', size: MP3.length });
    expect(message.voice!.attachment).toBe(attachmentIdentity(audio));
    expect(attachments.has(audio)).toBe(true);
    expect(spoken).toEqual(['All checks passed. (code is in the text)']);
    expect(notifications.map((entry) => entry.message.voice?.state)).toEqual(['pending', 'ready']);
    expect(channels.referencedAttachmentHashes().has(attachmentIdentity(audio))).toBe(true);
  });

  const eventually = async (check: () => boolean) => {
    for (let index = 0; index < 100 && !check(); index += 1)
      await new Promise((resolve) => setTimeout(resolve, 10));
    expect(check()).toBe(true);
  };

  it('stores the sentences a live call spoke as the voice attachment once playback ends, without a second synthesis', async () => {
    const played = new Uint8Array(Buffer.concat([Buffer.from('ID3'), Buffer.alloc(64, 3)]));
    const asked: { slug: string; channelId: string; body: string }[] = [];
    let finish!: (value: {
      clip?: { audio: Uint8Array; mime: string };
      interrupted: boolean;
    }) => void;
    const { send, bind, channels, dm, spoken } = await setup(200, async (input) => {
      asked.push({ slug: input.slug, channelId: input.channelId, body: input.body });
      return { archive: new Promise((resolve) => (finish = resolve)) };
    });
    await bind();
    const sent = await send({ voice: true, body: '明天会下雨。带上伞吧。' });
    const result = sent.result as { messageId: string; voice: { status: string } };
    expect(result.voice.status).toBe('speaking');
    expect(channels.message(dm.id, result.messageId)!.voice).toBeUndefined();
    finish({ clip: { audio: played, mime: 'audio/mpeg' }, interrupted: false });
    await eventually(() => channels.message(dm.id, result.messageId)!.voice?.state === 'ready');
    const message = channels.message(dm.id, result.messageId)!;
    expect(asked).toEqual([{ slug: 'ada', channelId: dm.id, body: '明天会下雨。带上伞吧。' }]);
    expect(spoken).toEqual([]);
    expect(message.attachments![0]).toMatchObject({ mime: 'audio/mpeg', size: played.length });
  });

  it('keeps no voice bar when the Human cut in before any sentence played', async () => {
    let finish!: () => void;
    const { send, bind, channels, dm, spoken } = await setup(200, async () => ({
      archive: new Promise((resolve) => (finish = () => resolve({ interrupted: true }))),
    }));
    await bind();
    const sent = await send({ voice: true, body: '第一句。第二句。' });
    const messageId = (sent.result as { messageId: string }).messageId;
    finish();
    await new Promise((resolve) => setTimeout(resolve, 50));
    const message = channels.message(dm.id, messageId)!;
    expect(message.body).toBe('第一句。第二句。');
    expect(message.voice).toBeUndefined();
    expect(message.attachments).toBeUndefined();
    expect(spoken).toEqual([]);
  });

  it('falls back to one synthesis when the call cannot finish the voice', async () => {
    const { VoiceError } = await import('../src/voice/providers.js');
    const { send, bind, channels, dm, spoken } = await setup(200, async () => {
      throw new VoiceError('provider-rate-limited', 'Out of quota.');
    });
    await bind();
    const sent = await send({ voice: true, body: '明天会下雨。' });
    const message = channels.message(dm.id, (sent.result as { messageId: string }).messageId)!;
    expect(spoken).toEqual(['明天会下雨。']);
    expect(message.voice).toMatchObject({ state: 'ready' });
  });

  it('synthesizes the whole message when the call archive fails after playback', async () => {
    const { VoiceError } = await import('../src/voice/providers.js');
    const { send, bind, channels, dm, spoken } = await setup(200, async () => ({
      archive: Promise.reject(new VoiceError('provider-rate-limited', 'Out of quota.')),
    }));
    await bind();
    const sent = await send({ voice: true, body: '明天会下雨。' });
    const messageId = (sent.result as { messageId: string }).messageId;
    await eventually(() => channels.message(dm.id, messageId)!.voice?.state === 'ready');
    expect(spoken).toEqual(['明天会下雨。']);
  });

  it('synthesizes the whole message when an uninterrupted call ends without a clip', async () => {
    const { send, bind, channels, dm, spoken } = await setup(200, async () => ({
      archive: Promise.resolve({ interrupted: false }),
    }));
    await bind();
    const sent = await send({ voice: true, body: '明天会下雨。' });
    const messageId = (sent.result as { messageId: string }).messageId;
    await eventually(() => channels.message(dm.id, messageId)!.voice?.state === 'ready');
    expect(spoken).toEqual(['明天会下雨。']);
  });

  it('sends exactly as before when voice is false', async () => {
    const { send, bind, channels, dm, spoken } = await setup();
    await bind();
    const sent = await send({ voice: false, body: 'Plain text.' });
    const result = sent.result as { messageId: string };
    expect(result).not.toHaveProperty('voice');
    const message = channels.message(dm.id, result.messageId)!;
    expect(message.voice).toBeUndefined();
    expect(message.attachments).toBeUndefined();
    expect(spoken).toEqual([]);
  });

  it('keeps the message and records a readable error when synthesis fails', async () => {
    const { send, bind, channels, dm } = await setup(429);
    await bind();
    const sent = await send({ voice: true, body: 'Still visible.' });
    const result = sent.result as { messageId: string; voice: Record<string, unknown> };
    expect(result.voice).toMatchObject({ status: 'failed', code: 'provider-rate-limited' });
    const message = channels.message(dm.id, result.messageId)!;
    expect(message.body).toBe('Still visible.');
    expect(message.attachments).toBeUndefined();
    expect(message.voice).toMatchObject({ state: 'failed', code: 'provider-rate-limited' });
    expect(message.voice!.error).toContain('quota exceeded');
  });

  it('tells the Bot to bind a voice first', async () => {
    const { send, channels, dm } = await setup();
    const sent = await send({ voice: true, body: 'No voice yet.' });
    const result = sent.result as { messageId: string; voice: Record<string, unknown> };
    expect(result.voice).toMatchObject({ status: 'failed', code: 'voice-not-configured' });
    expect(channels.message(dm.id, result.messageId)!.body).toBe('No voice yet.');
  });

  it('clears Bot bindings when their provider is removed', async () => {
    const { bind, bridge, registry } = await setup();
    const provider = await bind();
    expect(registry.get('ada')!.voice).toEqual({ providerId: provider.id });
    const removed = await bridge.voiceProviderRemove({ id: provider.id });
    expect(removed).toMatchObject({ ok: true, value: { clearedBots: ['ada'] } });
    expect(registry.get('ada')!.voice).toBeUndefined();
  });

  it('places voice before body in the tool schema', async () => {
    const { send } = await setup();
    await expect(send({ body: '' })).rejects.toBeDefined();
    const { createBotMessageTool } = await import('../src/runtime/bot-message-tool.js');
    const tool = createBotMessageTool(() => {
      throw new Error('unused');
    }) as unknown as { parameters: { properties?: Record<string, unknown> } };
    const keys = Object.keys(tool.parameters.properties ?? tool.parameters);
    expect(keys.indexOf('voice')).toBeGreaterThanOrEqual(0);
    expect(keys.indexOf('voice')).toBe(keys.indexOf('body') - 1);
  });
});
