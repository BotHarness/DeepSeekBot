import { rmSync } from 'node:fs';

import { afterEach, expect, it, vi } from 'vitest';

import type { Agent } from '@deepseek-ai/dsh-agent';

import { execution, harness, screenshotDirs } from './support/browser-tools.js';

afterEach(() => {
  for (const dir of screenshotDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it('Profile control exposes only its curated tools and rejects foreign Sessions, Pause and Access-off', async () => {
  const command = vi.fn(async () => ({
    url: 'https://example.com',
    title: 'Example',
    text: 'Visible',
    elements: [],
  }));
  const h = harness({ access: true, profile: () => ({ command }) });
  h.created();
  expect(h.state.registered()).toEqual([
    'browser_click',
    'browser_observe',
    'browser_open',
    'browser_tabs',
    'browser_type',
  ]);
  const observe = h.state.definitions.get('browser_observe')!;
  await expect(observe.execute({}, execution('browser_observe'))).rejects.toThrow('not authorized');
  h.provider.markAuthorized('session-a');
  await expect(
    observe.execute(
      {},
      { ...execution('browser_observe'), agent: { id: 'foreign' } as unknown as Agent },
    ),
  ).rejects.toThrow('owning');
  await observe.execute({}, execution('browser_observe'));
  h.provider.setTakeover('bot-a', true);
  const type = h.state.definitions.get('browser_type')!;
  await expect(type.execute({ ref: 'x', text: 'y' }, execution('browser_type'))).rejects.toThrow(
    'Pause',
  );
  h.provider.setTakeover('bot-a', false);
  await expect(type.execute({ ref: 'x', text: 'y' }, execution('browser_type'))).rejects.toThrow(
    'fresh',
  );
  h.setAccess(false);
  await expect(observe.execute({}, execution('browser_observe'))).rejects.toThrow('Access');
  expect(command).toHaveBeenCalledOnce();
});

it('Profile reconnect preserves Pause while revoking Session authority and observations', async () => {
  const h = harness({ access: true, profile: () => ({ command: vi.fn() }) });
  h.created();
  h.provider.markAuthorized('session-a');
  h.provider.setTakeover('bot-a', true);
  h.provider.invalidateBot('bot-a');
  expect(h.provider.isTakeover('bot-a')).toBe(true);
  expect(h.provider.needsAuthorization('session-a')).toBe(true);
  h.provider.markAuthorized('session-a');
  const type = h.state.definitions.get('browser_type')!;
  await expect(
    type.execute({ ref: 'old', text: 'refused' }, execution('browser_type')),
  ).rejects.toThrow('Pause');
  h.provider.setTakeover('bot-a', false);
  await expect(
    type.execute({ ref: 'old', text: 'refused' }, execution('browser_type')),
  ).rejects.toThrow('fresh');
});

it('a Profile observation spanning Pause and Resume cannot authorize later mutation', async () => {
  let started!: () => void;
  let release!: () => void;
  const entered = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const observation = {
    url: 'https://example.com',
    title: 'Example',
    text: 'Visible',
    elements: [],
  };
  const command = vi.fn(async () => observation);
  command.mockImplementationOnce(async () => {
    started();
    await pending;
    return observation;
  });
  const h = harness({ access: true, auto: true, profile: () => ({ command }) });
  h.created();
  const call = (name: string, args = {}) =>
    h.state.definitions.get(name)!.execute(args, execution(name));
  const oldRead = call('browser_observe');
  const refused = expect(oldRead).rejects.toThrow('control changed');
  await entered;
  h.provider.setTakeover('bot-a', true);
  h.provider.setTakeover('bot-a', false);
  release();
  await refused;
  await expect(call('browser_type', { ref: 'old', text: 'refused' })).rejects.toThrow('fresh');
  expect(command).toHaveBeenCalledTimes(1);
  await call('browser_observe');
  await call('browser_type', { ref: 'fresh', text: 'allowed' });
  expect(command).toHaveBeenCalledTimes(3);
});
