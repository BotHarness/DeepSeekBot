import { describe, expect, it } from 'vitest';
import { approvalContent } from '../src/host/requests';

describe('approval display content boundary', () => {
  const request = {
    toolName: 'bash',
    role: 'orchestrator',
    cwd: '/qa',
    input: '{"command":"echo QA"}',
    allowAlways: true,
  };
  it('retains only validated display effects, without trusting extra properties', () => {
    const effects = {
      changes: 'irreversible',
      reach: 'external',
      personalData: true,
      authority: 'management',
      secrets: true,
    };
    expect(
      approvalContent({ ...request, effects: { ...effects, outcome: 'allowed-once' } }),
    ).toEqual({ ...request, effects });
  });
  it.each([
    {},
    { changes: 'none', reach: 'future', personalData: true },
    { changes: 'none', reach: 'local', personalData: 'yes' },
    { changes: 'none', reach: 'local', personalData: true, authority: 'automatic' },
  ])('omits malformed display effects: %j', (effects) => {
    expect(approvalContent({ ...request, effects })).toEqual(request);
  });
  it('retains only display content, never cached decision authority', () => {
    expect(
      approvalContent({
        ...request,
        status: 'pending',
        outcome: 'allowed-once',
        sessionId: 'session',
      }),
    ).toEqual(request);
  });
  it('preserves an empty working directory supplied by the Host', () => {
    expect(approvalContent({ ...request, cwd: '' })).toEqual({ ...request, cwd: '' });
  });
  it.each([
    null,
    {},
    { ...request, input: undefined },
    { ...request, role: 'other' },
    { ...request, cwd: undefined },
    { ...request, allowAlways: 'true' },
  ])('refuses malformed content instead of inventing input', (value) => {
    expect(approvalContent(value)).toBeUndefined();
  });
});
