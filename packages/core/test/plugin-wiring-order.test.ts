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
  expect(
    startup.filter((entry) =>
      /device pairing logs|external messaging|cloud (work|connections)|IM (tool controls|question answers)|voice calls|Bot calls \(Host owner|Activity Tool detail references|session\/event|\/api\/voice\/call/u.test(
        entry,
      ),
    ),
  ).toMatchInlineSnapshot(`
    [
      "root | botharness: device pairing logs",
      "root | botharness: external messaging",
      "root | botharness: cloud work",
      "root | botharness: cloud work tool name",
      "root | botharness: cloud work tool",
      "root | botharness: cloud connections",
      "root | botharness: approved IM tool controls",
      "root | botharness: checked IM question answers",
      "root | ctx.on("session/event")",
      "root | botharness: voice calls",
      "root | botharness: Activity Tool detail references",
      "root | ctx.on("session/event")",
      "connection | botharness: Bot calls (Host owner and CLI)",
      "fetch: /api/voice/call",
    ]
  `);
  expect(cleanup.filter((entry) => entry === 'fetch: /api/voice/call')).toEqual([
    'fetch: /api/voice/call',
  ]);
  expect(
    startup.filter((entry) =>
      /diagnostic|telemetry|Member confinement|Memory tool|approval|question|release|roster|Tob|profile|tools\/(pre-execute|execute)|^tools: guard|session\/event/u.test(
        entry,
      ),
    ),
  ).toMatchInlineSnapshot(`
    [
      "root | botharness: always-on diagnostic log",
      "root | botharness: telemetry",
      "root | botharness: roster",
      "root | ctx.on("tools/execute")",
      "tools: guard",
      "root | botharness: engine Memory tools",
      "root | botharness: engine Memory tool names",
      "root | botharness: approval review logs",
      "root | botharness: companion approval observation",
      "root | botharness: Channel user questions",
      "root | botharness: companion question observation",
      "root | ctx.on("user-questions/request")",
      "root | botharness: approval projection status",
      "root | botharness: checked IM question answers",
      "root | botharness: one-call approval execution fences",
      "root | botharness: device approval execution leases",
      "root | botharness: Channel tool approvals",
      "root | ctx.on("approval/request")",
      "root | ctx.on("tools/pre-execute")",
      "root | ctx.on("tools/execute")",
      "tools: guard",
      "root | ctx.on("tools/execute")",
      "root | ctx.on("session/event")",
      "root | ctx.on("session/event")",
      "connection | botharness: diagnostic log /api/botharness/client-log",
      "connection | botharness: diagnostic log /api/botharness/diagnostic-logs",
      "fetch: /api/botharness/diagnostic-logs",
      "connection | botharness: diagnostic log /api/botharness/diagnostic-logs/export",
      "fetch: /api/botharness/diagnostic-logs/export",
      "fetch: /api/botharness/profile-backup",
      "fetch: /api/botharness/profile-backup/inspect",
      "fetch: /api/botharness/profile-backup/recovery",
      "fetch: /api/botharness/profile-backup/authorize",
      "fetch: /api/botharness/profile-backup/activate",
      "connection | botharness: diagnostic bundle /api/botharness/diagnostic-bundle",
      "fetch: /api/botharness/diagnostic-bundle",
      "connection | botharness: diagnostic bundle /api/botharness/diagnostic-bundle/preview",
      "fetch: /api/botharness/diagnostic-bundle/preview",
    ]
  `);
  expect(cleanup).toMatchInlineSnapshot(`
    [
      "skill: reading-operational-logs",
      "skill: reading-operational-logs",
      "skill: setting-up-local-voice",
      "skill provider: botharness-memory-skill-changes",
      "fetch: /api/botharness/bug-report",
      "fetch: /api/botharness/diagnostic-logs/export",
      "fetch: /api/botharness/diagnostic-logs",
      "fetch: /api/botharness/client-log",
      "fetch: /api/botharness/bot-zip/import",
      "fetch: /api/botharness/bot-zip/files",
      "fetch: /api/botharness/bot-zip",
      "fetch: /api/botharness/diagnostic-bundle/preview",
      "fetch: /api/botharness/diagnostic-bundle",
      "fetch: /api/botharness/message-feedback/submit",
      "fetch: /api/botharness/message-feedback/download",
      "fetch: /api/botharness/message-feedback/preview",
      "fetch: /api/botharness/profile-backup/activate",
      "fetch: /api/botharness/profile-backup/authorize",
      "fetch: /api/botharness/profile-backup/recovery",
      "fetch: /api/botharness/profile-backup/inspect",
      "fetch: /api/botharness/profile-backup",
      "fetch: /api/botharness/bot-avatar",
      "fetch: /api/botharness/bot-banner",
      "fetch: /api/botharness/attachment",
      "fetch: /api/botharness/attachment/upload",
      "fetch: /api/botharness/memory/image",
      "fetch: /api/botharness/memory/file",
      "fetch: /api/botharness/companion",
      "fetch: /api/botharness/stream",
      "fetch: /api/voice/call",
      "fetch: /api/botharness/desktop-window",
      "fetch: /api/botharness/appearance-control",
      "fetch: /api/botharness/window-zoom-setup",
      "fetch: /api/botharness/window-zoom-control",
      "fetch: /api/botharness/presence",
      "fetch: /api/botharness/engines",
    ]
  `);
});
