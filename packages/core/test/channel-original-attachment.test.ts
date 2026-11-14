import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { nativeFileToolDenial, nativeExecutionRoot } from '../src/workspaces/grant-native-tools.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import type { ChannelAttachmentRef } from '../src/attachments/ref.js';

const call = async (tools: readonly ToolDefinition[], name: string, args: unknown) => {
  const tool = tools.find((candidate) => candidate.name === name);
  if (tool === undefined) throw new Error('Tool is missing: ' + name);
  return tool.execute(args, { signal: new AbortController().signal } as ToolRunContext);
};

async function scenario(missing: boolean) {
  const home = createTempRoot('bh-original-edit-');
  let channelId = '';
  let groupId = '';
  let original!: ChannelAttachmentRef;
  let independent!: ChannelAttachmentRef;
  let sessionId = '';
  let originalPath = '';
  let turns = 0;
  const errors: unknown[] = [];
  const host = new FakeAgentHost(
    { kind: 'completed' },
    {
      onTurn: async (session, tools) => {
        turns++;
        sessionId = session.id;
        try {
          const input = { message_id: 'source', file_id: original.fileId, access: 'read' };
          await expect(
            call(tools, 'channel_attachment_open', { ...input, file_id: independent.fileId }),
          ).rejects.toThrow(/not attached/);
          await expect(
            call(tools, 'channel_attachment_open', { ...input, message_id: 'missing' }),
          ).rejects.toThrow(/Source message/);
          const opened = JSON.parse(
            String(await call(tools, 'channel_attachment_open', input)),
          ) as { path: string };
          originalPath = opened.path;
          expect(readFileSync(originalPath, 'utf8')).toBe('status=pending\n');
          const native = (name: string, path = originalPath) =>
            nativeFileToolDenial(core, session as never, name, { file_path: path });
          expect(native('read')).toBeUndefined();
          expect(() => native('write')).toThrow(/explicit edit-original/);
          expect(native('write', core.attachments.fileTarget(independent.fileId!).path)).toMatch(
            /outside/,
          );
          expect(native('write', join(dirname(originalPath), 'other.txt'))).toMatch(/outside/);
          expect(
            core.runtime.originalAttachmentRoot?.('another-session', originalPath, 'read'),
          ).toBeUndefined();
          await call(tools, 'channel_attachment_open', { ...input, access: 'edit-original' });
          expect(native('edit')).toBeUndefined();
          expect(
            nativeExecutionRoot(core, session as never, 'edit', { file_path: originalPath }),
          ).toBe(dirname(originalPath));
          const db = attachOperationalModule(core.operationalDatabase, 'original-edit-test');
          const counts = () =>
            db.read((sql) => [
              sql.prepare('SELECT count(*) AS n FROM source_events').get(),
              sql.prepare('SELECT count(*) AS n FROM inbox_admissions').get(),
            ]);
          const before = counts();
          const messages = core.channels.readMessages(channelId).length;
          if (missing) {
            rmSync(originalPath);
            expect(() => native('write')).toThrow(/unavailable/);
            await expect(
              call(tools, 'channel_attachment_open', { ...input, access: 'edit-original' }),
            ).rejects.toThrow(/unavailable/);
            await expect(core.attachments.download(original.fileId!)).rejects.toThrow(
              /unavailable/,
            );
          } else {
            writeFileSync(originalPath, 'status=approved\n');
            expect(core.channels.message(channelId, 'source')?.attachments?.[0]?.size).toBe(16);
            expect(core.channels.message(channelId, 'shared')?.attachments?.[0]?.fileId).toBe(
              original.fileId,
            );
            expect(core.channels.message(channelId, 'shared')?.attachments?.[0]?.size).toBe(16);
            expect(
              readFileSync(core.attachments.fileTarget(independent.fileId!).path, 'utf8'),
            ).toBe('status=pending\n');
            const downloaded = await core.attachments.download(original.fileId!);
            expect(await new Response(downloaded.body).text()).toBe('status=approved\n');
          }
          expect(counts()).toEqual(before);
          expect(core.channels.readMessages(channelId)).toHaveLength(messages);
          expect(turns).toBe(1);
          if (!missing) {
            await call(tools, 'channel_attachment_open', {
              ...input,
              channel_id: groupId,
              access: 'edit-original',
            });
            await call(tools, 'group_leave', { channel_id: groupId });
            expect(() => native('read')).toThrow(/not a member/);
            expect(() => native('write')).toThrow(/not a member/);
            await expect(
              call(tools, 'channel_attachment_open', {
                ...input,
                channel_id: groupId,
                access: 'edit-original',
              }),
            ).rejects.toThrow(/not a member/);
          }
        } catch (error) {
          errors.push(error);
          throw error;
        }
      },
    },
  );
  const core = createCore({
    dshHome: home,
    agents: createDshBotAgentAdapter({
      agents: host,
      orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
    }),
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  channelId = core.channels.getOrCreateDm(OWNER_HUMAN_CONTEXT, 'ada', 'Ada')!.id;
  groupId = core.channels.createGroup(OWNER_HUMAN_CONTEXT, { name: 'Source', members: ['ada'] }).id;
  const upload = () =>
    core.attachments.upload({
      name: 'status.txt',
      data: (async function* () {
        yield Buffer.from('status=pending\n');
      })(),
    });
  original = await upload();
  independent = await upload();
  expect(original.fileId).not.toBe(independent.fileId);
  for (const target of [channelId, groupId]) {
    await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, target, {
      id: 'source',
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: 'Explicitly edit this original',
      attachments: [original],
    });
  }
  await core.channels.appendMessage(OWNER_HUMAN_CONTEXT, channelId, {
    id: 'shared',
    at: new Date().toISOString(),
    author: { kind: 'human' },
    body: 'Shared reference',
    attachments: [original],
  });
  core.runtime.admitDmMessage(OWNER_HUMAN_CONTEXT, {
    channelId,
    messageId: 'source',
    body: 'Explicitly edit this original',
  });
  await core.runtime.whenIdle();
  expect(errors).toEqual([]);
  expect(turns).toBe(1);
  expect(core.runtime.originalAttachmentRoot?.(sessionId, originalPath, 'write')).toBeUndefined();
  await core.runtime.close();
  core.operationalDatabase.close();
  const restarted = createCore({ dshHome: home });
  try {
    if (missing)
      await expect(restarted.attachments.download(original.fileId!)).rejects.toThrow(/unavailable/);
    else {
      for (const messageId of ['source', 'shared']) {
        const ref = restarted.channels.message(channelId, messageId)?.attachments?.[0];
        expect(ref?.fileId).toBe(original.fileId);
        const downloaded = await restarted.attachments.download(ref!.fileId!);
        expect(await new Response(downloaded.body).text()).toBe('status=approved\n');
      }
      expect(readFileSync(restarted.attachments.fileTarget(independent.fileId!).path, 'utf8')).toBe(
        'status=pending\n',
      );
    }
  } finally {
    await restarted.runtime.close();
    restarted.operationalDatabase.close();
  }
}

describe('Current original attachment access', () => {
  it('checks exact source and native paths, shares edits only by identity, clears turn access, and persists current bytes without file-change admissions', () =>
    scenario(false));
  it('refuses missing originals before native writes and after restart without restoring upload bytes', () =>
    scenario(true));
});
