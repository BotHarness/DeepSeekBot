import { describe, expect, it } from 'vitest';
import { resolveGrants } from '../src/kernel/grants.js';

type Capability = 'approve' | 'reject' | 'answer' | 'save-rules';

const source = (
  id: string,
  choices: Partial<Record<'allow' | 'deny' | 'delegateAllow' | 'delegateDeny', Capability[]>>,
) => ({ id, allow: [], deny: [], ...choices });

describe('resolveGrants', () => {
  it('unions allows across roles, groups and people', () => {
    const resolved = resolveGrants([
      source('role', { allow: ['approve'] }),
      source('group', { allow: ['answer', 'approve'] }),
    ]);
    expect(resolved.granted).toEqual(['approve', 'answer']);
    expect(resolved.denied).toEqual([]);
  });

  it('lets any deny win over every allow', () => {
    const resolved = resolveGrants([
      source('role', { allow: ['approve', 'reject'] }),
      source('person', { deny: ['approve'] }),
    ]);
    expect(resolved.granted).toEqual(['reject']);
    expect(resolved.denied).toEqual(['approve']);
  });

  it('resolves delegation separately from the capabilities themselves', () => {
    const resolved = resolveGrants([
      source('role', { allow: ['approve'], delegateAllow: ['approve', 'answer'] }),
      source('group', { delegateDeny: ['answer'] }),
    ]);
    expect(resolved.granted).toEqual(['approve']);
    expect(resolved.delegable).toEqual(['approve']);
    expect(resolved.deniedDelegable).toEqual(['answer']);
  });

  it('keeps every source so the result can explain itself', () => {
    const sources = [
      source('role', { allow: ['approve'] }),
      source('person', { deny: ['approve'] }),
    ];
    expect(resolveGrants(sources).sources.map(({ id }) => id)).toEqual(['role', 'person']);
  });

  it('orders by and limits to a catalog when one is given', () => {
    const resolved = resolveGrants(
      [{ allow: ['save-rules', 'unknown' as Capability, 'approve'], deny: [] }],
      ['approve', 'reject', 'save-rules'] as Capability[],
    );
    expect(resolved.granted).toEqual(['approve', 'save-rules']);
  });
});
