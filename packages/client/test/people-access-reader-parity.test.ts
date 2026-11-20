import { expect, it, vi } from 'vitest';
import { readAssignmentAccess } from '@botharness/host-client/access-readers';
import { HostAnswerInvalid } from '@botharness/host-client/host-answer';
import { readHumanIdentity } from '@botharness/host-client/human-profile';
import { readHumanAssignmentContext } from '@botharness/host-client/people';
import {
  loadAssignmentAccess,
  loadHumanAssignmentContext,
  loadHumanIdentity,
  type BridgeCall,
} from '../src/client/bridge.js';

const identity = { humanId: 'mia', displayName: 'Mia', defaultDisplayName: null };
const at = '2026-11-20T00:00:00Z';
const ref = { slug: 'tea', sessionId: 's', sourceEventId: 'r' };
const context = {
  botSlug: ref.slug,
  sessionId: ref.sessionId,
  sourceEventId: ref.sourceEventId,
  title: 'Tea',
  description: 'Brew tea',
  purpose: 'Brew tea',
  canReply: true,
  reports: [{ sourceEventId: 'r', state: 'waiting-human', summary: 'Which tea?', at }],
};
const preset = { botSlug: 'tea', mode: 'workspace-write', revision: 4, scope: 'assignments' };
type Direct = { call: (method: string, args?: Record<string, unknown>) => Promise<unknown> };

it.each<{
  desktop: (call: BridgeCall) => Promise<unknown>;
  paired: (call: Direct) => Promise<unknown>;
  valid: unknown;
  invalid: unknown;
  expected: unknown;
}>([
  {
    desktop: loadHumanIdentity,
    paired: readHumanIdentity,
    valid: identity,
    invalid: { ...identity, profileSetup: true },
    expected: identity,
  },
  {
    desktop: (call) => loadHumanAssignmentContext(call, ref.slug, ref.sessionId, ref.sourceEventId),
    paired: async (call) => (await readHumanAssignmentContext(call, ref)).context,
    valid: { context },
    invalid: { context: { ...context, hasOlder: 'yes' } },
    expected: context,
  },
  {
    desktop: (call) => loadAssignmentAccess(call, 'tea'),
    paired: async (call) => (await readAssignmentAccess(call, 'tea')).preset,
    valid: { preset },
    invalid: { preset: { ...preset, revision: undefined } },
    expected: preset,
  },
])(
  'validates people, Assignment, and access answers the same way on desktop and paired Hosts',
  async ({ desktop, paired, valid, invalid, expected }) => {
    const bridge = vi.fn().mockResolvedValue({ ok: true, value: valid });
    const phone = { call: vi.fn().mockResolvedValue(valid) };
    await expect(desktop(bridge)).resolves.toEqual(expected);
    await expect(paired(phone)).resolves.toEqual(expected);
    expect(bridge.mock.calls[0]?.slice(0, 2)).toEqual(phone.call.mock.calls[0]);
    bridge.mockResolvedValue({ ok: true, value: invalid });
    phone.call.mockResolvedValue(invalid);
    await expect(desktop(bridge)).rejects.toBeInstanceOf(HostAnswerInvalid);
    await expect(paired(phone)).rejects.toBeInstanceOf(HostAnswerInvalid);
  },
);
