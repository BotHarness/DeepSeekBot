import { Context, Fiber } from '@deepseek-ai/cordis';
import { expect, it, vi } from 'vitest';

import { BOT_AVATAR_PATH } from '../src/bots/avatar-http.js';
import { apply } from '../src/plugin.js';
import type { SkillRegistrar } from '../src/logs/skill.js';
import { createTempRoot } from './helpers.js';

it('preserves the startup order and Fiber ownership of feature wiring', async () => {
  const ctx = new Context();
  const startup: string[] = [];
  const cleanup: string[] = [];
  const register = (name: string) => {
    startup.push(name);
    return () => {
      cleanup.push(name);
    };
  };

  ctx.provide('tools', { guard: () => register('tools: guard') } as never);
  ctx.provide('systemPrompt', {
    section: ({ name }: { name: string }) => register('prompt: ' + name),
  } as never);
  ctx.provide('sessions', { list: () => [] } as never);
  ctx.provide('agents', { list: () => [] } as never);
  ctx.provide('skills', {
    register: ({ name }: Parameters<SkillRegistrar['register']>[0]) => register('skill: ' + name),
    async list() {
      return [];
    },
    async get() {
      return undefined;
    },
    registerProvider(create: (control: { invalidate(): void }) => { name: string }) {
      return register('skill provider: ' + create({ invalidate() {} }).name);
    },
  });
  ctx.provide('settings', {
    describe: () => [{ ns: 'botharness-client', value: { developerMode: true } }],
  } as never);
  ctx.provide('connection', {
    fetch: {
      register: ({ path }: { path: string }) => register('fetch: ' + path),
    },
  } as never);

  vi.stubEnv('DSH_HOME', createTempRoot('botharness-plugin-wiring-'));
  const effect = Fiber.prototype.effect;
  const recordEffect = vi.spyOn(Fiber.prototype, 'effect').mockImplementation(function (
    this: Fiber,
    execute,
    label,
  ) {
    if (label !== undefined) {
      const owner = this === ctx.fiber ? 'root' : Object.keys(this.inject).join(',');
      startup.push(owner + ' | ' + label);
    }
    return effect.call(this, execute, label);
  });
  try {
    apply(ctx, { enabled: true });
    await vi.waitFor(() => {
      expect(startup).toContain('skill: setting-up-local-voice');
      expect(startup).toContain('fetch: ' + BOT_AVATAR_PATH);
    });
  } finally {
    recordEffect.mockRestore();
    await ctx.fiber.dispose();
    vi.unstubAllEnvs();
  }

  expect(
    startup.filter((entry) =>
      /bot runtime|bot schedules|live skill catalog|skills\/change|agent\/created|agent\/disposed|^settings \||^skills \||^skill[: ]|Bot banner|PersonaBot avatar|Bot Zip|\/bot-(banner|avatar|zip)/u.test(
        entry,
      ),
    ),
  ).toMatchInlineSnapshot(`
    [
      "root | botharness: bot runtime",
      "root | botharness: bot schedules",
      "root | ctx.on("agent/disposed")",
      "root | botharness: live skill catalog",
      "root | ctx.on("skills/change")",
      "root | ctx.on("agent/created")",
      "root | ctx.on("agent/disposed")",
      "root | ctx.on("agent/created")",
      "root | ctx.on("agent/disposed")",
      "root | ctx.on("agent/created")",
      "root | ctx.on("agent/disposed")",
      "settings | ctx.on("settings/document-updated")",
      "settings | botharness: developer mode settings",
      "skills | botharness: skill catalog",
      "skill provider: botharness-memory-skill-changes",
      "skills | botharness: local voice skill",
      "skill: setting-up-local-voice",
      "skills | botharness: developer mode skill gate",
      "skills | botharness: operational logs skill",
      "skill: reading-operational-logs",
      "connection | botharness: Bot banner",
      "fetch: /api/botharness/bot-banner",
      "connection | botharness: PersonaBot avatar",
      "fetch: /api/botharness/bot-avatar",
      "connection | botharness: Bot Zip export",
      "fetch: /api/botharness/bot-zip",
      "connection | botharness: Bot Zip file list",
      "fetch: /api/botharness/bot-zip/files",
      "connection | botharness: Bot Zip import",
      "fetch: /api/botharness/bot-zip/import",
    ]
  `);
  expect(cleanup.filter((entry) => /^skill[: ]|\/bot-(banner|avatar|zip)/u.test(entry)))
    .toMatchInlineSnapshot(`
    [
      "skill: reading-operational-logs",
      "skill: reading-operational-logs",
      "skill: setting-up-local-voice",
      "skill provider: botharness-memory-skill-changes",
      "fetch: /api/botharness/bot-zip/import",
      "fetch: /api/botharness/bot-zip/files",
      "fetch: /api/botharness/bot-zip",
      "fetch: /api/botharness/bot-avatar",
      "fetch: /api/botharness/bot-banner",
    ]
  `);
});
