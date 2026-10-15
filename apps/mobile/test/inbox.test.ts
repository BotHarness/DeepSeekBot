import { afterEach, describe, expect, it } from 'vitest';

import { createHostClient, type HostClient } from '../src/host/client';
import { actionCount, createInbox, type Inbox, type InboxSnapshot } from '../src/host/inbox';
import {
  answerQuestion,
  buildAnswer,
  decideApproval,
  loadApproval,
  loadQuestion,
  previewInput,
  readableInput,
  requestRef,
  toggleOption,
  typeCustom,
  type RequestRef,
} from '../src/host/requests';
import type { HumanAttentionItem, QuestionItem } from '../src/host/wire';
import { FakeHost } from './fake-host';
import hostWire from './fixtures/host-wire.json';
import inboxWire from './fixtures/inbox-wire.json';

type Recorded = keyof typeof inboxWire.rpc;
const recorded = (name: Recorded): unknown => structuredClone(inboxWire.rpc[name].result);
const items = (name: Recorded): HumanAttentionItem[] =>
  (inboxWire.rpc[name].result as { value: { items: HumanAttentionItem[] } }).value.items;

const ROUTE = 'https://studio.tailnet-example.ts.net';
const approvalItem = items('humanAttention.action')[0]!;
const questionItem = items('humanAttention.actionQuestion')[0]!;
const approval = requestRef(approvalItem)!;
const question = requestRef(questionItem)!;
const latest = hostWire.mux.roster.find((frame) => frame.type === 'latest');

let client: HostClient | undefined;
let inbox: Inbox | undefined;
afterEach(() => {
  inbox?.stop();
  client?.stop();
});

function host(): FakeHost {
  const fake = new FakeHost();
  fake.answers.set('humanAttention', (args) =>
    recorded(
      args['category'] === 'action'
        ? 'humanAttention.action'
        : args['category'] === 'handled'
          ? 'humanAttention.handled'
          : 'humanAttention.replies',
    ),
  );
  fake.answers.set('toolApprovalStatus', () => recorded('toolApprovalStatus.pending'));
  fake.answers.set('toolApprovalDecide', () => recorded('toolApprovalDecide.accepted'));
  fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.pending'));
  fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.accepted'));
  fake.answers.set('channelTimeline', (args) =>
    recorded(
      args['around'] === approval.messageId
        ? 'channelTimeline.approvalPending'
        : 'channelTimeline.questionPending',
    ),
  );
  return fake;
}

function connect(fake: FakeHost): HostClient {
  client = createHostClient({
    routes: [ROUTE],
    credential: fake.credential,
    carrier: fake.carrier,
    backoff: () => 5,
    timeoutMs: 200,
  });
  client.start();
  return client;
}

