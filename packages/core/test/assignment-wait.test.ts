import { describe, expect, it, vi } from 'vitest';
import { waitForAssignment } from '../src/runtime/assignment-wait.js';
import type { AssignmentDetail } from '../src/runtime/bot-runtime.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

function fixture() {
  let assignment: AssignmentDetail = {
    title: 'Assignment',
    sessionId: 'assignment',
    botSlug: 'ada',
    sourceEventId: 'source',
    description: 'Work',
    activity: 'working',
    createdAt: '2026-10-03',
    updatedAt: '2026-10-03',
  };
  let reportId: string | undefined;
  const listeners = new Set<() => void>();
  const release = vi.fn();
  const begin = vi.fn(() => release);
  const controller = new AbortController();
  const options = {
    read: () => ({ assignment, reportId }),
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    begin,
    signal: controller.signal,
    timeoutMs: 100,
  };
  return {
    options,
    begin,
    release,
    listeners,
    controller,
    report: () => {
      reportId = crypto.randomUUID();
      for (const changed of listeners) changed();
    },
    settle: () => {
      assignment = { ...assignment, activity: 'idle' };
      for (const changed of listeners) changed();
    },
  };
}

describe('explicit Assignment wait lifecycle', () => {
  it('settles on a committed report without waiting for Turn end and releases once', async () => {
    const f = fixture();
    const pending = waitForAssignment(f.options);
    f.report();
    expect(await pending).toMatchObject({ outcome: 'report', assignment: { activity: 'working' } });
    f.settle();
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.listeners.size).toBe(0);
  });
  it('observes completion racing subscription without losing the transition', async () => {
    const f = fixture();
    const result = await waitForAssignment({
      ...f.options,
      subscribe: (changed) => {
        f.settle();
        return f.options.subscribe(changed);
      },
    });
    expect(result.outcome).toBe('settled');
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.listeners.size).toBe(0);
  });
  it('cancels and times out without cancelling the Assignment or leaking listeners', async () => {
    const f = fixture();
    const waiting = waitForAssignment(f.options);
    const rejected = expect(waiting).rejects.toThrow('Cancelled');
    f.controller.abort(new Error('Cancelled'));
    await rejected;
    expect(f.release).toHaveBeenCalledTimes(1);
    expect(f.listeners.size).toBe(0);
    const timeout = fixture();
    expect(await waitForAssignment({ ...timeout.options, timeoutMs: 1 })).toMatchObject({
      outcome: 'timeout',
      assignment: { activity: 'working' },
    });
    expect(timeout.release).toHaveBeenCalledTimes(1);
    expect(timeout.listeners.size).toBe(0);
  });
  it('does not begin when already settled or invalid and fails closed on read failure', async () => {
    const f = fixture();
    f.settle();
    expect((await waitForAssignment(f.options)).outcome).toBe('settled');
    expect(f.begin).not.toHaveBeenCalled();
    expect(() => waitForAssignment({ ...f.options, timeoutMs: Infinity })).toThrow();
    const failed = fixture();
    let fail = false;
    const pending = waitForAssignment({
      ...failed.options,
      read: () => {
        if (fail) throw new Error('Query unavailable');
        return failed.options.read();
      },
    });
    fail = true;
    const rejected = expect(pending).rejects.toThrow('Query unavailable');
    failed.report();
    await rejected;
    expect(failed.release).toHaveBeenCalledTimes(1);
    expect(failed.listeners.size).toBe(0);
  });
});

describe('Assignment wait presentation', () => {
  it('selects real Assignment activity only while all Orchestrator calls explicitly wait', () => {
    const tracker = createBotStateTracker();
    const tool = (name: string, count = 1) => ({
      effect: 'generic-working' as const,
      toolKind: 'other' as const,
      toolName: name,
      startedAt: 1,
      activeToolCount: count,
    });
    tracker.setSessionState('ada', 'orch', 'working', tool('wait_for_assignment'), 'orchestrator');
    tracker.setSessionState('ada', 'assignment', 'working', tool('bash'), 'assignment');
    expect(tracker.activity('ada')?.toolName).toBe('wait_for_assignment');
    const before = tracker.version().revision;
    const end = tracker.beginAssignmentWait('ada', 'orch');
    expect(tracker.activity('ada')?.toolName).toBe('bash');
    expect(tracker.version().revision).toBeGreaterThan(before);
    tracker.setSessionState('ada', 'orch', 'working', tool('other', 2), 'orchestrator');
    expect(tracker.activity('ada')?.toolName).toBe('other');
    tracker.setSessionState('ada', 'orch', 'working', tool('wait_for_assignment'), 'orchestrator');
    expect(tracker.activity('ada')?.toolName).toBe('bash');
    end();
    end();
    expect(tracker.activity('ada')?.toolName).toBe('wait_for_assignment');
    const second = tracker.beginAssignmentWait('ada', 'orch');
    tracker.clearSession('ada', 'orch');
    second();
    tracker.setSessionState('ada', 'orch', 'working', tool('new-call'), 'orchestrator');
    expect(tracker.activity('ada')?.toolName).toBe('new-call');
    tracker.beginAssignmentWait('other', 'orch');
    expect(tracker.activity('ada')?.toolName).toBe('new-call');
  });
});
