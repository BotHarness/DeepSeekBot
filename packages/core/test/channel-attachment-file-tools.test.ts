import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { FakeAgentHost } from './dsh-agent-host-fixture.js';
import { createTempRoot } from './helpers.js';
import type { ChannelAttachmentRef } from '../src/attachments/ref.js';

async function call(tools: readonly ToolDefinition[], name: string, args: unknown) {
  return tools
    .find((tool) => tool.name === name)!
    .execute(args, { callId: name, signal: new AbortController().signal } as ToolRunContext);
}

describe('Trusted Channel attachment file Tools', () => {
  it('checks exact source association, current membership and destination authority before file access; sends only imported results', async () => {
    const home = realpathSync(createTempRoot('bh-trusted-file-tools-'));
    const project = join(home, 'project');
    mkdirSync(project);
    let sourceId = '';
    let joinedId = '';
    let hiddenId = '';
    let grantId = '';
    let original: ChannelAttachmentRef;
    let other: ChannelAttachmentRef;
    const errors: unknown[] = [];
    let checked = false;
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onTurn: async (_session, tools) => {
          if (checked) return;
          checked = true;
          try {
            const input = {
              message_id: 'source',
              file_id: original.fileId,
              grant_id: grantId,
              destination_path: 'working.zip',
            };
            await expect(call(tools, 'channel_attachment_save', input)).rejects.toThrow(
              /write authorization/,
            );
            core.grants.setOrchestratorWrite('ada', grantId, true);
            await expect(
              call(tools, 'channel_attachment_save', { ...input, message_id: 'missing' }),
            ).rejects.toThrow(/Source message/);
            await expect(
              call(tools, 'channel_attachment_save', { ...input, file_id: other.fileId }),
            ).rejects.toThrow(/not attached/);
            await expect(
              call(tools, 'channel_attachment_save', { ...input, channel_id: hiddenId }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
            await expect(
              call(tools, 'channel_attachment_save', {
                ...input,
                destination_path: '../escape.zip',
              }),
            ).rejects.toThrow(/authorization/);
            const saved = String(
              await call(tools, 'channel_attachment_save', { ...input, channel_id: joinedId }),
            );
            expect(saved).toContain('Saved independent working file:');
            expect(readFileSync(join(project, 'working.zip'), 'utf8')).toBe('source bytes');
            await call(tools, 'group_leave', { channel_id: joinedId });
            await expect(
              call(tools, 'channel_attachment_save', {
                ...input,
                channel_id: joinedId,
                destination_path: 'again.zip',
              }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
            writeFileSync(join(project, 'working.zip'), 'processed result');
            const imported = JSON.parse(
              String(
                await call(tools, 'channel_attachment_import', {
                  file_path: join(project, 'working.zip'),
                }),
              ),
            ) as ChannelAttachmentRef;
            expect(imported.fileId).not.toBe(original.fileId);
            const sent = JSON.parse(
              String(
                await call(tools, 'bot_send_message', {
                  channel_id: sourceId,
                  body: 'Result',
                  attachments: [imported],
                }),
              ),
            );
            expect(sent.channelId).toBe(sourceId);
            expect(core.channels.message(sourceId, sent.messageId)?.attachments?.[0]?.fileId).toBe(
              imported.fileId,
            );
            const before = core.channels.readMessages(sourceId).length;
            await expect(
              call(tools, 'bot_send_message', {
                body: 'Invalid',
                channel_id: hiddenId,
                attachments: [imported],
              }),
            ).rejects.toThrow(/not a member|authorized Channel is unavailable/);
            expect(core.channels.readMessages(sourceId)).toHaveLength(before);
            core.grants.revoke('ada', grantId);
            await expect(
              call(tools, 'channel_attachment_import', { file_path: join(project, 'working.zip') }),
            ).rejects.toThrow(/authorized directories/);
          } catch (error) {
            errors.push(error);
            throw error;
          }
        },
      },
    );
    const core = createCore({
      dshHome: home,
      workspaces: () => ({
        get: (id) =>
          id === 'project'
            ? { id, path: project, title: 'Project', status: async () => 'ok' }
            : undefined,
        list: () => [{ id: 'project', path: project, title: 'Project', status: async () => 'ok' }],
      }),
      agents: createDshBotAgentAdapter({
        agents: host,
        orchestratorCwd: (bot) => core.registry.memoryDirFor(bot.slug),
        defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      }),
    });
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bob', displayName: 'Bob' });
      grantId = (await core.grants.create('ada', 'project')).id;
      sourceId = core.channels.getOrCreateDm('ada', 'Ada')!.id;
      joinedId = core.channels.createGroup({ name: 'Joined', members: ['ada'] }).id;
      hiddenId = core.channels.createGroup({ name: 'Hidden', members: ['bob'] }).id;
      original = await core.attachments.upload({
        data: (async function* () {
          yield Buffer.from('source bytes');
        })(),
        name: 'original.zip',
      });
      other = await core.attachments.upload({
        data: (async function* () {
          yield Buffer.from('unrelated bytes');
        })(),
        name: 'other.zip',
      });
      for (const channelId of [sourceId, joinedId, hiddenId]) {
        await core.channels.appendMessage(channelId, {
          id: 'source',
          at: new Date().toISOString(),
          author: { kind: 'human' },
          body: 'Process file',
          attachments: [original],
        });
      }
      expect(
        core.runtime.admitDmMessage({
          channelId: sourceId,
          messageId: 'source',
          body: 'Process file',
        }).admitted,
      ).toBe(true);
      await core.runtime.whenIdle();
      expect(checked).toBe(true);
      expect(errors).toEqual([]);
    } finally {
      await core.runtime.close();
      core.operationalDatabase.close();
      rmSync(home, { recursive: true, force: true });
    }
  });
});
