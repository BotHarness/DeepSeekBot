import { describe, expect, it, vi } from 'vitest';

import {
  parseRole,
  parseRoleModels,
  roleAllowsProvider,
  updateRole,
} from '../src/client/team-roles-bridge.js';
import { loadMemberUsage } from '../src/client/team-usage.js';

describe('Team usage and model allowlists client', () => {
  it('reads per-member usage sorted by total, dropping malformed rows', async () => {
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        legacy: true,
        members: [
          { humanId: 'h1', displayName: 'Amy', totals: { totalTokens: 10, partial: false } },
          { displayName: 'nobody' },
          {
            humanId: 'h2',
            displayName: 'Bob',
            deleted: true,
            totals: { totalTokens: 500, partial: true },
            bots: [
              { slug: 'a', totals: { totalTokens: 100 } },
              { slug: 'b', displayName: 'Bee', totals: { totalTokens: 400 } },
            ],
          },
        ],
      },
    }));
    const view = await loadMemberUsage(call, 'week');
    expect(call).toHaveBeenCalledWith('usageByMember', { period: 'week' }, undefined);
    expect(view.legacy).toBe(true);
    expect(view.members.map((row) => row.humanId)).toEqual(['h2', 'h1']);
    expect(view.members[0]?.deleted).toBe(true);
    expect(view.members[0]?.bots.map((bot) => bot.displayName)).toEqual(['Bee', 'a']);
  });

  it('defaults role models to all and sends only-lists through roleUpdate', async () => {
    expect(parseRoleModels(undefined)).toEqual({ kind: 'all' });
    expect(parseRoleModels({ kind: 'only', routes: ['p/m', 3] })).toEqual({
      kind: 'only',
      providers: [],
      routes: ['p/m'],
    });
    const call = vi.fn(async () => ({
      ok: true as const,
      value: {
        role: {
          roleId: 'r1',
          name: 'Design',
          models: { kind: 'only', providers: ['q'], routes: ['p/m'] },
        },
      },
    }));
    const role = await updateRole(call, {
      roleId: 'r1',
      models: { kind: 'only', providers: ['q'], routes: ['p/m'] },
    });
    expect(call).toHaveBeenCalledWith(
      'roleUpdate',
      { roleId: 'r1', models: { kind: 'only', providers: ['q'], routes: ['p/m'] } },
      undefined,
    );
    expect(role.models).toEqual({ kind: 'only', providers: ['q'], routes: ['p/m'] });
  });

  it('shows provider access for exact grants, whole providers and all models', () => {
    const mixed = parseRole({
      roleId: 'r1',
      name: 'Design',
      models: { kind: 'only', routes: ['p/m'], providers: ['q'] },
    })!;
    expect(roleAllowsProvider(mixed, 'p')).toBe(true);
    expect(roleAllowsProvider(mixed, 'q')).toBe(true);
    expect(roleAllowsProvider(mixed, 'p-2')).toBe(false);
    expect(roleAllowsProvider({ ...mixed, models: { kind: 'all' } }, 'r')).toBe(true);
  });
});
