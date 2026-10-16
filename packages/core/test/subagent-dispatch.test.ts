import { describe, expect, it } from 'vitest';

import { isChannelMessage } from '../src/channels/channel.js';
import { createChannelLiveHub, type ChannelLiveFrame } from '../src/channels/live.js';
import { createSqliteChannelStore } from '../src/channels/sqlite-store.js';
import { attachOperationalModule, mountOperationalDatabase } from '../src/database/owner.js';
import { BOT_HARNESS_SCHEMA_PLAN } from '../src/database/schema-plan.js';
import { createTempRoot, trackTestOwner } from './helpers.js';

import {
  createSubagentDispatchRegistry,
  subagentDispatchMessageId,
} from '../src/channels/subagent-dispatch.js';
import {
  createSubagentDispatchProjection,
  type SubagentDispatchCommit,
} from '../src/runtime/subagent-dispatch-projection.js';

const AT = '2026-10-15T06:00:00.000Z';

const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

function harness() {
  const commits: SubagentDispatchCommit[] = [];
  const published: string[] = [];
  const projection = createSubagentDispatchProjection({
    channelForSession: () => 'dm-alpha',
    commit: (input) => {
      commits.push(input);
    },
    publish: (record) => {
      published.push(`${record.projection.status}:${record.projection.revision}`);
    },
    now: () => new Date(AT),
  });
  return { projection, commits, published };
}

function toolCall(callId: string, description: string) {
  return {
    type: 'tool/call',
    time: 1,
    data: { callId, name: 'bot_subagent', arguments: JSON.stringify({ description }) },
  };
}

function toolResult(callId: string, text: string, isError = false) {
  return {
    type: 'tool/result',
    time: 5,
    data: { message: { toolCallId: callId, isError, content: [{ type: 'text', text }] } },
  };
}

describe('subagent dispatch registry', () => {
  it('excludes cards before the Human history boundary on reconnect and live updates', async () => {
    const home = createTempRoot();
    const owner = trackTestOwner(
      mountOperationalDatabase({ dshHome: home, schemaPlan: BOT_HARNESS_SCHEMA_PLAN }),
    );
    const database = attachOperationalModule(owner, 'channels');
    const channels = createSqliteChannelStore({
      rootDir: home,
      database,
      databaseOwnerReady: true,
    });
    const group = channels.createGroup({ name: 'Team', members: ['ada'] });
    const registry = createSubagentDispatchRegistry();
    for (const dispatchId of ['before-rejoin', 'visible']) {
      const record = registry.apply({
        channelId: group.id,
        dispatchId,
        parentSessionId: 'session-parent',
        status: 'running',
        description: dispatchId,
        at: AT,
      })!;
      await channels.appendMessage(group.id, {
        id: record.messageId,
        at: AT,
        author: { kind: 'system' },
        body: dispatchId,
        subagentDispatch: record.projection,
      });
    }
    database.transaction((db) => {
      db.prepare(
        'UPDATE channel_human_members SET visible_from_revision = 2 WHERE channel_id = ?',
      ).run(group.id);
    });
    const hub = createChannelLiveHub(channels, undefined, undefined, registry);
    const abort = new AbortController();
    try {
      const frames = hub.followChannel(group.id, 1, abort.signal)[Symbol.asyncIterator]();
      expect((await frames.next()).value).toMatchObject({
        type: 'opened',
        page: { entries: [{ message: { id: subagentDispatchMessageId('visible') } }] },
      });
      let frame: ChannelLiveFrame | undefined = (await frames.next()).value;
      while (
        frame?.type !== 'notification' ||
        frame.notification.kind !== 'subagent-dispatch-baseline'
      )
        frame = (await frames.next()).value;
      expect(frame.notification.dispatches.map((record) => record.messageId)).toEqual([
        subagentDispatchMessageId('visible'),
      ]);
      for (const dispatchId of ['before-rejoin', 'visible']) {
        hub.publishSubagentDispatch(
          registry.apply({
            channelId: group.id,
            dispatchId,
            parentSessionId: 'session-parent',
            status: 'completed',
            at: AT,
          })!,
        );
      }
      expect((await frames.next()).value).toMatchObject({
        type: 'notification',
        notification: {
          kind: 'subagent-dispatch',
          messageId: subagentDispatchMessageId('visible'),
          subagentDispatch: { status: 'completed' },
        },
      });
    } finally {
      abort.abort();
      hub.close();
    }
  });

  it('rejects unrelated system messages and system messages with malformed dispatch data', () => {
    const message = {
      id: 'message-1',
      at: AT,
      author: { kind: 'system' },
      body: 'Subagent: Review',
    };
    expect(isChannelMessage(message)).toBe(false);
    const malformed = { ...message, subagentDispatch: { kind: 'subagent', status: 'invented' } };
    expect(isChannelMessage(malformed)).toBe(false);
  });

  it('derives a stable card id and advances a dispatch in place', () => {
    const registry = createSubagentDispatchRegistry();
    const first = registry.apply({
      channelId: 'dm-alpha',
      dispatchId: 'call-1',
      parentSessionId: 'session-parent',
      status: 'queued',
      at: AT,
      description: 'Read the changelog',
    });
    expect(first?.messageId).toBe(subagentDispatchMessageId('call-1'));
    expect(first?.projection.revision).toBe(1);
    const running = registry.apply({
      channelId: 'dm-alpha',
      dispatchId: 'call-1',
      parentSessionId: 'session-parent',
      status: 'running',
      at: AT,
    });
    expect(running?.messageId).toBe(first?.messageId);
    expect(running?.projection).toMatchObject({
      status: 'running',
      revision: 2,
      description: 'Read the changelog',
    });
    expect(registry.forChannel('dm-alpha')).toHaveLength(1);
    expect(
      registry.apply({
        channelId: 'dm-alpha',
        dispatchId: 'call-1',
        parentSessionId: 'session-parent',
        status: 'queued',
        at: AT,
      }),
    ).toBeUndefined();
  });
});

