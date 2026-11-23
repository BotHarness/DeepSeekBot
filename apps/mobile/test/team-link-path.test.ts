import { describe, expect, it } from 'vitest';
import { teamInvitationRoute } from '@botharness/host-client/connect-input';

describe('Team invitation links opened by the system', () => {
  it('routes store, Dev and already-stripped invitation paths to sign-in', () => {
    for (const path of [
      'deepseekbot://team?i=eyJ2IjoxfQ',
      'deepseekbot-dev://team?i=eyJ2IjoxfQ',
      'deepseekbot-dev:///team?i=eyJ2IjoxfQ',
      '/team?i=eyJ2IjoxfQ',
      'deepseekbot://team?x=1&i=eyJ2IjoxfQ',
    ])
      expect(teamInvitationRoute(path)).toBe('/pair/team?i=eyJ2IjoxfQ');
  });

  it('leaves pairing, unknown schemes and malformed invitations to other handlers', () => {
    for (const path of [
      'deepseekbot://pair?p=abc',
      'https://evil.example/team?i=eyJ2IjoxfQ',
      'other://team?i=eyJ2IjoxfQ',
      'deepseekbot://team?i=',
      'deepseekbot://teams?i=eyJ2IjoxfQ',
    ])
      expect(teamInvitationRoute(path)).toBeUndefined();
  });
});
