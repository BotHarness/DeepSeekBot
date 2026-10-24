import { describe, expect, it } from 'vitest';
import { dailyReport, evaluate, issueBody } from '../long-run-observer.mjs';

const at = '2026-10-20T12:00:00.000Z';
const minutesAgo = (minutes) => Date.parse(at) - minutes * 60_000;

function bot(slug, { state = 'idle', sessions = [], owned = [], items = [] } = {}) {
  return {
    slug,
    activity: { bot: { slug, state, ...(sessions.length ? { sessions } : {}) } },
    attention: { items },
    sessions: { sessions: owned, total: owned.length },
  };
}

describe('long-run observer rules', () => {
  it('reports an unreachable Host only after consecutive failed checks', () => {
    const down = { at, reachable: false, error: 'host-unreachable', bots: [] };
    const first = evaluate(down, {});
    expect(first.findings).toEqual([]);
    const second = evaluate(down, first.state);
    expect(second.findings.map((finding) => finding.key)).toEqual(['host-unreachable']);
    expect(
      evaluate({ at, reachable: true, bots: [] }, second.state).state.consecutiveFailures,
    ).toBe(0);
  });

  it('flags a session with no activity past the stuck threshold', () => {
    const snapshot = {
      at,
      reachable: true,
      bots: [
        bot('editor', {
          state: 'working',
          sessions: [
            { id: 's-old', role: 'assignment', state: 'working', at: minutesAgo(150), revision: 1 },
            { id: 's-new', role: 'assignment', state: 'working', at: minutesAgo(5), revision: 1 },
            {
              id: 's-wait',
              role: 'orchestrator',
              state: 'waiting',
              at: minutesAgo(600),
              revision: 1,
            },
          ],
        }),
      ],
    };
    expect(evaluate(snapshot).findings.map((finding) => finding.key)).toEqual([
      'session-stalled:s-old',
    ]);
  });

  it('waits for a blocked Bot to stay blocked past the threshold', () => {
    const blocked = (when) => ({
      at: when,
      reachable: true,
      bots: [bot('growth', { state: 'blocked' })],
    });
    const first = evaluate(blocked(new Date(minutesAgo(130)).toISOString()));
    expect(first.findings).toEqual([]);
    const later = evaluate(blocked(at), first.state);
    expect(later.findings.map((finding) => finding.key)).toEqual(['bot-blocked:growth']);
    const recovered = evaluate({ at, reachable: true, bots: [bot('growth')] }, later.state);
    expect(recovered.state.blockedSince).toEqual({});
  });

  it('keeps names and summaries out of attention findings', () => {
    const item = {
      id: 'a1',
      botSlug: 'growth',
      reason: 'external-dm',
      state: 'needs-repair',
      createdAt: new Date(minutesAgo(10)).toISOString(),
      sourceKind: 'external',
      sourceChannelId: 'c1',
      sourceMessageId: 'm1',
      sourceAvailable: true,
      authorKind: 'bridged',
      externalOrigin: {
        platform: 'x',
        accountName: 'brand',
        conversationName: 'Jane Doe',
        conversationId: '1',
        senderId: '2',
        senderName: 'Jane Doe',
      },
      summary: 'Jane Doe asked for the skill link',
    };
    const [finding] = evaluate({
      at,
      reachable: true,
      bots: [bot('growth', { items: [item] })],
    }).findings;
    expect(finding.evidence).toEqual({ channelId: 'c1', messageId: 'm1' });
    const body = issueBody(finding, { trackingIssue: 1593, harnessTag: 'v-test', at });
    expect(body).not.toContain('Jane Doe');
    expect(body).toContain('`attention-needs-repair`');
  });

  it('groups old open Attention Units into one backlog finding per Bot', () => {
    const open = (id, minutes) => ({
      id,
      reason: 'group-mention',
      state: 'open',
      createdAt: new Date(minutesAgo(minutes)).toISOString(),
      sourceKind: 'channel',
      authorKind: 'human',
    });
    const snapshot = {
      at,
      reachable: true,
      bots: [bot('editor', { items: [open('a', 200), open('b', 180), open('c', 10)] })],
    };
    const [finding] = evaluate(snapshot).findings;
    expect(finding.key).toBe('attention-backlog:editor');
    expect(finding.facts.count).toBe(2);
  });

  it('summarises a day of checks and events', () => {
    const report = dailyReport(
      '2026-10-20',
      [
        { at, reachable: true, bots: [bot('editor', { state: 'working' })] },
        { at, reachable: false, bots: [] },
      ],
      [
        { at, type: 'opened', severity: 'major', title: 'editor stalled', issue: '12' },
        { at, type: 'intervention', note: 'restarted Host' },
      ],
    );
    expect(report).toContain('Checks: 2, Host unreachable in 1.');
    expect(report).toContain('major 1');
    expect(report).toContain('Human interventions: 1.');
    expect(report).toContain('- editor: working 1');
  });
});
