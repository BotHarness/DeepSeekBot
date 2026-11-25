import { describe, expect, it, vi } from 'vitest';
import { fixture } from './lark-approval-fixtures.js';
import { questionSurface } from '../src/messaging/interactions/surface.js';
import type { MessagingProvider } from '../src/messaging/provider.js';
import {
  approvalReference,
  parseApprovalReply,
} from '../src/messaging/interactions/text-approvals.js';

const textOnly = () => fixture(false, false, false, false, true, true);
type Fixture = Awaited<ReturnType<typeof textOnly>>;
const sent = (f: Fixture) =>
  f.replies.mock.calls.filter((call) => call[2].includes('#')).map((call) => call[2]);
const receipt = (f: Fixture, callId = 'call-1') =>
  f.core.externalMessaging.approvals.snapshot('ada').deliveries.find((d) => d.callId === callId)
    ?.receipt?.messageId;

describe('approvals without cards', () => {
  it('reads allow and reject words', () => {
    expect(parseApprovalReply('允许')).toBe('allowed-once');
    expect(parseApprovalReply(' Approve. ')).toBe('allowed-once');
    expect(parseApprovalReply('拒绝！')).toBe('rejected');
    expect(parseApprovalReply('deny')).toBe('rejected');
    expect(parseApprovalReply('ok')).toBeUndefined();
    expect(parseApprovalReply('allow it please')).toBeUndefined();
  });

  it('sends the approval as text and takes a quoted allow', async () => {
    const f = await textOnly();
    const call = await f.start();
    await vi.waitFor(() => expect(sent(f)).toHaveLength(1));
    expect(f.cards).not.toHaveBeenCalled();
    const text = sent(f)[0]!;
    expect(text).toContain('bash');
    expect(text).toContain('回复本消息「允许」或「拒绝」');
    expect(text).toContain(`#${approvalReference(call.delivery.id)}`);
    const id = receipt(f)!;
    await f.text('允许', id);
    expect(await call.answer).toBe('allowed-once');
    await vi.waitFor(() => expect(sent(f)).toHaveLength(2));
    const asked = f.replies.mock.calls.find((call) => call[2].includes('回复本消息'))!;
    expect(f.replies.mock.calls.at(-1)![1]).toEqual(asked[1]);
    expect(f.replies.mock.calls.at(-1)![1].messageId).not.toBe(id);
  });

  it('takes a bare reject when it is the only pending approval in the DM', async () => {
    const f = await textOnly();
    const call = await f.start();
    await vi.waitFor(() => expect(sent(f)).toHaveLength(1));
    await f.text('拒绝');
    expect(await call.answer).toBe('rejected');
  });

  it('takes a reference when several approvals wait', async () => {
    const f = await textOnly();
    const first = await f.start('call-1');
    const second = await f.start('call-2');
    await vi.waitFor(() => expect(sent(f)).toHaveLength(2));
    await f.text('允许');
    await f.text(`#${approvalReference(second.delivery.id)} 拒绝`);
    expect(await second.answer).toBe('rejected');
    await f.text('允许', receipt(f, 'call-1'));
    expect(await first.answer).toBe('allowed-once');
  });

  it('ignores a decision from someone who is not paired', async () => {
    const f = await textOnly();
    const call = await f.start();
    await vi.waitFor(() => expect(sent(f)).toHaveLength(1));
    await f.text('允许', receipt(f), 'ou_mallory');
    const settled = await Promise.race([
      call.answer,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 200)),
    ]);
    expect(settled).toBe('waiting');
    expect(f.core.externalMessaging.approvals.snapshot('ada').deliveries[0]?.status).toBe(
      'pending',
    );
  });

  it('does not let a quote of a settled approval pick another one', async () => {
    const f = await textOnly();
    const first = await f.start('call-1');
    await vi.waitFor(() => expect(sent(f)).toHaveLength(1));
    const settledId = receipt(f, 'call-1')!;
    await f.text('允许', settledId);
    expect(await first.answer).toBe('allowed-once');
    const second = await f.start('call-2');
    await vi.waitFor(() => expect(sent(f)).toHaveLength(3));
    await f.text('允许', settledId);
    const outcome = await Promise.race([
      second.answer,
      new Promise((resolve) => setTimeout(() => resolve('waiting'), 200)),
    ]);
    expect(outcome).toBe('waiting');
  });

  it('falls back to text when the connection has not checked cards', async () => {
    const f = await fixture(false, false, false, false, true, true, true);
    const call = await f.start();
    await vi.waitFor(() => expect(sent(f)).toHaveLength(1));
    expect(f.cards).not.toHaveBeenCalled();
    await f.text('允许', receipt(f));
    expect(await call.answer).toBe('allowed-once');
  });
});

describe('question updates without cards', () => {
  it('sends a pending update only when it carries a notice', async () => {
    const reply = vi.fn<NonNullable<MessagingProvider['reply']>>(async () => ({
      accepted: true as const,
    }));
    const send = questionSurface({
      provider: { reply } as unknown as MessagingProvider,
      identity: { platform: 'feishu' },
      paired: { actorId: 'ou_alice' },
    })!;
    const input = {
      accountRef: 'lark-qa',
      fingerprint: 'a'.repeat(64),
      route: { version: 1 as const, messageId: 'om_q', conversationId: 'oc_private' },
      card: {
        requestId: 'q-1',
        reference: '0123456789AB',
        questions: [],
        status: 'pending' as const,
        detail:
          'Answer not accepted; the original question still waits / 回答未被接受，原提问继续等待',
      },
      signal: new AbortController().signal,
      beforeSend: () => true,
      update: true,
    };
    expect(await send(input)).toEqual({ updated: true });
    expect(reply).not.toHaveBeenCalled();
    expect(await send({ ...input, notice: true })).toEqual({ updated: true });
    expect(reply.mock.calls[0]![0].text).toContain('回答未被接受');
  });
});
