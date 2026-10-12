import { expect, it, vi } from 'vitest';
import { setImmediate as tick } from 'node:timers/promises';
import { createCore } from '../src/plugin.js';
import { createTempRoot } from './helpers.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveAttachmentFile, importAttachmentFile } from '../src/attachments/file-operations.js';
import { createAttachmentHttp } from '../src/attachments/http.js';
import { authorizedPathRoot } from '../src/workspaces/grant-native-tools.js';
it.each(['qualified', 'no-generic', 'no-fence'])(
  'QQ canonical independent file processing: %s',
  async (mode) => {
    const home = createTempRoot('bh-qq-file-canonical-');
    const fingerprint = 'a'.repeat(64);
    const bytes = Buffer.from('name,quantity\napple,2\npear,3\n');
    let receiver: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1] | undefined;
    const runs = vi.fn(async () => {});
    const download = vi.fn(async function* () {
      yield bytes;
    });
    const nativeReply = vi.fn(async (_account, route, _file, options) => {
      if (!options.beforeSend?.()) throw new Error('stale-route');
      return {
        sent: true as const,
        receipt: {
          version: 1 as const,
          messageId: 'qq-file-result',
          conversationId: route.conversationId,
        },
      };
    });
    const service: DshImOutboundService = {
      contractVersion: 1,
      fileVersion: 1,
      replyContextVersion: 1,
      replyReceiptVersion: 1,
      replyFenceVersion: 1,
      listBots: async () => [{ botId: 'qq-app', channel: 'qq' }],
      listTargets: async () => [],
      describeBot: async () => ({
        version: 1,
        botId: 'qq-app',
        channel: 'qq',
        connected: true,
        account: { fingerprint },
        capabilities: [
          'exclusive-text-consumer',
          'reply-text-checked',
          'reply-context-checked',
          'reply-receipt-checked',
          'reply-fence-checked',
          'source-file-checked',
          'reply-file-checked',
          ...(mode === 'no-generic' ? [] : ['source-generic-file-checked']),
          ...(mode === 'no-fence' ? [] : ['reply-file-fence-checked']),
          'reply-image-fence-checked',
          'reply-file-receipt-checked',
        ],
      }),
      sendChecked: async () => ({ sent: true }),
      replyChecked: async () => ({ sent: true }),
      consumeInbound: async (_account, options) => {
        receiver = options;
        return () => {};
      },
      readSourceFile: async () => download(),
      replyFileChecked: nativeReply,
      qualifyReplyChecked: async (_account, route) => route,
    };
    const boot = () => {
      const core = createCore({
        dshHome: home,
        workspaces: () => ({
          get: (id) =>
            id === 'project'
              ? { id, path: join(home, 'project'), title: 'Project', status: async () => 'ok' }
              : undefined,
          list: () => [
            {
              id: 'project',
              path: join(home, 'project'),
              title: 'Project',
              status: async () => 'ok',
            },
          ],
        }),
        agents: {
          runOrchestrator: runs,
          runAssignment: async () => {},
          requestAssignment: () => ({ delivery: 'steer' }),
          stopAssignment: async () => {},
          close: async () => {},
        },
      });
      core.externalMessaging.register(createDshImProvider(service, 'qq')!);
      return core;
    };
    let core = boot();
    const idle = async () => {
      for (let index = 0; index < 4; index++) await tick();
      await core.runtime.whenIdle();
    };
    try {
      core.registry.create({ slug: 'ada', displayName: 'Ada' });
      core.registry.create({ slug: 'bea', displayName: 'Bea' });
      await core.externalMessaging.identity('ada', {
        kind: 'bind',
        providerId: 'dsh-im/qq',
        accountRef: 'qq-app',
        fingerprint,
      });
      await idle();
      const attachment = {
        id: 'b'.repeat(64),
        messageId: 'qq-file-source',
        resourceKey: 'private-selector',
        name: 'input.csv',
        mediaType: 'application/octet-stream',
        sizeBytes: bytes.length,
      };
      const receive = async (messageId: string) => {
        if (!receiver) throw new Error('QQ receiver unavailable');
        const file = { ...attachment, messageId };
        await receiver.onEvent(
          {
            version: 1,
            channel: 'qq',
            botId: 'qq-app',
            fingerprint,
            eventId: messageId,
            messageId,
            actor: { kind: 'user', id: 'human' },
            conversation: { kind: 'group', id: 'qq-group' },
            mentions: [],
            mentionedAccount: true,
            at: new Date(Date.now() + 100).toISOString(),
            text: 'Sum the quantities',
            attachments: [file],
            contentParts: [
              { kind: 'text', text: 'Sum the quantities' },
              { kind: 'attachment', id: file.id },
            ],
            reply: { messageId, conversationId: 'qq-group', actorId: 'human' },
            replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
          },
          { signal: receiver.signal },
        );
        await idle();
        return core.attention
          .list({ botSlug: 'ada' })
          .items.find(
            (item) =>
              core.externalMessaging.inbound.read('ada', item.id).event.messageId === messageId,
          )!.id;
      };
      if (mode !== 'qualified') {
        await expect(receive('discovery')).rejects.toMatchObject({ code: 'untrusted-source' });
        expect(receiver?.sourceFiles).toBeUndefined();
        return;
      }
      await receive('discovery');
      const room = core.channels.createGroup({ name: 'QQ Files', members: ['ada', 'bea'] });
      const grant = (await core.externalMessaging.snapshot('ada')).grants[0]!;
      await core.externalMessaging.inbound.channelBridge(room.id, {
        kind: 'add',
        grantId: grant.id,
        expectedGrantRevision: grant.revision,
        name: 'QQ QA',
        enabled: true,
        collection: 'mentions',
        delivery: 'channel',
      });
      const sourceId = await receive(attachment.messageId);
      expect(core.channels.readMessages(room.id)).toHaveLength(1);
      expect(core.channels.readMessages(room.id)[0]?.bridgeMedia?.items).toMatchObject([
        { id: attachment.id, kind: 'file' },
      ]);
      expect(JSON.stringify(core.channels.readMessages(room.id))).not.toContain('private-selector');
      const http = createAttachmentHttp(
        core.attachments,
        core.channels,
        undefined,
        core.externalMessaging.readChannelMedia,
      );
      const response = await http(
        new Request(
          'http://localhost/api/botharness/attachment?' +
            new URLSearchParams({
              channelId: room.id,
              sourceEventId: sourceId,
              attachmentId: attachment.id,
            }),
        ),
      );
      expect(response.status).toBe(200);
      expect(response.headers.get('content-disposition')).toMatch(/^attachment;/);
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
      const wakeCount = runs.mock.calls.length;
      const admissionCount = core.attention.list({ botSlug: 'ada' }).items.length;
      const preview = await core.externalMessaging.readChannelMedia({
        channelId: room.id,
        sourceEventId: sourceId,
        attachmentId: attachment.id,
        signal: new AbortController().signal,
      });
      expect(Buffer.from(await new Response(preview.body).arrayBuffer())).toEqual(bytes);
      expect(runs).toHaveBeenCalledTimes(wakeCount);
      expect(core.attention.list({ botSlug: 'ada' }).items).toHaveLength(admissionCount);
      expect(download).toHaveBeenCalledTimes(1);
      await expect(
        core.externalMessaging.acquireFile('bea', sourceId, attachment.id),
      ).rejects.toThrow();
      const acquired = await core.externalMessaging.acquireFile('ada', sourceId, attachment.id);
      expect(acquired.fileId).toBe(preview.ref.fileId);
      expect(download).toHaveBeenCalledTimes(1);
      const project = join(home, 'project');
      mkdirSync(project);
      const workspaceGrant = await core.grants.create('ada', 'project');
      core.grants.setOrchestratorWrite('ada', workspaceGrant.id, true);
      const saved = await saveAttachmentFile(
        {
          grantId: workspaceGrant.id,
          destinationPath: 'working.csv',
        },
        {
          botSlug: 'ada',
          grants: core.grants,
          attachments: core.attachments,
          source: () => core.attachments.current(acquired),
        },
      );
      expect(readFileSync(saved.path)).toEqual(bytes);
      writeFileSync(saved.path, 'total_quantity\n5\n');
      const result = await importAttachmentFile(
        { filePath: saved.path },
        {
          attachments: core.attachments,
          authorize: (target) => {
            const active = core.grants.requireActive('ada', workspaceGrant.id);
            if (authorizedPathRoot([active.workspacePath], target) === undefined)
              throw new Error('Unauthorized file');
          },
        },
      );
      expect(result.fileId).not.toBe(acquired.fileId);
      const original = await core.attachments.download(acquired.fileId!);
      expect(Buffer.from(await new Response(original.body).arrayBuffer())).toEqual(bytes);
      await expect(core.externalMessaging.replyFile('bea', sourceId, result)).rejects.toThrow();
      const sent = await core.externalMessaging.replyFile('ada', sourceId, result);
      expect(sent).toMatchObject({
        state: 'provider-accepted',
        receipt: {
          version: 1,
          messageId: 'qq-file-result',
          conversationId: 'qq-group',
        },
      });
      expect(nativeReply).toHaveBeenCalledTimes(1);
      expect(Buffer.from(nativeReply.mock.calls[0]?.[2].bytes ?? [])).toEqual(
        Buffer.from('total_quantity\n5\n'),
      );
      await expect(core.externalMessaging.replyFile('ada', sourceId, result)).resolves.toEqual(
        sent,
      );
      await expect(
        core.externalMessaging.reply('ada', sourceId, 'Another payload'),
      ).rejects.toMatchObject({
        code: 'request-conflict',
      });
      expect(nativeReply).toHaveBeenCalledTimes(1);
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
      core = boot();
      await idle();
      expect(core.externalMessaging.history('ada')[0]?.receipt).toEqual(sent.receipt);
      expect(core.channels.readMessages(room.id)).toHaveLength(1);
      const restored = await core.externalMessaging.readChannelMedia({
        channelId: room.id,
        sourceEventId: sourceId,
        attachmentId: attachment.id,
        signal: new AbortController().signal,
      });
      expect(restored.ref.fileId).toBe(preview.ref.fileId);
      await restored.body.cancel();
      expect(download).toHaveBeenCalledTimes(1);
      const identity = (await core.externalMessaging.snapshot('ada')).identities![0]!;
      await core.externalMessaging.identity('ada', {
        kind: 'unbind',
        id: identity.id,
        expectedRevision: identity.revision,
      });
      await expect(
        core.externalMessaging.readChannelMedia({
          channelId: room.id,
          sourceEventId: sourceId,
          attachmentId: attachment.id,
          signal: new AbortController().signal,
        }),
      ).rejects.toThrow();
    } finally {
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    }
  },
);
