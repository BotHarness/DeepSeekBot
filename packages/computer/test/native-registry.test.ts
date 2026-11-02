import { Context } from '@deepseek-ai/cordis';
import { ComputerUseProviderName } from '@deepseek-ai/dsh-computer-use/brand';
import { describe, expect, it } from 'vitest';
import ComputerUseRegistry from '../src/native-registry.js';

describe('bundled native ComputerUseRegistry lifecycle', () => {
  it('keeps one exclusive provider slot and releases it with its owning contribution', async () => {
    const ctx = new Context();
    const registry = ctx.plugin(ComputerUseRegistry);
    await registry.await();
    const service = ctx.get('computerUse');
    expect(service).toBeDefined();
    const release = service!.register(ComputerUseProviderName('botharness-computer'));
    expect(service!.providerName).toBe('botharness-computer');
    expect(() => service!.register(ComputerUseProviderName('other'))).toThrow('already registered');
    await release();
    expect(service!.providerName).toBeUndefined();
    await registry.dispose();
    expect(ctx.get('computerUse')).toBeUndefined();
  });
});
