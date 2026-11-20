import { describe, expect, it } from 'vitest';
import { BotharnessBridgeService } from '../src/bridge/rpc.js';

describe('Bridge remote method descriptor', () => {
  it('backs every direct remote method with a prototype method', () => {
    const descriptor = (BotharnessBridgeService.prototype as unknown as Record<string, unknown>)[
      '@deepseek-ai/dsh-typert-protocol/remote-methods'
    ] as { methods: { method: string; mode?: string }[] };
    const missing = descriptor.methods
      .filter((entry) => entry.mode !== 'stream')
      .map((entry) => entry.method)
      .filter(
        (method) =>
          typeof (BotharnessBridgeService.prototype as unknown as Record<string, unknown>)[
            method
          ] !== 'function',
      );
    expect(missing).toEqual([]);
  });
});
