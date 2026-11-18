import { Session, SessionId } from '@deepseek-ai/dsh-session';
import { describe, expect, it } from 'vitest';

import { openEngineDshSession } from '../src/engines/engine-dsh-session.js';
import { EngineTurnLog } from '../src/engines/engine-log.js';
import { summarizeAssignmentTimeline } from '../src/runtime/assignment-timeline.js';
import { memoryDsh } from './fixtures/engine-dsh.js';

const input =
  '[Human DM]\nSource Event ID: s1\nChannel: dm\nMessage ID: m1\n\n  Fix\t the build  \nMore detail';

describe('engine Session titles', () => {
  it('persists one readable title across turns and a restored Session', async () => {
    const dsh = memoryDsh();
    const first = await openEngineDshSession(dsh.store, dsh.persistence, 'engine-title', '/tmp');
    const turn = new EngineTurnLog(first, 'codex', 'ChatGPT Plus', input);
    await turn.end({ status: 'completed' });
    await new EngineTurnLog(first, 'codex', 'ChatGPT Plus', 'A second message').end({
      status: 'completed',
    });
    await first.close();
    const resumed = await openEngineDshSession(dsh.store, dsh.persistence, 'engine-title', '/tmp');
    await new EngineTurnLog(
      resumed,
      'codex',
      'ChatGPT Plus',
      '[Group]\nChannel: g\nLater message',
    ).end({ status: 'completed' });
    await resumed.close();
    const events = dsh.stored.get('engine-title')!.events;
    expect(
      events.filter((event) => event.type === 'session/title').map((event) => event.data.title),
    ).toEqual(['Fix the build']);
    expect(
      events.filter((event) => event.type === 'turn/start').map((event) => event.data.turn),
    ).toEqual([1, 2, 3]);
    expect(events.filter((event) => event.type === 'user/message')[0]?.data.content).toEqual([
      { type: 'text', text: input },
    ]);
    expect(
      summarizeAssignmentTimeline({ main: { sessionId: 'engine-title', events }, subagents: [] })
        .lanes[0],
    ).toMatchObject({ title: 'Fix the build' });
  });

  it('keeps an existing title when switching a Session to an engine', async () => {
    const session = Session.create(SessionId('existing-title'));
    session.append('session/title', {
      title: 'Existing DSH title',
      messageSeqs: [],
      source: { kind: 'user' },
    });
    const target = { session, flush: async () => undefined };
    await new EngineTurnLog(target, 'codex', 'ChatGPT Plus', input).end({ status: 'completed' });
    expect(
      session
        .snapshotEvents()
        .filter((event) => event.type === 'session/title')
        .map((event) => event.data.title),
    ).toEqual(['Existing DSH title']);
  });

  it('uses plain inbound text and leaves empty or unsafe titles unset', async () => {
    for (const [text, title] of [
      ['Hello\nNext line', 'Hello'],
      ['\n\t', undefined],
      ['Hidden\u202etitle', undefined],
    ]) {
      const session = Session.create(SessionId('plain-title'));
      await new EngineTurnLog(
        { session, flush: async () => undefined },
        'codex',
        'ChatGPT Plus',
        text ?? '',
      ).end({ status: 'completed' });
      expect(
        session
          .snapshotEvents()
          .filter((event) => event.type === 'session/title')
          .map((event) => event.data.title),
      ).toEqual(title === undefined ? [] : [title]);
    }
  });
});
