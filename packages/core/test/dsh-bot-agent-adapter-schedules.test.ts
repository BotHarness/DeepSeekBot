import { type ToolRunContext } from '@deepseek-ai/dsh-tools';
import { describe, expect, it } from 'vitest';
import { createDshBotAgentAdapter } from '../src/runtime/dsh-bot-agent-adapter.js';
import { BotScheduleError } from '../src/schedules/bot-schedules.js';
import { FakeAgentHost, FAKE_BOT as BOT } from './dsh-agent-host-fixture.js';
import { ASSIGNMENT, groupTools } from './support/dsh-bot-agent-adapter.js';

describe('Bot Schedule Tools', () => {
  it('route schedule changes through the run and refuse native schedule tools', async () => {
    const clockBefore = Date.now();
    const calls: Array<Promise<unknown>> = [];
    const created: unknown[] = [];
    const updated: unknown[] = [];
    let denial: string | undefined;
    let allowed: string | undefined;
    const schedule = {
      id: 'sch-1',
      botSlug: 'ada',
      title: 'Check X',
      prompt: 'Check X',
      trigger: { kind: 'every' as const, everySeconds: 3600 },
      enabled: true,
      creator: 'personabot' as const,
      locked: false,
      createdAt: BOT.createdAt,
      updatedAt: BOT.createdAt,
    };
    const host = new FakeAgentHost(
      { kind: 'completed' },
      {
        onAgentCreated: () => {
          const scope = host.scopes.get('orchestrator-ada');
          const tool = (name: string) => {
            const found = scope?.tools.find((candidate) => candidate.name === name);
            if (found === undefined) throw new Error(`${name} not registered`);
            return found;
          };
          denial = scope?.guards.map((guard) => guard({ name: 'schedule_create' })).find(Boolean);
          allowed = scope?.guards.map((guard) => guard({ name: 'bot_send_message' })).find(Boolean);
          calls.push(tool('bot_schedule_list').execute({}, {} as ToolRunContext));
          calls.push(
            tool('bot_schedule_create').execute(
              { title: 'Check X', prompt: 'Check X', every_minutes: 60 },
              {} as ToolRunContext,
            ),
          );
          calls.push(
            tool('bot_schedule_create').execute(
              {
                title: 'Morning',
                prompt: 'Summarise',
                daily_time: '09:00',
                time_zone: 'Asia/Shanghai',
              },
              {} as ToolRunContext,
            ),
          );
          calls.push(
            tool('bot_schedule_create').execute(
              { title: 'Both', prompt: 'x', every_minutes: 5, daily_time: '09:00' },
              {} as ToolRunContext,
            ),
          );
          for (const cadence of [
            { daily_time: '09:00', weekdays: [1, 3], time_zone: 'Asia/Shanghai' },
            { once_at: '2026-11-01 09:00', time_zone: 'America/New_York' },
            { cron: '0 9 * * 1-5', time_zone: 'Asia/Shanghai' },
            { weekdays: [1] },
            { once_at: 'tomorrow' },
            { once_in_minutes: 10, time_zone: 'Asia/Tokyo' },
            { once_in_minutes: 10 },
            { once_in_minutes: 10, once_at: '2026-11-01 09:00', time_zone: 'Asia/Tokyo' },
          ])
            calls.push(
              tool('bot_schedule_create').execute(
                { title: 'Cadence', prompt: 'x', ...cadence },
                {} as ToolRunContext,
              ),
            );
          calls.push(
            tool('bot_schedule_update').execute(
              { id: 'sch-1', enabled: false },
              {} as ToolRunContext,
            ),
          );
          calls.push(
            tool('bot_schedule_update').execute(
              { id: 'locked-1', title: 'Renamed' },
              {} as ToolRunContext,
            ),
          );
          calls.push(tool('bot_schedule_delete').execute({ id: 'sch-1' }, {} as ToolRunContext));
        },
      },
    );
    const adapter = createDshBotAgentAdapter({
      agents: host,
      defaultModel: { currentSelection: () => ({ provider: 'test', model: 'test' }) },
      orchestratorCwd: () => '/memory/ada',
      ensureWorkspace: () => undefined,
    });
    await adapter.runOrchestrator({
      sessionId: 'orchestrator-ada',
      resume: false,
      bot: BOT,
      message: 'Remind yourself every hour to check X',
      inboundChannelId: 'dm-test',
      inbox: '',
      schedules: {
        list: () => [schedule],
        create: (input) => {
          created.push(input);
          return { ...schedule, ...input };
        },
        update: (id, change) => {
          if (id === 'locked-1')
            throw new BotScheduleError('locked', 'Bot Schedule locked-1 is locked by the Human');
          updated.push(change);
          return { ...schedule, ...change };
        },
        remove: (id) => id === 'sch-1',
      },
      channels: {
        ...groupTools,
        contacts: async () => ({ outputLimit: 12_000, contacts: [] }),
        sendToBot: async () => {
          throw new Error('unexpected Bot DM');
        },
        ignore: () => ({
          sourceEventId: 'source-1',
          ignoredAt: BOT.createdAt,
          alreadyIgnored: false,
        }),
        read: () => [],
        requestGrant: async () => {
          throw new Error('unexpected Grant request');
        },
        send: async (input) => ({
          id: 'bot-1',
          at: BOT.createdAt,
          author: { kind: 'bot', slug: BOT.slug },
          body: input.body,
        }),
      },
      assignments: {
        create: () => ({ outcome: 'created', assignment: ASSIGNMENT }),
        grants: () => [],
        list: () => [],
        inspect: () => undefined,
        stop: async () => ASSIGNMENT,
        request: () => {
          throw new Error('unexpected Assignment request');
        },
      },
    });
    try {
      const results = (await Promise.all(calls)).map((value) => JSON.parse(String(value)));
      expect(Date.parse(results[0].currentTime)).toBeGreaterThanOrEqual(clockBefore);
      expect(Date.parse(results[0].currentTime)).toBeLessThanOrEqual(Date.now());
      expect(results).toMatchObject([
        { schedules: [{ id: 'sch-1' }], enabledLimit: 20 },
        { trigger: { kind: 'every', everySeconds: 3600 } },
        { trigger: { kind: 'daily', time: '09:00', timeZone: 'Asia/Shanghai' } },
        { error: { code: 'invalid-input' } },
        {
          trigger: { kind: 'weekly', time: '09:00', timeZone: 'Asia/Shanghai', weekdays: [1, 3] },
        },
        {
          trigger: {
            kind: 'once',
            date: '2026-11-01',
            time: '09:00',
            timeZone: 'America/New_York',
          },
        },
        { trigger: { kind: 'cron', expression: '0 9 * * 1-5', timeZone: 'Asia/Shanghai' } },
        { error: { code: 'invalid-input', message: 'weekdays needs daily_time' } },
        { error: { code: 'invalid-input' } },
        { trigger: { kind: 'once', timeZone: 'Asia/Tokyo' } },
        { error: { code: 'invalid-input', message: 'once_in_minutes needs time_zone' } },
        { error: { code: 'invalid-input' } },
        { enabled: false },
        { error: { code: 'locked', message: 'Bot Schedule locked-1 is locked by the Human' } },
        { id: 'sch-1', deleted: true },
      ]);
      expect(created).toHaveLength(6);
      expect(updated).toEqual([{ enabled: false }]);
      expect(denial).toContain('bot_schedule_create');
      expect(allowed).toBeUndefined();
    } finally {
      await adapter.close();
    }
  });
});
