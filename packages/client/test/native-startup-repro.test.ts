// @vitest-environment jsdom
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
const req = createRequire(resolve('packages/client/package.json'));
const cache = new Map<string, Record<string, any>>();
async function native(id: string, from = req): Promise<Record<string, any>> {
  if (id === '@deepseek-ai/dsh-client-ui-primitives') return {};
  const cached = cache.get(id);
  if (cached) return cached;
  if (!id.startsWith('@deepseek-ai/dsh-client-')) {
    const resolver = /^react(?:-dom)?(?:\/|$)/.test(id) ? req : from;
    const value = await import(resolver.resolve(id));
    cache.set(id, value);
    return value;
  }
  const manifest = from.resolve(`${id}/package.json`);
  const client = join(dirname(manifest), 'lib', 'client.js');
  if (!id.startsWith('@deepseek-ai/dsh-client-') || !existsSync(client)) {
    const value = await import(from.resolve(id));
    cache.set(id, value);
    return value;
  }
  const code = readFileSync(client, 'utf8');
  const dependencies = [
    ...new Set([...code.matchAll(/require\("([^"]+)"\)/g)].map((match) => match[1]!)),
  ];
  for (const dependency of dependencies) await native(dependency, createRequire(manifest));
  let factory: ((require: (key: string) => unknown) => Record<string, any>) | undefined;
  vm.runInNewContext(code, {
    window: {
      __ModuleLoader__: {
        load: (entry: { factory: typeof factory }) => {
          factory = entry.factory;
        },
      },
    },
    console,
    queueMicrotask,
    setTimeout,
    clearTimeout,
    TextEncoder,
    TextDecoder,
    URL,
    AbortController,
  });
  if (!factory) throw new Error('official Client artifact did not register');
  const value = factory((key) => cache.get(key));
  cache.set(id, value);
  return value;
}

describe('pinned official RC1 startup-failure attribution', () => {
  it('reproduces the exact root guard with the real renderer and no root Registration', async () => {
    const { Context } = await native('@deepseek-ai/cordis');
    const renderer = await native('@deepseek-ai/dsh-client-ui-renderer');
    const { createRoot } = await native('react-dom/client');
    const { flushSync } = await native('react-dom');
    const ctx = new Context();
    await ctx.plugin(renderer);
    const absent = { key: undefined, hooks: {}, keyedHooks: {}, props: {} };
    const source = { getSnapshot: () => absent, subscribe: () => () => {} };
    ctx.slots.installScope('session', { current: source, bindingSource: () => source });
    const remove = ctx.slots.register({ name: 'root' }, () => null);
    const tree = ctx.slots.renderSlot('root', {});
    await remove();
    const root = createRoot(document.createElement('div'));
    const prevent = (event: ErrorEvent) => event.preventDefault();
    window.addEventListener('error', prevent);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => flushSync(() => root.render(tree))).toThrow(
      "renderSlot('root') before any 'root' registration (boot order)",
    );
    root.unmount();
    errorLog.mockRestore();
    window.removeEventListener('error', prevent);
    await ctx.fiber.dispose();
  });

  it('reproduces unknown-session from the real Conversation binding guard', async () => {
    const { Context } = await native('@deepseek-ai/cordis');
    const { UiConversation } = await native('@deepseek-ai/dsh-client-ui-conversation');
    const ctx = new Context();
    const sessions = { binding: () => undefined };
    const conversation = new UiConversation(ctx, sessions);
    expect(() => conversation.binding('absent-qa-session')).toThrow(
      'uiConversation.binding: unknown session "absent-qa-session"',
    );
    await ctx.fiber.dispose();
  });
});
