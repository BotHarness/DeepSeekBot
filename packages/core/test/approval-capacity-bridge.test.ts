import { OWNER_HUMAN_CONTEXT } from '../src/humans/context.js';
import { describe, expect, it, vi } from 'vitest';
import { createBridgeMethods } from '../src/bridge/methods.js';
import type { BotRuntime } from '../src/runtime/bot-runtime.js';
import type { ChannelStore } from '../src/channels/store.js';
import type { PersonaBotRegistry } from '../src/bots/registry.js';
import type { SessionOwnership } from '../src/sessions/ownership.js';
import type { RosterStore } from '../src/roster/store.js';
import { createBotStateTracker } from '../src/state/bot-state.js';

describe('approval capacity projection', () => {
  it('does not attach a later call’s wait to a historical approved card', () => {
    const assignmentApprovalWait = vi.fn(() => undefined);
    const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
      registry: {} as PersonaBotRegistry,
      channels: {
        get: () => ({ id: 'dm-ada', type: 'dm', botSlug: 'ada' }),
        message: () => ({
          toolApprovalRequest: { role: 'assignment', sessionId: 'original', callId: 'old-call' },
        }),
      } as unknown as ChannelStore,
      states: createBotStateTracker(),
      ownership: {} as SessionOwnership,
      roster: {} as RosterStore,
      runtime: {
        getAssignment: () => ({ activity: 'working', executionWait: 'waiting-capacity' }),
        assignmentApprovalWait,
      } as unknown as BotRuntime,
    });
    expect(methods.toolApprovalStatus({ channelId: 'dm-ada', messageId: 'old-card' })).toEqual({
      ok: true,
      value: { status: 'expired', execution: 'running' },
    });
    expect(assignmentApprovalWait).toHaveBeenCalledExactlyOnceWith('original', 'old-call');
  });

  it.each([
    ['working', 'waiting-human', 'waiting-human'],
    ['working', 'waiting-capacity', 'waiting-capacity'],
    ['working', undefined, 'running'],
    ['error', undefined, 'needs-repair'],
    ['idle', undefined, 'settled'],
  ])(
    'projects %s / %s without making another approval decision',
    (activity, executionWait, expected) => {
      const getAssignment = vi.fn(() => ({ activity, executionWait }));
      const channels = {
        get: () => ({ id: 'dm-ada', type: 'dm', botSlug: 'ada' }),
        message: () => ({ toolApprovalRequest: { role: 'assignment', sessionId: 'original' } }),
      } as unknown as ChannelStore;
      const methods = createBridgeMethods(OWNER_HUMAN_CONTEXT, {
        registry: {} as PersonaBotRegistry,
        channels,
        states: createBotStateTracker(),
        ownership: {} as SessionOwnership,
        roster: {} as RosterStore,
        runtime: { getAssignment } as unknown as BotRuntime,
      });
      expect(methods.toolApprovalStatus({ channelId: 'dm-ada', messageId: 'request' })).toEqual({
        ok: true,
        value: { status: 'expired', execution: expected },
      });
      expect(getAssignment).toHaveBeenCalledExactlyOnceWith('ada', 'original');
    },
  );
});
