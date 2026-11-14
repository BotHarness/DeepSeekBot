import { describe, expect, it, vi } from 'vitest';

import { parseRoleModels, updateRole } from '../src/client/team-roles-bridge.js';
import { loadMemberUsage, modelChoices } from '../src/client/team-usage.js';

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
      routes: ['p/m'],
    });
    const call = vi.fn(async () => ({
      ok: true as const,
      value: { role: { roleId: 'r1', name: 'Design', models: { kind: 'only', routes: ['p/m'] } } },
    }));
    const role = await updateRole(call, {
      roleId: 'r1',
      models: { kind: 'only', routes: ['p/m'] },
    });
    expect(call).toHaveBeenCalledWith(
      'roleUpdate',
      { roleId: 'r1', models: { kind: 'only', routes: ['p/m'] } },
      undefined,
    );
    expect(role.models).toEqual({ kind: 'only', routes: ['p/m'] });
  });

  it('lists each provider/model route once', () => {
    expect(
      modelChoices([
        { provider: 'p', providerName: 'P', model: 'm', modelName: 'M', efforts: [] },
        { provider: 'p', providerName: 'P', model: 'm', modelName: 'M', efforts: [] },
      ]),
    ).toEqual([{ route: 'p/m', label: 'P · M' }]);
  });
});
