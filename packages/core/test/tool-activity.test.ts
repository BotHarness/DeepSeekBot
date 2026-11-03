import { describe, expect, it } from 'vitest';
import { Context } from '@deepseek-ai/cordis';
import { createBotStateTracker, personaBotActivitySnapshot } from '../src/state/bot-state.js';
import { createDshActivityProjection } from '../src/state/dsh-activity.js';
import {
  activityEffectForToolKind,
  aggregateToolActivity,
  readPublicToolDetail,
  withPublicToolDetail,
  type PersonaBotToolActivity,
} from '../src/state/tool-activity.js';
import { createTestOwnership } from './helpers.js';

const call = (id: string, name = 'search') => ({
  type: 'tool/call',
  time: 1000,
  data: {
    callId: id,
    name,
    arguments: JSON.stringify({
      secret: 'private-token',
      text: 'private reasoning',
      command: 'private-command',
    }),
  },
});
const result = (id: string) => ({
  type: 'tool/result',
  time: 2000,
  data: { message: { toolCallId: id, content: [{ type: 'text', text: 'private-result' }] } },
});
function setup(rootRole: 'orchestrator' | 'assignment' = 'orchestrator') {
  const states = createBotStateTracker();
  const ownership = createTestOwnership({
    root: { botSlug: 'ada', rootRole },
    child: { botSlug: 'ada', rootRole: 'assignment' },
  });
  const projection = createDshActivityProjection({
    states,
    ownership,
    describeCall: (_id, name) =>
      name === 'unknown'
        ? undefined
        : name === 'broken'
          ? (() => {
              throw Error('private failure');
            })()
          : {
              name,
              view:
                name === 'shell'
                  ? { card: 'terminal', title: 'private-command', cwd: 'private-path' }
                  : {
                      card: 'generic',
                      kind: 'search',
                      title: 'private title',
                      rawInput: 'private-token',
                    },
            },
  });
  return { states, projection };
}
describe('safe tool Activity', () => {
  it.each([
    ['read', 'coding'],
    ['edit', 'coding'],
    ['delete', 'coding'],
    ['move', 'coding'],
    ['search', 'searching'],
    ['fetch', 'searching'],
    ['execute', 'executing'],
    ['other', 'generic-working'],
    ['future', 'generic-working'],
    [undefined, 'generic-working'],
  ])('maps %s with a safe fallback', (kind, effect) =>
    expect(activityEffectForToolKind(kind)).toBe(effect),
  );
  it('pairs concurrent calls; one result cannot hide another active tool; changes same-state revisions', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a'));
    projection.handleSessionEvent('root', call('b'));
    expect(states.activity('ada')).toMatchObject({
      toolKind: 'search',
      effect: 'searching',
      activeToolCount: 2,
    });
    expect(states.version().revision).toBe(2);
    projection.handleSessionEvent('root', result('a'));
    expect(states.snapshot('ada').state).toBe('working');
    expect(states.activity('ada')?.activeToolCount).toBe(1);
    projection.handleSessionEvent('root', result('b'));
    expect(states.snapshot('ada').state).toBe('thinking');
    expect(states.activity('ada')).toBeUndefined();
  });
  it('coalesces mixed tool kinds across owned Assignment Sessions; removal restores the remaining effect', () => {
    const { states, projection } = setup('assignment');
    projection.handleSessionEvent('root', call('a'));
    projection.handleSessionEvent('child', call('b', 'shell'));
    expect(states.activity('ada')).toMatchObject({
      toolKind: 'other',
      effect: 'generic-working',
      activeToolCount: 2,
    });
    projection.handleSessionDisposed('child');
    expect(states.activity('ada')?.effect).toBe('searching');
    projection.handleSessionEvent('root', { type: 'turn/end', time: 3000, data: {} });
    expect(states.activity('ada')).toBeUndefined();
  });
  it('fails closed on unregistered or throwing presenters; does not expose model-provided names', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a', 'unknown'));
    expect(states.activity('ada')).toMatchObject({ toolKind: 'other', effect: 'generic-working' });
    expect(states.activity('ada')?.toolName).toBeUndefined();
    projection.handleSessionEvent('root', call('b', 'broken'));
    expect(states.activity('ada')?.effect).toBe('generic-working');
    projection.handleSessionEvent('unowned', call('c', 'shell'));
    expect(states.version().revision).toBe(2);
  });
  it('notifies a Cordis plugin consumer once after commit with snapshot revision; no payload contains private data', () => {
    const { states, projection } = setup();
    const ctx = new Context();
    const notifications: unknown[] = [];
    ctx.on('botharness/personabot/activity', (event) => {
      expect(personaBotActivitySnapshot(['ada'], states).revision).toBe(event.revision);
      expect(personaBotActivitySnapshot(['ada'], states).bots[0]).toEqual({
        slug: event.slug,
        state: event.state,
        active: event.active,
        activity: event.activity,
        sessions: event.sessions,
      });
      notifications.push(event);
    });
    const stop = states.onActivity((event) => ctx.emit('botharness/personabot/activity', event));
    projection.handleSessionEvent('root', call('a', 'shell'));
    projection.handleSessionEvent('root', call('a', 'shell'));
    expect(notifications).toHaveLength(1);
    expect(JSON.stringify(notifications)).not.toMatch(
      /private|arguments|content|rawInput|cwd|reasoning/,
    );
    expect(JSON.stringify(personaBotActivitySnapshot(['ada'], states))).not.toMatch(
      /private|arguments|content/,
    );
    stop();
    projection.handleSessionEvent('root', result('a'));
    expect(notifications).toHaveLength(1);
  });
  it('rebuilds pending tool facts and clears them at a durable Turn end', () => {
    const { states, projection } = setup();
    projection.rebuild([
      {
        id: 'root',
        header: {},
        snapshotEvents: () => [call('a', 'shell'), call('b'), result('a')],
      },
    ]);
    expect(states.activity('ada')).toMatchObject({ effect: 'searching', activeToolCount: 1 });
    projection.rebuild([
      {
        id: 'root',
        header: {},
        snapshotEvents: () => [call('a', 'shell'), { type: 'turn/end', time: 3000, data: {} }],
      },
    ]);
    expect(states.snapshot('ada').state).toBe('idle');
    expect(states.activity('ada')).toBeUndefined();
  });
  it('counts selected Orchestrator tools and hands off only after its Turn ends', () => {
    const { states, projection } = setup();
    projection.handleSessionEvent('root', call('a'));
    projection.handleSessionEvent('root', call('b'));
    projection.handleSessionEvent('child', call('c'));
    expect(states.activity('ada')).toMatchObject({
      activeToolCount: 2,
      effect: 'searching',
      sources: [{ role: 'orchestrator', count: 1 }],
    });
    expect(states.sessionActivity('ada')).toHaveLength(2);
    projection.handleSessionEvent('root', result('a'));
    expect(states.activity('ada')?.sources).toEqual([{ role: 'orchestrator', count: 1 }]);
    projection.handleSessionEvent('root', result('b'));
    expect(states.snapshot('ada').state).toBe('thinking');
    expect(states.activity('ada')).toBeUndefined();
    projection.handleSessionEvent('root', { type: 'turn/end', time: 3000, data: {} });
    expect(states.activity('ada')?.sources).toEqual([{ role: 'assignment', count: 1 }]);
    projection.handleSessionEvent('child', result('c'));
    expect(states.activity('ada')).toBeUndefined();
  });
  it('derives Subagent provenance during rebuild and ignores claimed source roles in tool payloads', () => {
    const { states, projection } = setup();
    const poisoned = {
      ...call('a'),
      data: { ...call('a').data, sourceRole: 'orchestrator', sessionId: 'private' },
    };
    projection.rebuild([
      {
        id: 'sub-one',
        header: { parentSession: 'root', origin: 'subagent' },
        snapshotEvents: () => [poisoned],
      },
      {
        id: 'sub-two',
        header: { parentSession: 'child', origin: 'subagent' },
        snapshotEvents: () => [call('b')],
      },
    ]);
    expect(states.activity('ada')?.sources).toEqual([{ role: 'subagent', count: 2 }]);
    expect(JSON.stringify(personaBotActivitySnapshot(['ada'], states))).not.toMatch(
      /private|sub-one|sub-two/,
    );
    projection.handleSessionDisposed('sub-one');
    expect(states.activity('ada')?.sources).toEqual([{ role: 'subagent', count: 1 }]);
    projection.handleSessionEvent('sub-two', { type: 'turn/end', time: 3000, data: {} });
    expect(states.activity('ada')).toBeUndefined();
  });
  it('keeps the outgoing authority allowlisted even when a trusted caller carries extra fields', () => {
    const states = createBotStateTracker();
    const activity = {
      effect: 'executing',
      toolKind: 'execute',
      startedAt: 1000,
      activeToolCount: 1,
      arguments: 'private',
    } satisfies PersonaBotToolActivity & { arguments: string };
    states.setSessionState('ada', 's', 'working', activity);
    expect(JSON.stringify(personaBotActivitySnapshot(['ada'], states))).not.toContain('private');
  });
});

