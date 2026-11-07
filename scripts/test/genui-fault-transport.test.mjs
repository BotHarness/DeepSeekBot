import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { installGenuiFaultTransport } from '../genui-fault-transport.mjs';

function setup(fault, envelope = { result: { ok: true } }) {
  const original = vi.fn().mockResolvedValue({
    ok: true,
    clone: () => ({ json: async () => envelope }),
  });
  const context = { fetch: original, addEventListener: vi.fn(), structuredClone };
  context.window = context;
  runInNewContext(`(${installGenuiFaultTransport.toString()})()`, context);
  context.__genuiFaultQa.fault = fault;
  return { context, original };
}
const send = (context, method) =>
  context.fetch('/api', {
    body: JSON.stringify({ method, payload: { args: { messageId: 'synthetic-message' } } }),
  });

describe('explicit GenUI browser transport fault fixtures', () => {
  it('refuses one save before any Host request, then permits the actual retry', async () => {
    const { context, original } = setup({
      method: 'botharness/channelGenuiViewSave',
      mode: 'before-request',
    });
    await expect(send(context, 'botharness/channelGenuiViewSave')).rejects.toThrow('refusal');
    expect(original).not.toHaveBeenCalled();
    await send(context, 'botharness/channelGenuiViewSave');
    expect(original).toHaveBeenCalledTimes(1);
  });
  it('loses a response only after a successful actual Host outcome', async () => {
    const fault = { method: 'botharness/channelSend', mode: 'after-commit' };
    const { context, original } = setup(fault);
    await expect(send(context, fault.method)).rejects.toThrow('after Host commit');
    expect(fault.committed).toBe(true);
    await send(context, fault.method);
    expect(original).toHaveBeenCalledTimes(2);
    expect(context.__genuiFaultQa.calls.map((call) => call.messageId)).toEqual([
      'synthetic-message',
      'synthetic-message',
    ]);
  });
  it('never manufactures a committed outcome from an unsuccessful Host result', async () => {
    const fault = { method: 'botharness/channelSend', mode: 'after-commit' };
    const { context } = setup(fault, { result: { ok: false, error: { code: 'archived-bot' } } });
    await expect(send(context, fault.method)).rejects.toThrow('did not commit');
    expect(fault.committed).toBe(false);
    expect(fault.refusalCode).toBe('archived-bot');
  });
  it('does not interfere with other endpoints or retain request bodies', async () => {
    const { context, original } = setup({
      method: 'botharness/channelSend',
      mode: 'before-request',
    });
    await send(context, 'botharness/channelMessages');
    expect(original).toHaveBeenCalledTimes(1);
    expect(context.__genuiFaultQa.calls).toEqual([]);
    await expect(send(context, 'botharness/channelSend')).rejects.toThrow('refusal');
    expect(Object.keys(context.__genuiFaultQa.calls[0]).sort()).toEqual(['messageId', 'method']);
  });
});
