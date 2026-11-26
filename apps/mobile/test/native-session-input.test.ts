import { approvalCommand, readableInput } from '@botharness/host-client/requests';
import { describe, expect, it, vi } from 'vitest';
import { MethodRefused } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { HostSessionPendingInput } from '@botharness/host-protocol/host-sessions';
import {
  nativeApprovalDecision,
  nativeApprovalPort,
  nativeApprovalRequest,
  nativeQuestionPort,
  nativeSessionControls,
  pendingInputKey,
  shownPendingInput,
  type NativeApprovalInput,
  type NativeQuestionInput,
} from '../src/features/sessions/native-session-input';

const owner = {
  hostId: 'h',
  hostName: 'Computer',
  routes: [],
  deviceId: 'd',
  credential: 'c',
} as SavedHost;
const member = {
  ...owner,
  member: {
    humanId: 'm',
    displayName: 'Member',
    username: 'member',
    fingerprint: 'a'.repeat(64),
    mustChangePassword: false,
  },
} as SavedHost;

const approval: NativeApprovalInput = {
  kind: 'approval',
  requestId: 'req-1',
  toolName: 'bash',
  callId: 'call-1',
};
const question: NativeQuestionInput = {
  kind: 'question',
  requestId: 'q-1',
  questions: [{ id: 'color', question: 'Which colour?', options: [{ label: 'Blue' }] }],
};

describe('native Session controls', () => {
  it('gives the Owner answers, Stop while running and Archive while idle', () => {
    expect(nativeSessionControls({ native: true, host: owner, running: true })).toEqual({
      answer: true,
      stop: true,
      archive: false,
    });
    expect(nativeSessionControls({ native: true, host: owner, running: false })).toEqual({
      answer: true,
      stop: false,
      archive: true,
    });
  });

  it('never offers them to a Team member, an unknown Host or a Bot Session', () => {
    const none = { answer: false, stop: false, archive: false };
    for (const running of [true, false]) {
      expect(nativeSessionControls({ native: true, host: member, running })).toEqual(none);
      expect(nativeSessionControls({ native: true, host: undefined, running })).toEqual(none);
      expect(nativeSessionControls({ native: false, host: owner, running })).toEqual(none);
    }
  });
});

describe('pending input', () => {
  const pending: HostSessionPendingInput[] = [approval, question];

  it('hides requests already answered here until the Host drops them', () => {
    expect(shownPendingInput(pending, new Set(['req-1']))).toEqual([question]);
    expect(shownPendingInput(undefined, new Set())).toEqual([]);
  });

  it('keys the list by request so a changed card set republishes', () => {
    expect(pendingInputKey(pending)).not.toBe(pendingInputKey([question]));
    expect(pendingInputKey(undefined)).toBe(pendingInputKey([]));
  });
});

describe('approval request', () => {
  it('shows the pending tool call detail, with no Always allow', () => {
    const request = nativeApprovalRequest(approval, {
      cwd: '/work',
      items: [
        {
          kind: 'tool',
          id: 'call-1',
          tool: 'bash',
          toolKind: 'execute',
          status: 'running',
          detail: 'ls -la',
          at: '2026-11-25T00:00:00Z',
        },
      ],
    });
    expect(request).toMatchObject({
      toolName: 'bash',
      cwd: '/work',
      allowAlways: false,
      status: 'pending',
    });
    expect(approvalCommand(request.toolName, request.input)).toBe('ls -la');
  });

  it('shows the Host preview as the command and keeps the DSH reason under Details', () => {
    const request = nativeApprovalRequest(
      { ...approval, preview: 'echo READY', reason: 'escalate sandbox to danger-full-access' },
      {},
    );
    expect(approvalCommand(request.toolName, request.input)).toBe('echo READY');
    expect(readableInput(request.input)).toEqual([
      { label: 'command', value: 'echo READY' },
      { label: 'reason', value: 'escalate sandbox to danger-full-access' },
    ]);
    const other = nativeApprovalRequest(
      { ...approval, toolName: 'write_file', preview: 'notes/plan.md' },
      {},
    );
    expect(readableInput(other.input)).toEqual([{ label: 'input', value: 'notes/plan.md' }]);
  });

  it('falls back to the DSH reason when the tool row is not in the transcript yet', () => {
    expect(nativeApprovalRequest({ ...approval, reason: 'Runs a shell' }, {}).input).toBe(
      'Runs a shell',
    );
  });

  it('accepts only Allow once and Reject', () => {
    expect(nativeApprovalDecision('allowed-once')).toBe('allowed-once');
    expect(nativeApprovalDecision('rejected')).toBe('rejected');
    expect(() => nativeApprovalDecision('allowed-always-tool')).toThrow();
  });
});

describe('ports', () => {
  it('answers an approval through the Host and reports it settled', async () => {
    const call = vi.fn(async () => ({ sessionId: 's', accepted: true }));
    const settled = vi.fn();
    const port = nativeApprovalPort(
      { call },
      's',
      'req-1',
      nativeApprovalRequest(approval, {}),
      settled,
    );
    expect((await port.load()).status).toBe('pending');
    await expect(port.decide('rejected')).resolves.toBe('accepted');
    expect(call).toHaveBeenCalledWith('sessionAnswerApproval', {
      sessionId: 's',
      requestId: 'req-1',
      decision: 'rejected',
    });
    expect(settled).toHaveBeenCalledWith('accepted');
    expect((await port.load()).status).toBe('decided');
  });

  it('reads a request answered elsewhere as decided', async () => {
    const call = vi.fn(async () => {
      throw new MethodRefused('session-input-not-pending', 'no longer pending');
    });
    const settled = vi.fn();
    const port = nativeQuestionPort({ call }, 's', question, settled);
    await expect(port.answer({ answers: [{ id: 'color', selected: ['Blue'] }] })).resolves.toBe(
      'decided',
    );
    expect(settled).toHaveBeenCalledWith('decided');
  });

  it('keeps the card answerable when the Host fails', async () => {
    const call = vi.fn(async () => {
      throw new Error('offline');
    });
    const settled = vi.fn();
    const port = nativeQuestionPort({ call }, 's', question, settled);
    await expect(port.answer({ answers: [{ id: 'color', selected: ['Blue'] }] })).rejects.toThrow(
      'offline',
    );
    expect(settled).not.toHaveBeenCalled();
    expect((await port.load()).status).toBe('pending');
  });
});