describe('explicit Provider public Activity detail', () => {
  it('ignores native call-card titles and model payloads without a Provider declaration', () => {
    const tool = {
      presentCall: () => ({ card: 'generic', title: 'private-token', rawInput: 'secret' }),
    };
    expect(
      readPublicToolDetail(tool, { publicDetail: 'poisoned', secret: 'private' }),
    ).toBeUndefined();
    expect(readPublicToolDetail({ publicDetail: 'poisoned' }, {})).toBeUndefined();
  });
  it.each([
    '',
    '  ',
    'x'.repeat(161),
    'line\nbreak',
    'tab\tvalue',
    '\u202Ehidden',
    { text: 'private' },
    undefined,
  ])('fails closed for invalid Provider detail %j', (value) => {
    expect(
      readPublicToolDetail(
        withPublicToolDetail({}, () => value),
        {},
      ),
    ).toBeUndefined();
  });
  it('isolates a throwing Provider and publishes only its declared bounded text', () => {
    expect(
      readPublicToolDetail(
        withPublicToolDetail({}, () => {
          throw Error('private');
        }),
        {},
      ),
    ).toBeUndefined();
    expect(
      readPublicToolDetail(
        withPublicToolDetail({}, () => 'Opening a browser tab'),
        { url: 'private-token' },
      ),
    ).toBe('Opening a browser tab');
  });
  it('uses the exact Host declaration, preserves revision/event agreement and clears completed detail', () => {
    const states = createBotStateTracker();
    const ownership = createTestOwnership({ root: { botSlug: 'ada', rootRole: 'orchestrator' } });
    const tool = withPublicToolDetail({ name: 'browser_tabs' }, () => 'Opening a browser tab');
    const projection = createDshActivityProjection({
      states,
      ownership,
      describeCall: (_session, name, args) =>
        name === tool.name
          ? {
              name,
              ...(readPublicToolDetail(tool, args) === undefined
                ? {}
                : { publicDetail: readPublicToolDetail(tool, args)! }),
              view: { card: 'generic', kind: 'other', title: 'private title', rawInput: args },
            }
          : undefined,
    });
    const events: unknown[] = [];
    states.onActivity((event) => {
      expect(event.revision).toBe(personaBotActivitySnapshot(['ada'], states).revision);
      events.push(event);
    });
    projection.handleSessionEvent('root', {
      ...call('one', tool.name),
      data: {
        ...call('one', tool.name).data,
        publicDetail: 'private poisoned detail',
      },
    });
    expect(states.activity('ada')?.publicDetail).toBe('Opening a browser tab');
    expect(JSON.stringify(events)).not.toMatch(/private|rawInput|arguments|secret/);
    projection.handleSessionEvent('root', result('one'));
    expect(states.activity('ada')).toBeUndefined();
    expect(events).toHaveLength(2);
  });
  it('omits conflicting concurrent summaries and restores the remaining live one', () => {
    const base: PersonaBotToolActivity = {
      effect: 'generic-working',
      toolKind: 'other',
      toolName: 'browser_tabs',
      startedAt: 1000,
      activeToolCount: 1,
      publicDetail: 'Opening a browser tab',
    };
    expect(aggregateToolActivity([base, base])?.publicDetail).toBe(base.publicDetail);
    expect(
      aggregateToolActivity([base, { ...base, publicDetail: 'Closing a browser tab' }])
        ?.publicDetail,
    ).toBeUndefined();
    const missing = { ...base };
    delete missing.publicDetail;
    expect(aggregateToolActivity([base, missing])?.publicDetail).toBeUndefined();
    const states = createBotStateTracker();
    states.setSessionState('ada', 'one', 'working', base);
    states.setSessionState('ada', 'two', 'working', {
      ...base,
      publicDetail: 'Closing a browser tab',
    });
    expect(states.activity('ada')?.publicDetail).toBeUndefined();
    states.clearSession('ada', 'two');
    expect(states.activity('ada')?.publicDetail).toBe(base.publicDetail);
  });
});
