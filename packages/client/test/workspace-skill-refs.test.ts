import { describe, expect, it } from 'vitest';
import { sameSkillOwner } from '../src/client/skill-refs.js';

describe('Workspace Skill owner identity', () => {
  it('preserves selected identity across display-name changes', () => {
    const owner = { kind: 'workspace', workspaceId: 'stable-id', name: 'Original title' } as const;
    expect(sameSkillOwner(owner, { ...owner, name: 'Renamed' })).toBe(true);
    expect(sameSkillOwner(owner, { ...owner, workspaceId: 'other-id' })).toBe(false);
    expect(sameSkillOwner(owner, { kind: 'bot', botSlug: 'stable-id' })).toBe(false);
    expect(sameSkillOwner({ kind: 'host' }, owner)).toBe(false);
  });
});
