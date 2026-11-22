import { describe, expect, it, vi } from 'vitest';
import type { SessionModelState } from '@botharness/host-protocol/session-model';
import { currentOrchestratorSession, sessionModel } from '@botharness/host-client/session-model';
import { en, zh } from '../src/features/sessions/strings';
import { sessionModelLabel } from '../src/ui/chat/session-model-label';

const api = { kind: 'model', provider: 'opencode-go', model: 'deepseek-v4.1-flash' } as const;
const engine = {
  kind: 'engine',
  engine: 'claude',
  accountId: 'work',
  model: 'claude-opus-5-5',
  effort: 'high',
} as const;
const catalog = {
  models: [
    {
      provider: api.provider,
      providerName: 'OpenCode Go',
      model: api.model,
      modelName: 'DeepSeek V4.1 Flash',
      defaultEffort: 'medium',
    },
  ],
  groups: [],
  engines: [
    {
      engine: 'claude' as const,
      available: true as const,
      accountId: 'work',
      accountName: 'Private account name',
      models: [{ id: engine.model, name: 'Claude Opus 5.5', efforts: [], defaultEffort: 'high' }],
    },
  ],
};
const state: SessionModelState = { override: engine, default: api };

describe('DM Session Model Choice', () => {
  it('resolves the Host’s current Orchestrator, even with newer historical and Assignment Sessions', async () => {
    const target = { kind: 'dsh', provider: api.provider, model: api.model };
    const call = vi.fn().mockResolvedValue({
      sessions: [
        { role: 'assignment', sessionId: 'assignment' },
        {
          role: 'orchestrator',
          sessionId: 'current',
          currentOrchestrator: true,
          currentTarget: target,
        },
        { role: 'orchestrator', sessionId: 'newer', currentOrchestrator: false },
      ],
    });
    await expect(currentOrchestratorSession({ call }, 'ada')).resolves.toEqual({
      id: 'current',
      target,
    });
    expect(call).toHaveBeenCalledExactlyOnceWith('sessions', { slug: 'ada' });
    call.mockResolvedValue({
      sessions: [{ role: 'orchestrator', sessionId: 'past', currentOrchestrator: false }],
    });
    await expect(currentOrchestratorSession({ call }, 'ada')).resolves.toBeUndefined();
  });

  it('saves and clears the choice on the exact Session and preserves Host refusals', async () => {
    const call = vi.fn().mockResolvedValueOnce(state).mockResolvedValueOnce({
      override: null,
      default: api,
      active: null,
    });
    await expect(sessionModel({ call }, 'ada', 'current', engine)).resolves.toEqual(state);
    await expect(sessionModel({ call }, 'ada', 'current', null)).resolves.toMatchObject({
      override: null,
      active: null,
    });
    expect(call.mock.calls).toEqual([
      ['sessionModel', { slug: 'ada', sessionId: 'current', choice: engine }],
      ['sessionModel', { slug: 'ada', sessionId: 'current', choice: null }],
    ]);
    const error = new Error('model-not-allowed');
    call.mockRejectedValueOnce(error);
    await expect(sessionModel({ call }, 'ada', 'current', engine)).rejects.toBe(error);
  });

  it('shows only the brand while resolving the display name', () => {
    expect(sessionModelLabel({ state, width: 390, strings: en.sessionModel })).toEqual({
      brand: 'claude',
      accessible: 'Model choice',
    });
  });

  it('uses the short name and localized effort, then hides effort before the name', () => {
    const base = { state, catalog, strings: zh.sessionModel };
    expect(sessionModelLabel({ ...base, width: 390 })).toMatchObject({
      brand: 'claude',
      name: 'Opus 5.5',
      effort: '高',
      accessible: '模型选择，Opus 5.5，高',
    });
    expect(sessionModelLabel({ ...base, width: 270 })).toEqual({
      brand: 'claude',
      name: 'Opus 5.5',
      accessible: '模型选择，Opus 5.5，高',
    });
    expect(sessionModelLabel({ ...base, width: 205 })).toEqual({
      brand: 'claude',
      accessible: '模型选择，Opus 5.5，高',
    });
  });

  it('shows next Turn only when an active Turn captured a different choice', () => {
    const pending = { state: { ...state, active: null }, catalog, width: 390 };
    expect(sessionModelLabel({ ...pending, strings: en.sessionModel }).name).toBe(
      'Next turn: Opus 5.5',
    );
    expect(sessionModelLabel({ ...pending, strings: zh.sessionModel }).name).toBe(
      '下一轮使用 Opus 5.5',
    );
    expect(
      sessionModelLabel({
        ...pending,
        state: { ...state, active: engine },
        strings: en.sessionModel,
      }).name,
    ).toBe('Opus 5.5');
  });
});
