import type { Context } from '@deepseek-ai/cordis';
import { installModelSelection, type Agent, type ModelSelection } from '@deepseek-ai/dsh-agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  installNativeModelSelection,
  selectNativeModel,
} from '../src/runtime/native-agent-compat.js';

vi.mock('@deepseek-ai/dsh-agent', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@deepseek-ai/dsh-agent')>()),
  installModelSelection: vi.fn(),
}));

const route: ModelSelection = { provider: 'deepseek-official', model: 'deepseek-flash' };

describe('native model API generations', () => {
  beforeEach(() => {
    vi.mocked(installModelSelection).mockReset();
  });

  it('passes the mutable selection to the legacy installer', () => {
    const ctx = {} as Context;
    const agent = {} as Agent;
    const selection = { current: route, assembled: undefined };
    const dispose = vi.fn();
    vi.mocked(installModelSelection).mockReturnValue(dispose);
    expect(installNativeModelSelection(ctx, agent, selection)).toBe(dispose);
    expect(installModelSelection).toHaveBeenCalledExactlyOnceWith(ctx, selection);
  });

  it('selects the modern Agent model before installing its step integration', () => {
    const ctx = {} as Context;
    const select = vi.fn();
    const agent = { model: { select } } as unknown as Agent;
    const dispose = vi.fn();
    vi.mocked(installModelSelection).mockReturnValue(dispose);
    expect(installNativeModelSelection(ctx, agent, { current: route, assembled: undefined })).toBe(
      dispose,
    );
    expect(select).toHaveBeenCalledExactlyOnceWith(route);
    expect(installModelSelection).toHaveBeenCalledExactlyOnceWith(ctx);
    expect(select.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(installModelSelection).mock.invocationCallOrder[0]!,
    );
  });

  it('does not clear the modern Agent model when no selection is supplied', () => {
    const ctx = {} as Context;
    const select = vi.fn();
    const agent = { model: { select } } as unknown as Agent;
    installNativeModelSelection(ctx, agent, { current: undefined, assembled: undefined });
    selectNativeModel(agent, undefined);
    expect(select).not.toHaveBeenCalled();
    expect(installModelSelection).toHaveBeenCalledExactlyOnceWith(ctx);
  });

  it('updates a modern Agent without requiring the new API on a legacy Agent', () => {
    const select = vi.fn();
    const agent = { model: { select } } as unknown as Agent;
    selectNativeModel(agent, route);
    selectNativeModel({} as Agent, route);
    selectNativeModel(undefined, route);
    expect(select).toHaveBeenCalledExactlyOnceWith(route);
  });

  it('propagates a modern selection refusal without trying the legacy installer', () => {
    const refusal = new Error('model selection refused');
    const select = vi.fn(() => {
      throw refusal;
    });
    const agent = { model: { select } } as unknown as Agent;
    expect(() =>
      installNativeModelSelection({} as Context, agent, { current: route, assembled: undefined }),
    ).toThrow(refusal);
    expect(select).toHaveBeenCalledOnce();
    expect(installModelSelection).not.toHaveBeenCalled();
  });
});
