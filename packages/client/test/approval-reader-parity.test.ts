import { describe, expect, it, vi } from 'vitest';
import {
  readToolApprovalStatus,
  readUserQuestionStatus,
} from '@botharness/host-client/approval-readers';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { loadToolApprovalState, loadUserQuestionStatus } from '../src/client/bridge.js';

describe('Desktop and paired Host approval and question readers', () => {
  const channel = 'dm-tea';
  const message = 'request';

  it('returns the same pending approval state and rejects malformed approval replies', async () => {
    const pending = {
      status: 'pending',
      expiresAt: '2026-11-20T00:00:00Z',
      execution: 'waiting-human',
    };
    for (const value of [pending, { status: 'approved' }, { ...pending, execution: null }]) {
      const bridge = vi.fn().mockResolvedValue({ ok: true, value });
      const paired = { call: vi.fn().mockResolvedValue(value) };
      const desktop = loadToolApprovalState(bridge, channel, message);
      const phone = readToolApprovalStatus(paired, channel, message);
      if (value === pending) {
        await expect(desktop).resolves.toEqual(pending);
        await expect(phone).resolves.toEqual(pending);
      } else {
        await expect(desktop).rejects.toBeInstanceOf(HostAnswerInvalid);
        await expect(phone).rejects.toBeInstanceOf(HostAnswerInvalid);
      }
      expect(bridge.mock.calls[0]?.slice(0, 2)).toEqual(paired.call.mock.calls[0]);
    }
  });

  it('consistently reads answered questions and rejects an invalid approval card', async () => {
    const answered = { status: 'answered' };
    const desktop = vi.fn().mockResolvedValue({ ok: true, value: answered });
    const phone = { call: vi.fn().mockResolvedValue(answered) };
    await expect(loadUserQuestionStatus(desktop, channel, message)).resolves.toBe('answered');
    await expect(readUserQuestionStatus(phone, channel, message)).resolves.toEqual(answered);
    const malformed = { ...answered, approval: false };
    desktop.mockResolvedValue({ ok: true, value: malformed });
    phone.call.mockResolvedValue(malformed);
    await expect(loadUserQuestionStatus(desktop, channel, message)).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
    await expect(readUserQuestionStatus(phone, channel, message)).rejects.toBeInstanceOf(
      HostAnswerInvalid,
    );
  });
});
