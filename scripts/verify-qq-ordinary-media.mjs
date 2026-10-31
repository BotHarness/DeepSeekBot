import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { qqOrdinaryMediaSource } from './product-provider/qq-ordinary-media.mjs';

export async function verifyQqOrdinaryMedia(providerRoot, kind, { staged = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'bh-qq-media-'));
  try {
    cpSync(join(providerRoot, 'src'), join(root, 'src'), { recursive: true });
    cpSync(join(providerRoot, 'package.json'), join(root, 'package.json'));
    symlinkSync(resolve(providerRoot, 'node_modules'), join(root, 'node_modules'), 'junction');
    const path = join(root, 'src/channels/qq/external-consumer.mjs');
    if (!staged) writeFileSync(path, qqOrdinaryMediaSource(readFileSync(path, 'utf8')));
    const { QqExternalConsumer } = await import(pathToFileURL(path).href);
    const fingerprint = 'a'.repeat(64);
    const input = {
      kind: 'group',
      rawEventType: 'GROUP_MESSAGE_CREATE',
      messageId: 'synthetic-message',
      senderId: 'synthetic-human',
      groupOpenid: 'synthetic-group',
      content: '',
      timestamp: '2026-10-31T00:00:00.000Z',
      replyTarget: { scope: 'group', targetId: 'synthetic-group', msgId: 'synthetic-message' },
      attachments: [
        {
          content_type: kind === 'image' ? 'image/png' : 'file',
          url: 'https://example.qq.com/sample',
        },
      ],
    };
    const receive = async (message, options = {}) => {
      let event;
      const consumer = new QqExternalConsumer({
        bot: {},
        botId: 'synthetic-app',
        account: { appId: 'synthetic-app', userId: 'synthetic-bot', fingerprint },
        ordinaryText: () => options.ordinary !== false,
        sourceImages: () => options.images !== false,
        sourceFiles: () => options.files !== false,
        accept: async (value) => {
          event = value;
          return { accepted: true };
        },
      });
      await consumer.accept(message, new AbortController().signal);
      return { consumer, event };
    };
    const { consumer, event } = await receive(input);
    assert.equal(
      event?.attachments?.length,
      1,
      `ordinary ${kind}: Source Event attachment missing; text=${event?.text}`,
    );
    assert.equal(event.mentionedAccount, false);
    assert.equal(event.actor.id, input.senderId);
    assert.equal(event.conversation.id, input.groupOpenid);
    assert.equal(event.attachments[0].messageId, input.messageId);
    assert.equal(
      event.attachments[0].mediaType,
      kind === 'image' ? 'image/png' : 'application/octet-stream',
    );
    assert.equal(event.contentParts.filter((part) => part.kind === 'attachment').length, 1);
    assert.throws(() => consumer.qualify(event.reply), { code: 'capability-unavailable' });
    assert.equal(
      (await receive({ ...input, rawEventType: 'GROUP_AT_MESSAGE_CREATE' })).event?.attachments
        ?.length,
      1,
    );
    assert.equal(
      (await receive({ ...input, mentions: [{ is_you: true }] })).event?.attachments?.length,
      1,
    );
    assert.equal((await receive(input, { ordinary: false })).event, undefined);
    assert.equal((await receive({ ...input, senderIsBot: true })).event, undefined);
    assert.equal((await receive({ ...input, senderId: 'synthetic-bot' })).event, undefined);
    const disabled = await receive(input, kind === 'image' ? { images: false } : { files: false });
    assert.equal(disabled.event?.attachments, undefined);
    assert.match(disabled.event.text, /not readable by the Bot/);
    const unrelatedDisabled = await receive(
      input,
      kind === 'image' ? { files: false } : { images: false },
    );
    assert.equal(unrelatedDisabled.event?.attachments?.length, 1);
    const unsupported = await receive({
      ...input,
      attachments: [{ ...input.attachments[0], content_type: 'image/svg+xml' }],
    });
    assert.equal(unsupported.event?.attachments, undefined);
    assert.match(unsupported.event.text, /unsupported format/);
    const element = {
      msg_idx: 'synthetic-reference',
      content: 'Quoted text',
      attachments: input.attachments,
    };
    const quoted = await receive({
      ...input,
      attachments: undefined,
      msgType: 103,
      refMsgIdx: element.msg_idx,
      msgElements: [element],
      raw: {
        id: input.messageId,
        group_openid: input.groupOpenid,
        author: { member_openid: input.senderId },
        message_type: 103,
        msg_elements: [element],
      },
    });
    assert.equal(quoted.event?.attachments, undefined);
    assert.match(quoted.event.text, /Quoted message/);
    assert.equal(
      (await receive({ ...input, attachments: undefined, msgType: 7 })).event,
      undefined,
    );
    await assert.rejects(
      receive({
        ...input,
        attachments: [{ ...input.attachments[0], url: 'https://example.invalid/media' }],
      }),
    );
    return {
      evidence: 'synthetic input through real Provider; no native QQ or download',
      kind,
      input,
      event,
      controls: 'passed',
    };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.argv[2];
  if (!root)
    throw new Error('Usage: node scripts/verify-qq-ordinary-media.mjs <Provider root> [--staged]');
  for (const kind of ['image', 'file'])
    process.stdout.write(
      `${JSON.stringify(await verifyQqOrdinaryMedia(root, kind, { staged: process.argv[3] === '--staged' }))}\n`,
    );
}
