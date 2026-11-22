import { describe, expect, it } from 'vitest';
import type { TurnTarget } from '@botharness/host-protocol/turn-target';
import { sessionTarget } from '../src/bridge/session-target.js';

const codex = { kind: 'engine', engine: 'codex', model: 'gpt-6-astra' } satisfies TurnTarget;
const native = {
  kind: 'dsh',
  provider: 'opencode-go',
  model: 'deepseek-v4.1-flash',
} satisfies TurnTarget;
const saved = { engine: 'codex', account: 'ChatGPT Pro', state: 'idle' };

describe('Session target projection', () => {
  it('adds the matching account to older recorded targets and supports pre-attribution Sessions', () => {
    expect(sessionTarget(codex, saved)).toEqual({ ...codex, account: 'ChatGPT Pro' });
    expect(sessionTarget(undefined, saved)).toEqual({
      kind: 'engine',
      engine: 'codex',
      account: 'ChatGPT Pro',
    });
  });

  it('keeps the actual target through mixed Routing Group switches and a native fallback', () => {
    const claude = {
      kind: 'engine',
      engine: 'claude',
      model: 'claude-opus-5-5',
      account: 'Claude Max',
    } satisfies TurnTarget;
    expect(sessionTarget(claude, saved)).toEqual(claude);
    expect(sessionTarget(native, saved)).toEqual(native);
    expect(sessionTarget({ ...codex, account: 'ChatGPT Plus' }, saved)).toEqual({
      ...codex,
      account: 'ChatGPT Plus',
    });
  });
});
