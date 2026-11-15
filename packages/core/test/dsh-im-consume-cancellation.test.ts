import { expect, it, vi } from 'vitest';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { fanoutMessagingConsumer } from '../src/messaging/consumer-fanout.js';

it('releases an aborted metadata lookup so a replacement consumer can start before it settles', async () => {
  const info: Awaited<ReturnType<DshImOutboundService['describeBot']>> = {
    version: 1,
    botId: 'app',
    channel: 'qq',
    connected: true,
    account: { fingerprint: 'a'.repeat(64) },
    capabilities: ['exclusive-text-consumer', 'reply-text-checked'],
  };
  let finish: (value: typeof info) => void = () => {};
  const oldMetadata = new Promise<typeof info>((resolve) => {
    finish = resolve;
  });
  let lookups = 0;
  const dispose = vi.fn();
  const consumeInbound = vi.fn(async () => dispose);
  const service: DshImOutboundService = {
    contractVersion: 1,
    listBots: async () => [],
    listTargets: async () => [],
    sendChecked: async () => ({ sent: true }),
    describeBot: async () => (++lookups === 1 ? oldMetadata : info),
    consumeInbound,
    replyChecked: async () => ({ sent: true }),
  };
  const provider = createDshImProvider(service, 'qq');
  if (!provider?.consume) throw Error('Missing checked consumer');
  const acquire = fanoutMessagingConsumer(provider.consume.bind(provider));
  const old = new AbortController(),
    next = new AbortController();
  const onEvent = async () => ({ accepted: true as const });
  const first = acquire({
    accountRef: 'app',
    fingerprint: info.account.fingerprint,
    signal: old.signal,
    onEvent,
  });
  const rejected = expect(first).rejects.toThrow();
  await Promise.resolve();
  old.abort();
  await rejected;
  const off = await acquire({
    accountRef: 'app',
    fingerprint: info.account.fingerprint,
    signal: next.signal,
    onEvent,
  });
  expect(consumeInbound).toHaveBeenCalledTimes(1);
  finish(info);
  await Promise.resolve();
  expect(consumeInbound).toHaveBeenCalledTimes(1);
  off();
  expect(dispose).toHaveBeenCalledTimes(1);
});