async function until<T>(read: () => T | undefined): Promise<T> {
  for (let tries = 0; tries < 200; tries += 1) {
    const value = read();
    if (value !== undefined) return value;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('timed out');
}

const ready = (target: Inbox) =>
  until(() => {
    const snapshot = target.getSnapshot();
    return snapshot.status === 'ready' ? snapshot : undefined;
  });

describe('Human Inbox', () => {
  it('lists unresolved actions, then mentions and replies, then handled history', async () => {
    const fake = host();
    inbox = createInbox(connect(fake));
    const snapshot = await ready(inbox);
    expect(snapshot.sections.action.map((item) => item.kind)).toEqual(['tool-approval']);
    expect(snapshot.sections.replies).toEqual([]);
    expect(snapshot.sections.handled.length).toBeGreaterThan(0);
    expect(snapshot.sections.handled.every((item) => item.category === 'handled')).toBe(true);
    expect(actionCount(snapshot)).toBe(1);
    const asked = fake.requests.filter((line) => line.endsWith('/humanAttention'));
    expect(asked).toHaveLength(3);
  });

  it('drops an item resolved elsewhere when the live stream reports the change', async () => {
    const fake = host();
    inbox = createInbox(connect(fake));
    await ready(inbox);
    fake.answers.set('humanAttention', (args) =>
      recorded(
        args['category'] === 'action' ? 'humanAttention.actionEmpty' : 'humanAttention.handled',
      ),
    );
    fake.push('botharness/followRoster', latest);
    const emptied = await until(() => {
      const snapshot = inbox!.getSnapshot();
      return snapshot.status === 'ready' && snapshot.sections.action.length === 0
        ? snapshot
        : undefined;
    });
    expect(actionCount(emptied)).toBe(0);
    expect(inbox.find(approvalItem.id)).toBeUndefined();
  });

  it('reads unread message counts per conversation with the list', async () => {
    const fake = host();
    fake.answers.set('channelUnreadCounts', () => ({
      ok: true,
      value: { channels: [{ channelId: 'dm-ada', unreadCount: 3 }] },
    }));
    inbox = createInbox(connect(fake));
    const snapshot = await ready(inbox);
    expect(snapshot.unread).toEqual({ 'dm-ada': 3 });
  });

  it('keeps the list without counts when the Host refuses unread counts', async () => {
    const fake = host();
    fake.answers.set('channelUnreadCounts', () => ({
      ok: false,
      error: { code: 'unknown-method', message: 'unknown method', details: {} },
    }));
    inbox = createInbox(connect(fake));
    const snapshot = await ready(inbox);
    expect(snapshot.sections.action).toHaveLength(1);
    expect(snapshot.unread).toEqual({});
  });

  it('keeps the last good list and marks it stale when a re-read fails', async () => {
    const fake = host();
    inbox = createInbox(connect(fake));
    await ready(inbox);
    fake.answers.set('humanAttention', () => ({
      ok: false,
      error: { code: 'unavailable', message: 'Human attention is unavailable', details: {} },
    }));
    await inbox.refresh();
    const snapshot = inbox.getSnapshot() as Extract<InboxSnapshot, { status: 'ready' }>;
    expect(snapshot.sections.action).toHaveLength(1);
    expect(snapshot.stale).toBe('Human attention is unavailable');
  });
});

describe('Tool approval', () => {
  it('reads the PersonaBot, tool name and arguments of a pending approval', async () => {
    const target = connect(host());
    const read = await loadApproval(target, approval);
    expect(read).toMatchObject({ toolName: 'bash', status: 'pending', botSlug: approval.botSlug });
    expect(readableInput(read.input)).toEqual([
      { label: 'command', value: 'ls /tmp/mobile-fixture' },
      { label: 'description', value: 'List mobile fixture directory' },
    ]);
  });

  it('previews the command whatever order the arguments come in', () => {
    const input = JSON.stringify({ description: 'List files', command: 'ls /tmp' });
    expect(previewInput(input)).toEqual({ label: 'command', value: 'ls /tmp' });
    expect(previewInput(JSON.stringify({ query: 'weather' }))).toEqual({
      label: 'query',
      value: 'weather',
    });
  });

  it('allows once, and a second decision reports the first one won', async () => {
    const fake = host();
    const target = connect(fake);
    const decided: Array<Record<string, unknown>> = [];
    fake.answers.set('toolApprovalDecide', (args) => {
      decided.push(args);
      return recorded(
        decided.length === 1 ? 'toolApprovalDecide.accepted' : 'toolApprovalDecide.refused',
      );
    });
    expect(await decideApproval(target, approval, 'allowed-once')).toBe('accepted');
    expect(decided[0]).toEqual({ ...pick(approval), outcome: 'allowed-once' });
    fake.answers.set('toolApprovalStatus', () => recorded('toolApprovalStatus.decided'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.approvalDecided'));
    expect(await decideApproval(target, approval, 'rejected')).toBe('decided');
    expect(await loadApproval(target, approval)).toMatchObject({
      status: 'decided',
      outcome: 'allowed-once',
    });
  });

  it('reports an approval that expired without a decision', async () => {
    const fake = host();
    const target = connect(fake);
    fake.answers.set('toolApprovalDecide', () => recorded('toolApprovalDecide.refused'));
    fake.answers.set('toolApprovalStatus', () => recorded('toolApprovalStatus.decided'));
    expect(await decideApproval(target, approval, 'allowed-once')).toBe('expired');
  });
});

describe('Human question', () => {
  it('reads the questions and answers choice, multi-choice and free text', async () => {
    const fake = host();
    const target = connect(fake);
    const read = await loadQuestion(target, question);
    expect(read.status).toBe('pending');
    const [colour, snacks] = read.questions as [QuestionItem, QuestionItem];
    expect(colour.options?.map((option) => option.label)).toEqual(['Teal', 'Amber']);
    expect(snacks.multiSelect).toBe(true);

    let drafts = { colour: toggleOption(colour, { selected: [], custom: '' }, 'Teal') };
    expect(buildAnswer(read.questions, drafts)).toBeUndefined();
    const snack = typeCustom(
      snacks,
      toggleOption(snacks, { selected: [], custom: '' }, 'Tea'),
      'fruit',
    );
    const answer = buildAnswer(read.questions, { ...drafts, snacks: snack })!;
    expect(answer).toEqual({
      answers: [
        { id: 'colour', selected: ['Teal'] },
        { id: 'snacks', selected: ['Tea'], custom: 'fruit' },
      ],
    });

    const sent: unknown[] = [];
    fake.answers.set('userQuestionAnswer', (args) => {
      sent.push(args);
      return recorded(
        sent.length === 1 ? 'userQuestionAnswer.accepted' : 'userQuestionAnswer.refused',
      );
    });
    expect(await answerQuestion(target, question, answer)).toBe('accepted');
    expect(sent[0]).toEqual({ ...pick(question), answer });
    fake.answers.set('userQuestionStatus', () => recorded('userQuestionStatus.answered'));
    fake.answers.set('channelTimeline', () => recorded('channelTimeline.questionAnswered'));
    expect(await answerQuestion(target, question, answer)).toBe('decided');
    expect((await loadQuestion(target, question)).status).toBe('decided');
    drafts = { colour: typeCustom(colour, drafts.colour, 'green') };
    expect(drafts.colour).toEqual({ selected: [], custom: 'green' });
  });

  it('surfaces a refusal while the question is still pending instead of hiding it', async () => {
    const fake = host();
    const target = connect(fake);
    fake.answers.set('userQuestionAnswer', () => recorded('userQuestionAnswer.invalid'));
    await expect(answerQuestion(target, question, { answers: [] })).rejects.toThrow(
      'Question is no longer pending or answer is invalid',
    );
  });
});

function pick(ref: RequestRef): { channelId: string; messageId: string } {
  return { channelId: ref.channelId, messageId: ref.messageId };
}
