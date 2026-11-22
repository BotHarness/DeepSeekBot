import { describe, expect, it, vi } from 'vitest';

import { loadModelProviders } from '../src/model-providers';
import {
  loadEngineAccounts,
  loadSubscriptionAccounts,
  maskEmail,
  parseEngineAccounts,
  quotaCountdown,
  quotaLevel,
  quotaRemaining,
  quotaStale,
  refreshAccountQuota,
  shownQuotaWindows,
} from '../src/subscription-accounts';

const NOW = Date.parse('2026-11-22T00:00:00.000Z');
const HOUR = 3_600_000;
const at = (offset: number) => new Date(NOW + offset).toISOString();

describe('subscription accounts', () => {
  it('joins engine status with account email and prefers the account quota snapshot', () => {
    const selection = {
      botSlug: 'ada',
      role: 'assignment',
      engine: 'codex',
      accountId: 'codex-a',
      model: 'gpt-6',
      effort: 'high',
      fallback: false,
    };
    const view = parseEngineAccounts({
      revision: 3,
      accounts: [
        {
          id: 'claude',
          engine: 'claude',
          name: 'Claude Code',
          email: 'vain.test@example.org',
          quota: {
            observedAt: at(0),
            source: 'live',
            windows: {
              session: { remainingPercent: 27, resetsAt: at(HOUR) },
              weekly: { remainingPercent: 140, resetsAt: at(90 * HOUR) },
            },
          },
        },
        { id: 'codex-a', engine: 'codex', name: 'A', quota: { observedAt: at(0), windows: {} } },
      ],
      engines: [
        {
          engine: 'claude',
          accountId: 'claude',
          accountName: 'Claude Code',
          installed: true,
          available: true,
          version: '2.1.0',
          quota: { usedPercent: 10, observedAt: at(-HOUR) },
        },
        {
          engine: 'codex',
          accountId: 'codex-a',
          accountName: 'A',
          installed: true,
          available: true,
          quota: { usedPercent: 40, observedAt: at(-HOUR) },
        },
        {
          engine: 'codex',
          accountId: 'codex-b',
          installed: true,
          available: false,
          reason: 'weird',
        },
        { engine: 'other' },
      ],
      selections: [selection, { ...selection, role: 'unknown' }],
    });
    expect(view.revision).toBe(3);
    expect(view.accounts).toEqual([
      { id: 'claude', engine: 'claude', name: 'Claude Code' },
      { id: 'codex-a', engine: 'codex', name: 'A' },
    ]);
    expect(view.selections).toEqual([selection]);
    expect(view.engines.map((engine) => engine.accountId)).toEqual([
      'claude',
      'codex-a',
      'codex-b',
    ]);
    const [claude, codexA, codexB] = view.engines;
    expect(claude).toMatchObject({
      accountId: 'claude',
      accountName: 'Claude Code',
      available: true,
      installed: true,
      version: '2.1.0',
      email: 'vain.test@example.org',
      quota: { source: 'live' },
    });
    expect(claude?.quota?.windows.weekly?.remainingPercent).toBe(100);
    expect(codexA?.quota).toEqual({ windows: {}, usedPercent: 40, observedAt: at(-HOUR) });
    expect(codexB).toMatchObject({ available: false, reason: 'login-unknown' });
  });

  it('passes the grantable flag and filters malformed named accounts', async () => {
    const account = { id: 'codex-work', engine: 'codex', name: 'Work' };
    const host = {
      call: vi.fn(async () => ({
        accounts: [account, { ...account, engine: 'other' }, { ...account, name: 1 }],
        engines: [],
        selections: [],
      })),
    };
    await expect(loadEngineAccounts(host, true)).resolves.toEqual({
      accounts: [account],
      engines: [],
      selections: [],
    });
    expect(host.call).toHaveBeenCalledWith('engineAccounts', { grantable: true });
    expect(() => parseEngineAccounts({ engines: [], selections: [] }, true)).toThrow();
  });

  it('projects the shared status into the mobile account list and keeps a zero-percent snapshot', async () => {
    const host = {
      call: vi.fn(async () => ({
        revision: 1,
        accounts: [{ id: 'codex', quota: { observedAt: at(0), usedPercent: 0 } }],
        engines: [
          {
            engine: 'codex',
            accountId: 'codex',
            accountName: 'Work',
            installed: true,
            available: false,
            reason: 'signed-out',
            quota: { observedAt: at(-HOUR), usedPercent: 40 },
          },
        ],
        selections: [],
      })),
    };
    await expect(loadSubscriptionAccounts(host)).resolves.toEqual({
      revision: 1,
      accounts: [
        {
          engine: 'codex',
          id: 'codex',
          name: 'Work',
          installed: true,
          available: false,
          reason: 'signed-out',
          quota: { observedAt: at(0), usedPercent: 0, windows: {} },
        },
      ],
    });
    expect(host.call).toHaveBeenCalledWith('engineAccounts', {});
  });

  it('masks emails and derives remaining quota, level, staleness and countdown', () => {
    expect(maskEmail('vain.test@example.org')).toBe('va•••@e•••.org');
    expect(maskEmail('a@b')).toBe('a•••@b•••');
    expect(maskEmail('nobody')).toBe('•••');
    const quota = {
      observedAt: at(-10 * 60_000),
      source: 'live' as const,
      windows: {
        session: { remainingPercent: 74, resetsAt: at(-1) },
        weekly: { remainingPercent: 31, resetsAt: at(26 * HOUR + 5 * 60_000) },
      },
    };
    expect(shownQuotaWindows(quota, NOW).map((window) => window.id)).toEqual(['weekly']);
    expect(quotaRemaining(quota, NOW)).toBe(31);
    expect(quotaRemaining({ windows: {}, usedPercent: 40, observedAt: at(0) }, NOW)).toBe(60);
    expect(quotaStale(quota, NOW)).toBe(true);
    expect(quotaStale({ ...quota, observedAt: at(-60_000) }, NOW)).toBe(false);
    expect([quotaLevel(50), quotaLevel(49), quotaLevel(19)]).toEqual(['high', 'medium', 'low']);
    expect(quotaCountdown(at(26 * HOUR + 5 * 60_000), NOW)).toEqual({
      days: 1,
      hours: 2,
      minutes: 5,
    });
  });

  it('maps refresh answers and reads the provider list', async () => {
    const host = {
      call: vi.fn(async (method: string) =>
        method === 'engineAccountQuotaRefresh'
          ? { status: 'busy' }
          : {
              revision: 2,
              providers: [
                {
                  id: 'opencode-go',
                  name: 'Go',
                  keyStored: true,
                  keyLast4: '1234',
                  modelCount: 3,
                  availability: 'resting',
                  restingUntil: at(HOUR),
                  canRename: true,
                  canReplaceKey: true,
                  canRemove: true,
                  revision: 2,
                },
                { id: 1 },
              ],
            },
      ),
    };
    await expect(refreshAccountQuota(host, 'claude')).resolves.toBe('unavailable');
    expect(host.call).toHaveBeenCalledWith('engineAccountQuotaRefresh', { id: 'claude' });
    await expect(loadModelProviders(host)).resolves.toEqual({
      revision: 2,
      providers: [
        {
          id: 'opencode-go',
          name: 'Go',
          keyStored: true,
          keyLast4: '1234',
          modelCount: 3,
          availability: 'resting',
          restingUntil: at(HOUR),
          canRename: true,
          canReplaceKey: true,
          canRemove: true,
          revision: 2,
        },
      ],
    });
    expect(host.call).toHaveBeenCalledWith('modelProviders', {});
  });
});
