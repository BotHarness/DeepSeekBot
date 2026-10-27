// @vitest-environment jsdom
import { act, useLayoutEffect, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useFocusEffect: (work: () => () => void) => useLayoutEffect(work, [work]),
  useLocalSearchParams: () => ({}),
}));
vi.mock('react-native', () => import('./react-native-shim'));
vi.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
vi.mock('../src/ui/shell/icons', () => import('./shell-icons-shim'));
vi.mock('../src/host/host-session', () => ({ useHostSession: () => ({}) }));
vi.mock('react-native-keyboard-controller', () => ({ KeyboardAvoidingView: () => null }));
vi.mock('react-native-svg', () => ({ default: () => null, Path: () => null }));

import {
  laneLabel,
  loadAssignmentTimeline,
  parseAssignmentTimeline,
} from '../src/host/assignment-timeline';
import { MethodRefused, type HostClient } from '../src/host/client';
import { AssignmentDetail, AssignmentScreenBody } from '../src/ui/chat/assignment-screen';
import { t } from '../src/ui/strings';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let host: HTMLElement | undefined;
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = undefined;
});

async function render(element: ReactElement): Promise<HTMLElement> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root!.render(element));
  await act(async () => undefined);
  return host;
}

const now = new Date().toISOString();
const wire = {
  assignment: {
    sessionId: 'asg-1',
    botSlug: 'ada',
    sourceEventId: 'source-1',
    title: 'Check the release',
    description: 'Check that version 1.6 is live on every store.',
    activity: 'working',
    latestReport: { state: 'blocked', summary: 'Waiting on store review', at: now },
    createdAt: now,
    updatedAt: now,
  },
  omittedSubagents: 0,
  lanes: [
    {
      role: 'main',
      index: 0,
      sessionId: 'asg-1',
      omitted: 3,
      entries: [
        { status: 'done', kind: 'fetch', tool: 'browser_open', detail: 'play.google.com', at: now },
        { status: 'failed', kind: 'execute', tool: 'bash', at: now },
        { status: 'bogus', kind: 'read', tool: 'read', at: now },
      ],
    },
    {
      role: 'subagent',
      index: 1,
      sessionId: 'sub-1',
      title: 'Check App Store',
      omitted: 0,
      entries: [{ status: 'running', kind: 'unknown', tool: 'grep', at: now }],
    },
    { role: 'someone', index: 2, sessionId: 'sub-2', entries: [] },
  ],
};

describe('Assignment detail', () => {
  it('reads the timeline from the Host and drops unreadable parts', async () => {
    const call = vi.fn(async () => wire);
    const timeline = await loadAssignmentTimeline(
      { call } as unknown as HostClient,
      'ada',
      'asg-1',
    );
    expect(call).toHaveBeenCalledWith('assignmentTimeline', { slug: 'ada', sessionId: 'asg-1' });
    expect(timeline.lanes.map(laneLabel)).toEqual(['MAIN', 'SUBAGENT 01']);
    expect(timeline.lanes[0]!.entries.map((entry) => entry.tool)).toEqual(['browser_open', 'bash']);
    expect(timeline.lanes[1]!.entries[0]!.kind).toBe('other');
    expect(() => parseAssignmentTimeline({ lanes: [] })).toThrow();
  });

  it('shows status, Title, Description, the latest report and the grouped timeline', async () => {
    const view = await render(<AssignmentDetail timeline={parseAssignmentTimeline(wire)} />);
    const text = view.textContent ?? '';
    expect(text).toContain(t.profileAssignmentState.working);
    expect(text).toContain('Check the release');
    expect(text).toContain('Check that version 1.6 is live on every store.');
    expect(text).toContain(t.assignmentDetail.reportState.blocked);
    expect(text).toContain('Waiting on store review');
    expect(text).toContain('MAIN');
    expect(text).toContain('SUBAGENT 01');
    expect(text).toContain('Check App Store');
    expect(text).toContain(t.assignmentDetail.stepKind.fetch);
    expect(text).toContain('play.google.com');
    expect(text).toContain(`${t.assignmentDetail.stepState.failed} · bash`);
    expect(text).toContain(t.assignmentDetail.olderSteps(3));
    expect(text).toContain(t.assignmentDetail.askInChat);
    expect(view.querySelectorAll('[data-testid="assignment-step"]')).toHaveLength(3);
    expect(view.querySelector('button')).toBeNull();
  });

  it('groups MAIN steps and Subagents under the Orchestrator round that started them', async () => {
    const view = await render(
      <AssignmentDetail
        timeline={parseAssignmentTimeline({
          ...wire,
          rounds: [
            { index: 1, kind: 'created', at: now, instruction: 'Check the stores' },
            { index: 2, kind: 'continued', at: now, instruction: 'Now check Play too' },
            { index: 'x', kind: 'continued', at: now },
          ],
          omittedRounds: 1,
          lanes: [
            {
              role: 'main',
              index: 0,
              sessionId: 'asg-1',
              omitted: 0,
              entries: [
                {
                  status: 'done',
                  kind: 'fetch',
                  tool: 'open',
                  detail: 'apple.com',
                  at: now,
                  round: 1,
                },
                {
                  status: 'done',
                  kind: 'fetch',
                  tool: 'open',
                  detail: 'play.google.com',
                  at: now,
                  round: 2,
                },
              ],
            },
            {
              role: 'subagent',
              index: 1,
              sessionId: 'sub-1',
              title: 'Check App Store',
              round: 1,
              omitted: 0,
              entries: [],
            },
            {
              role: 'subagent',
              index: 2,
              sessionId: 'sub-2',
              title: 'Check Play',
              round: 2,
              omitted: 0,
              entries: [],
            },
          ],
        })}
      />,
    );
    const first = view.querySelector('[data-testid="assignment-round-1"]')!.textContent ?? '';
    const second = view.querySelector('[data-testid="assignment-round-2"]')!.textContent ?? '';
    expect(view.querySelector('[data-testid="assignment-round-earlier"]')).toBeNull();
    expect(first).toContain(t.assignmentDetail.round(1));
    expect(first).toContain(t.assignmentDetail.roundKind.created);
    expect(first).toContain('Check the stores');
    expect(first).toContain('apple.com');
    expect(first).toContain('SUBAGENT 01');
    expect(first).not.toContain('SUBAGENT 02');
    expect(second).toContain(t.assignmentDetail.roundKind.continued);
    expect(second).toContain('Now check Play too');
    expect(second).toContain('play.google.com');
    expect(second).toContain('Check Play');
    expect(view.textContent).toContain(t.assignmentDetail.olderRounds(1));
  });

  it('explains when the Assignment is gone', async () => {
    const client = {
      call: vi.fn(async () => {
        throw new MethodRefused('not-found', 'unknown Assignment: asg-1');
      }),
    } as unknown as HostClient;
    const view = await render(
      <AssignmentScreenBody client={client} slug="ada" sessionId="asg-1" />,
    );
    expect(view.textContent).toContain(t.assignmentDetail.notFound);
  });
});
