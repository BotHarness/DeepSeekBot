import { describe, expect, it, vi } from 'vitest';
import type { SubagentActivation, SubagentActivationSpec } from '@deepseek-ai/dsh-subagent';
import { isAuthenticatedOwner } from '../src/bridge/owner-compat.js';
import { startCallerActivation, startParentActivation } from '../src/runtime/subagent-compat.js';

function fixture() {
  const controller = new AbortController();
  const spec = {
    provider: 'spawn',
    label: 'Compatibility task',
    request: { parent: {}, prompt: [{ type: 'text', text: 'A bounded task' }] },
    signal: controller.signal,
  } as Omit<SubagentActivationSpec, 'delivery'>;
  let resolve!: (value: Awaited<SubagentActivation['result']>) => void;
  const result = new Promise<Awaited<SubagentActivation['result']>>((done) => {
    resolve = done;
  });
  const activation = {
    childId: 'child',
    result,
    dispose: vi.fn(async () => undefined),
  } as unknown as SubagentActivation;
  return { controller, spec, activation, resolve };
}

describe('DSH Subagent version adapter', () => {
  it('uses legacy start and retains native lifetime cancellation ownership', async () => {
    const f = fixture();
    const legacy = {
      id: f.activation.childId,
      result: f.activation.result,
      dispose: f.activation.dispose,
    };
    const start = vi.fn(async () => legacy);
    const run = await startCallerActivation({ start }, f.spec);
    expect(start).toHaveBeenCalledWith('spawn', {
      ...f.spec.request,
      label: f.spec.label,
      signal: f.controller.signal,
    });
    expect(run.childId).toBe(legacy.id);
    expect(run.result).toBe(legacy.result);
    await run.dispose();
    expect(legacy.dispose).toHaveBeenCalledOnce();
  });

  it('disposes a modern caller activation exactly once after cancellation', async () => {
    const f = fixture();
    const startActivation = vi.fn(async () => f.activation);
    const run = await startCallerActivation({ startActivation }, f.spec);
    expect(startActivation).toHaveBeenCalledWith({ ...f.spec, delivery: 'caller' });
    f.controller.abort();
    await run.dispose();
    expect(f.activation.dispose).toHaveBeenCalledOnce();
    f.resolve({ stopReason: 'aborted', output: [] });
    expect((await run.result).stopReason).toBe('aborted');
  });

  it('handles cancellation during publication and removes listeners after completion', async () => {
    const f = fixture();
    const run = await startCallerActivation(
      {
        startActivation: async () => {
          f.controller.abort();
          return f.activation;
        },
      },
      f.spec,
    );
    expect(f.activation.dispose).toHaveBeenCalledOnce();
    f.resolve({ stopReason: 'completed', output: [] });
    await run.result;
    await run.dispose();
    const done = fixture();
    const completed = await startCallerActivation(
      { startActivation: async () => done.activation },
      done.spec,
    );
    done.resolve({ stopReason: 'completed', output: [] });
    await completed.result;
    done.controller.abort();
    expect(done.activation.dispose).not.toHaveBeenCalled();
  });

  it('keeps parent-delivered continuable work owned by the native manager on both APIs', async () => {
    const old = fixture();
    const startContinuable = vi.fn(async () => ({ childId: old.activation.childId }));
    expect(await startParentActivation({ startContinuable }, old.spec, vi.fn())).toEqual({
      childId: old.activation.childId,
    });
    expect(startContinuable).toHaveBeenCalledWith(old.spec);
    const modern = fixture();
    const startActivation = vi.fn(async () => modern.activation);
    const failure = vi.fn();
    await startParentActivation({ startActivation }, modern.spec, failure);
    expect(startActivation).toHaveBeenCalledWith({ ...modern.spec, delivery: 'parent' });
    modern.controller.abort();
    expect(modern.activation.dispose).not.toHaveBeenCalled();
    modern.resolve({ stopReason: 'completed', output: [] });
    await modern.activation.result;
    expect(failure).not.toHaveBeenCalled();
  });

  it('does not retry modern failures through the legacy API or invent missing capabilities', async () => {
    const f = fixture();
    const start = vi.fn();
    const startContinuable = vi.fn();
    const startActivation = vi.fn(async () => {
      throw new Error('Permission denied');
    });
    await expect(startCallerActivation({ startActivation, start }, f.spec)).rejects.toThrow(
      'Permission denied',
    );
    await expect(
      startParentActivation({ startActivation, startContinuable }, f.spec, vi.fn()),
    ).rejects.toThrow('Permission denied');
    expect(start).not.toHaveBeenCalled();
    expect(startContinuable).not.toHaveBeenCalled();
    await expect(startCallerActivation({}, f.spec)).rejects.toThrow('capability is unavailable');
    await expect(startParentActivation({}, f.spec, vi.fn())).rejects.toThrow(
      'capability is unavailable',
    );
  });
});

describe('DSH authenticated Owner version adapter', () => {
  it('requires the exact legacy operator identity and refuses absent invocations', () => {
    const operator = {};
    expect(isAuthenticatedOwner(operator, { operator })).toBe(true);
    expect(isAuthenticatedOwner({}, { operator })).toBe(false);
    expect(isAuthenticatedOwner(undefined, { operator: undefined })).toBe(false);
    expect(isAuthenticatedOwner(null, { operator: null })).toBe(false);
    expect(isAuthenticatedOwner(operator, {})).toBe(false);
  });
  it('uses native principal authority without falling back on a malformed or guest principal', () => {
    expect(isAuthenticatedOwner({ principal: { kind: 'owner' } }, {})).toBe(true);
    for (const principal of [undefined, null, {}, { kind: 'guest' }, { kind: 'bot' }]) {
      const peer = { principal };
      expect(isAuthenticatedOwner(peer, { operator: peer })).toBe(false);
    }
  });
});