describe('subagent dispatch projection', () => {
  it('keeps the committed baseline and intent when a terminal commit rejects once', async () => {
    const commits: SubagentDispatchCommit[] = [];
    const published: string[] = [];
    const warnings: string[] = [];
    let rejectCommit: ((error: Error) => void) | undefined;
    let rejectOnce = true;
    const projection = createSubagentDispatchProjection({
      channelForSession: () => 'dm-alpha',
      commit: async (input) => {
        if (input.projection.status === 'completed' && rejectOnce) {
          rejectOnce = false;
          await new Promise<void>((_resolve, reject) => {
            rejectCommit = reject;
          });
        }
        commits.push(input);
      },
      publish: (record) => {
        published.push(`${record.projection.status}:${record.projection.revision}`);
      },
      warn: (message) => warnings.push(message),
      now: () => new Date(AT),
    });
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Review'));
    projection.bindChild('session-child', 'session-parent', 'subagent');
    projection.bindDispatch('session-parent', 'call-1', 'session-child');
    projection.handleSessionEvent('session-child', { type: 'turn/start', time: 2, data: {} });
    await tick();
    const baseline = projection.registry.forChannel('dm-alpha');
    expect(baseline[0]?.projection).toMatchObject({ status: 'running', revision: 2 });

    projection.handleSubagentEnd({ id: 'session-child', stopReason: 'completed' });
    await tick();
    expect(rejectCommit).toBeDefined();
    expect(projection.registry.forChannel('dm-alpha')).toEqual(baseline);
    expect(published).toEqual(['queued:1', 'running:2']);
    rejectCommit!(new Error('write failed'));
    await tick();
    expect(warnings).toEqual(['subagent-dispatch: Error: write failed']);
    expect(projection.registry.forChannel('dm-alpha')).toEqual(baseline);
    expect(published).toEqual(['queued:1', 'running:2']);
    expect(commits).toHaveLength(2);

    projection.handleSubagentEnd({ id: 'session-child', stopReason: 'completed' });
    await tick();
    expect(projection.registry.forChannel('dm-alpha')[0]?.projection).toEqual(
      commits[2]?.projection,
    );
    expect(published).toEqual(['queued:1', 'running:2', 'completed:3']);
    expect(commits).toHaveLength(3);
  });

  it('keeps reused provider call ids distinct across sessions and later call events', async () => {
    const { projection, commits } = harness();
    for (const sessionId of ['parent-1', 'parent-2']) {
      projection.handleSessionEvent(sessionId, { ...toolCall('call-1', sessionId), seq: 1 });
      projection.bindChild(`child-${sessionId}`, sessionId, 'subagent');
      projection.bindDispatch(sessionId, 'call-1', `child-${sessionId}`);
      projection.handleSessionEvent(`child-${sessionId}`, {
        type: 'turn/start',
        time: 2,
        data: {},
      });
      projection.handleSessionEvent(
        sessionId,
        toolResult('call-1', `Started Subagent child-${sessionId} on deepseek/model.`),
      );
    }
    projection.handleSubagentEnd({ id: 'child-parent-1', stopReason: 'completed' });
    projection.handleSessionEvent('parent-1', { ...toolCall('call-1', 'Later dispatch'), seq: 2 });
    projection.handleSessionEvent('parent-1', toolResult('call-1', 'Refused', true));
    await tick();
    const records = projection.registry.forChannel('dm-alpha');
    expect(records.map((record) => record.projection)).toEqual([
      expect.objectContaining({ parentSessionId: 'parent-1', status: 'completed', revision: 3 }),
      expect.objectContaining({ parentSessionId: 'parent-2', status: 'running', revision: 2 }),
      expect.objectContaining({ description: 'Later dispatch', status: 'declined', revision: 1 }),
    ]);
    expect(new Set(records.map((record) => record.projection.dispatchId)).size).toBe(3);
    expect(new Set(commits.map((commit) => commit.messageId)).size).toBe(3);
  });

  it('binds parallel background children by their dispatch call ids', async () => {
    const { projection, commits } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Deep review'));
    projection.handleSessionEvent('session-parent', toolCall('call-2', 'Read the changelog'));
    projection.bindChild('child-2', 'session-parent', 'subagent', {
      mode: 'continuable',
      label: 'Read the changelog',
    });
    projection.bindDispatch('session-parent', 'call-2', 'child-2');
    projection.bindChild('child-1', 'session-parent', 'subagent', {
      mode: 'continuable',
      label: 'Deep review',
    });
    projection.bindDispatch('session-parent', 'call-1', 'child-1');
    projection.handleSessionEvent('child-2', { type: 'turn/start', time: 2, data: {} });
    await tick();
    expect(projection.registry.forChannel('dm-alpha').map((record) => record.projection)).toEqual([
      expect.objectContaining({
        dispatchId: JSON.stringify(['session-parent', null, 1, 'call-2']),
        description: 'Read the changelog',
        status: 'running',
      }),
      expect.objectContaining({
        dispatchId: JSON.stringify(['session-parent', null, 1, 'call-1']),
        description: 'Deep review',
        status: 'queued',
      }),
    ]);
    expect(new Set(commits.map((commit) => commit.messageId)).size).toBe(2);
  });

  it('resolves identical and truncated labels by the child id in each tool result', async () => {
    const { projection } = harness();
    const description = 'a'.repeat(120);
    projection.handleSessionEvent('session-parent', toolCall('call-1', `${description} first`));
    projection.handleSessionEvent('session-parent', toolCall('call-2', `${description} second`));
    projection.handleSessionEvent('session-parent', toolCall('call-3', `${description} first`));
    for (const id of [3, 2, 1]) {
      projection.bindChild(`child-${id}`, 'session-parent', 'subagent', {
        mode: 'continuable',
        label: `${description} ${id === 2 ? 'second' : 'first'}`,
      });
      projection.handleSessionEvent(`child-${id}`, {
        type: 'request/header',
        time: 2,
        data: { header: { config: { provider: 'deepseek', model: `model-${id}` } } },
      });
      projection.handleSessionEvent(`child-${id}`, { type: 'turn/start', time: 3, data: {} });
    }
    for (const id of [2, 1, 3]) {
      projection.handleSessionEvent(
        'session-parent',
        toolResult(`call-${id}`, `Started Subagent child-${id} on deepseek/model-${id}.`),
      );
    }
    projection.handleSubagentEnd({ id: 'child-2', stopReason: 'error' });
    await tick();
    expect(projection.registry.forChannel('dm-alpha').map((record) => record.projection)).toEqual(
      [2, 1, 3].map((id) =>
        expect.objectContaining({
          dispatchId: JSON.stringify(['session-parent', null, 1, `call-${id}`]),
          description,
          status: id === 2 ? 'failed' : 'running',
          resolvedRoute: { provider: 'deepseek', model: `model-${id}` },
        }),
      ),
    );
  });

  it('keeps duplicate foreground failures bound through disposal and the tool result', async () => {
    const { projection, published } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Review'));
    projection.handleSessionEvent('session-parent', toolCall('call-2', 'Review'));
    for (const id of [2, 1]) {
      projection.bindChild(`child-${id}`, 'session-parent', 'subagent', {
        mode: 'one-shot',
        label: 'Review',
      });
      projection.handleSessionEvent(`child-${id}`, {
        type: 'request/header',
        time: 2,
        data: {
          header: {
            config: { provider: 'deepseek', model: `model-${id}`, reasoningEffort: 'high' },
          },
        },
      });
      projection.handleSessionEvent(`child-${id}`, { type: 'turn/start', time: 2, data: {} });
      projection.bindDispatch('session-parent', `call-${id}`, `child-${id}`);
      projection.handleSessionEvent(`child-${id}`, {
        type: 'turn/end',
        time: 3,
        data: { reason: { kind: id === 1 ? 'error' : 'completed' } },
      });
      projection.handleSubagentEnd({
        id: `child-${id}`,
        stopReason: id === 1 ? 'error' : 'completed',
      });
      projection.handleSessionDisposed(`child-${id}`);
    }
    await tick();
    expect(published).toEqual(['running:1', 'running:1']);
    projection.handleSessionEvent('session-parent', toolResult('call-1', 'Provider failed', true));
    projection.handleSessionEvent(
      'session-parent',
      toolResult('call-2', 'Subagent child-2 completed.'),
    );
    await tick();
    expect(projection.registry.forChannel('dm-alpha').map((record) => record.projection)).toEqual(
      [2, 1].map((id) =>
        expect.objectContaining({
          dispatchId: JSON.stringify(['session-parent', null, 1, `call-${id}`]),
          status: id === 1 ? 'failed' : 'completed',
          resolvedRoute: { provider: 'deepseek', model: `model-${id}`, reasoningEffort: 'high' },
        }),
      ),
    );
  });

  it('binds duplicate background children before or after their Job tool results', async () => {
    const { projection } = harness();
    for (const id of [1, 2]) {
      projection.handleSessionEvent('session-parent', toolCall(`call-${id}`, 'Review'));
    }
    const job = { kind: 'subagent', label: 'Review', owner: 'session-parent', status: 'running' };
    for (const id of [2, 1]) {
      projection.handleJobEvent({ type: 'registered', job: { ...job, id: `job-${id}` } });
      projection.bindChild(`child-${id}`, 'session-parent', 'fork', {
        mode: 'one-shot',
        label: 'Review',
      });
      projection.handleSessionEvent(`child-${id}`, {
        type: 'request/header',
        time: 2,
        data: {
          header: {
            config: { provider: 'deepseek', model: `model-${id}`, reasoningEffort: 'high' },
          },
        },
      });
      projection.handleSessionEvent(`child-${id}`, { type: 'turn/start', time: 3, data: {} });
    }
    projection.handleSessionEvent(
      'session-parent',
      toolResult('call-1', 'Started background Subagent Job job-1 on deepseek/model-1.'),
    );
    for (const id of [1, 2]) {
      projection.bindDispatch('session-parent', `call-${id}`, `child-${id}`, `job-${id}`);
    }
    await tick();
    expect(projection.registry.forChannel('dm-alpha').map((record) => record.projection)).toEqual(
      [1, 2].map((id) =>
        expect.objectContaining({
          dispatchId: JSON.stringify(['session-parent', null, 1, `call-${id}`]),
          status: 'running',
          resolvedRoute: { provider: 'deepseek', model: `model-${id}`, reasoningEffort: 'high' },
        }),
      ),
    );
    projection.handleJobEvent({ type: 'settled', job: { ...job, id: 'job-2', status: 'failed' } });
    projection.handleSessionEvent(
      'session-parent',
      toolResult('call-2', 'Started background Subagent Job job-2 on deepseek/model-2.'),
    );
    projection.handleJobEvent({
      type: 'settled',
      job: { ...job, id: 'job-1', status: 'completed' },
    });
    await tick();
    expect(projection.registry.forChannel('dm-alpha').map((record) => record.projection)).toEqual(
      [1, 2].map((id) =>
        expect.objectContaining({
          dispatchId: JSON.stringify(['session-parent', null, 1, `call-${id}`]),
          status: id === 1 ? 'completed' : 'failed',
          resolvedRoute: { provider: 'deepseek', model: `model-${id}`, reasoningEffort: 'high' },
        }),
      ),
    );
  });

  it('reports foreground disposal failure after the child turn completes', async () => {
    const { projection, published } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Review'));
    projection.bindChild('session-child', 'session-parent', 'subagent', {
      mode: 'one-shot',
      label: 'Review',
    });
    projection.bindDispatch('session-parent', 'call-1', 'session-child');
    projection.handleSessionEvent('session-child', { type: 'turn/start', time: 2, data: {} });
    projection.handleSessionEvent('session-child', {
      type: 'turn/end',
      time: 3,
      data: { reason: { kind: 'completed' } },
    });
    projection.handleSubagentEnd({ id: 'session-child', stopReason: 'completed' });
    projection.handleSessionDisposed('session-child');
    await tick();
    expect(published).toEqual(['queued:1', 'running:2']);
    projection.handleSessionEvent('session-parent', toolResult('call-1', 'Disposal failed', true));
    await tick();
    expect(published).toEqual(['queued:1', 'running:2', 'failed:3']);
  });

  it('keeps a Job-backed card running until cleanup settles the Job', async () => {
    const { projection, commits, published } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Deep review'));
    const job = {
      id: 'job-1',
      kind: 'subagent',
      label: 'Deep review',
      owner: 'session-parent',
      status: 'running',
    };
    projection.handleJobEvent({ type: 'registered', job });
    projection.bindChild('session-child', 'session-parent', 'subagent');
    projection.bindDispatch('session-parent', 'call-1', 'session-child', 'job-1');
    projection.handleSessionEvent('session-child', {
      type: 'subagent/descriptor',
      time: 2,
      data: { mode: 'one-shot', label: 'Deep review' },
    });
    projection.handleSessionEvent('session-child', { type: 'turn/start', time: 3, data: {} });
    projection.handleSessionEvent('session-child', {
      type: 'turn/end',
      time: 4,
      data: { reason: { kind: 'completed' } },
    });
    projection.handleSubagentEnd({ id: 'session-child', stopReason: { kind: 'completed' } });
    projection.handleSessionDisposed('session-child');
    await tick();
    expect(published).toEqual(['queued:1', 'running:2']);
    projection.handleJobEvent({ type: 'settled', job: { ...job, status: 'failed' } });
    await tick();
    expect(published).toEqual(['queued:1', 'running:2', 'failed:3']);
    expect(new Set(commits.map((commit) => commit.messageId)).size).toBe(1);
  });

  it('persists each one-shot transition on the same card', async () => {
    const { projection, commits, published } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Deep review'));
    projection.bindChild('session-child', 'session-parent', 'subagent');
    projection.bindDispatch('session-parent', 'call-1', 'session-child');
    await tick();
    expect(commits[0]).toMatchObject({
      channelId: 'dm-alpha',
      messageId: subagentDispatchMessageId(JSON.stringify(['session-parent', null, 1, 'call-1'])),
      body: 'Subagent: Deep review',
    });

    projection.handleSessionEvent('session-child', { type: 'turn/start', time: 2, data: {} });
    projection.handleSessionEvent('session-child', {
      type: 'subagent/descriptor',
      time: 3,
      data: { mode: 'one-shot', label: 'Deep review' },
    });
    projection.handleSessionEvent('session-child', {
      type: 'turn/end',
      time: 4,
      data: { reason: { kind: 'completed' } },
    });
    await tick();
    expect(published).toEqual(['queued:1', 'running:2']);
    projection.handleSessionEvent(
      'session-parent',
      toolResult('call-1', 'Subagent session-child completed.'),
    );
    await tick();
    expect(published).toEqual(['queued:1', 'running:2', 'completed:3']);
    expect(commits).toHaveLength(3);
  });

  it('declines a dispatch the tool refused without publishing a separate card', async () => {
    const { projection, commits, published } = harness();
    projection.handleSessionEvent('session-parent', toolCall('call-1', 'Read the changelog'));
    projection.handleSessionEvent('session-parent', {
      type: 'tool/result',
      time: 2,
      data: { message: { toolCallId: 'call-1', isError: true } },
    });
    await tick();
    expect(commits).toHaveLength(1);
    expect(commits[0]!.projection).toMatchObject({ status: 'declined', revision: 1 });
    expect(published).toEqual(['declined:1']);
  });
});
