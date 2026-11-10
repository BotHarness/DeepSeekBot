import { describe, expect, it } from 'vitest';
import {
  classifyTurn,
  degradedCapabilities,
  parseCanaryArgs,
  resolveDshTag,
} from '../dsh-canary.mjs';

describe('DSH canary', () => {
  it('passes once the Orchestrator turn reaches the model, even without a model key', () => {
    expect(
      classifyTurn(
        [
          { id: 'ask' },
          { id: 'f', sessionFailure: { code: 'MISSING_CREDENTIAL', detail: 'no key' } },
        ],
        'canary',
        new Set(['ask']),
      ),
    ).toMatchObject({ state: 'pass' });
    expect(
      classifyTurn(
        [{ id: 'r', author: { kind: 'bot', slug: 'canary' } }, { id: 'ask' }],
        'canary',
        new Set(['ask']),
      ),
    ).toMatchObject({ state: 'pass' });
  });

  it('fails on a setup crash and keeps the original error', () => {
    expect(
      classifyTurn(
        [
          { id: 'ask' },
          { id: 'f', sessionFailure: { detail: 'agentCtx.tools.presentAs is not a function' } },
        ],
        'canary',
        new Set(['ask']),
      ),
    ).toEqual({ state: 'fail', evidence: 'no code: agentCtx.tools.presentAs is not a function' });
    expect(
      classifyTurn(
        [
          { id: 'ask' },
          {
            id: 'f',
            sessionFailure: { code: 'HOST_INCOMPATIBLE', detail: 'tools.execute is unavailable' },
          },
        ],
        'canary',
        new Set(['ask']),
      ).state,
    ).toBe('fail');
  });

  it('ignores Bot messages from before the request and waits for an outcome', () => {
    const greeting = { id: 'hello', author: { kind: 'bot', slug: 'canary' } };
    expect(classifyTurn([{ id: 'ask' }, greeting], 'canary', new Set(['ask', 'hello']))).toEqual({
      state: 'pending',
    });
  });

  it('collects each degraded Host capability once', () => {
    const line =
      'botharness.host_capability.degraded capability=tools.presentAs dsh=0.3.0 reason=missing';
    expect(
      degradedCapabilities([{ code: line }, { code: 'agent setup' }, { code: line }, {}]),
    ).toEqual([line]);
  });

  it('resolves a dist-tag and rejects a version below the floor', async () => {
    const tags = (body) => async () => ({ ok: true, json: async () => body });
    await expect(resolveDshTag('next', tags({ next: '0.2.3-rc.1' }))).resolves.toBe('0.2.3-rc.1');
    await expect(resolveDshTag('next', tags({ next: '0.1.9' }))).rejects.toThrow(/API floor/u);
    await expect(resolveDshTag('next', tags({}))).rejects.toThrow(/no "next" dist-tag/u);
  });

  it('parses its two actions', () => {
    expect(parseCanaryArgs(['run', '--dsh-version', '0.2.2-rc.1'])).toMatchObject({
      action: 'run',
      version: '0.2.2-rc.1',
    });
    expect(parseCanaryArgs(['resolve', '--tag', 'latest'])).toMatchObject({ tag: 'latest' });
    expect(() => parseCanaryArgs(['resolve', '--dsh-version', '1'])).toThrow(/unknown option/u);
    expect(() => parseCanaryArgs([])).toThrow(/Usage/u);
  });
});
