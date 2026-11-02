import { describe, expect, it } from 'vitest';
import { profileHostSource } from '../src/ui/chat/profile-host-source';

describe('Profile child Host ownership', () => {
  it('uses the direct child target before a different selected environment', () => {
    expect(profileHostSource({ hostId: 'qa-a' }, undefined, 'selected-b')).toBe('qa-a');
  });

  it('inherits the same navigator entry for deeper children without another Host', () => {
    expect(profileHostSource({ path: 'SOUL.md' }, { hostId: 'qa-a' }, 'selected-b')).toBe('qa-a');
  });

  it('honors a child explicit source before its navigator entry', () => {
    expect(profileHostSource({ hostId: 'qa-b' }, { hostId: 'qa-a' }, 'selected-c')).toBe('qa-b');
  });

  it('keeps the established Profile source when no routed Host exists', () => {
    expect(profileHostSource(undefined, undefined, 'opened-a')).toBe('opened-a');
  });

  it('never falls back to another environment for a malformed explicit target', () => {
    expect(profileHostSource({ hostId: ['qa-a', 'qa-b'] }, { hostId: 'qa-a' }, 'selected-c')).toBe(
      '',
    );
    expect(profileHostSource({ hostId: '' }, undefined, 'selected-b')).toBe('');
  });
});
