import { setImmediate as tick } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { createCore } from '../src/plugin.js';
import { attachOperationalModule } from '../src/database/owner.js';
import { createDshImProvider, type DshImOutboundService } from '../src/messaging/dsh-im.js';
import { createOutboundMessaging } from '../src/messaging/outbound.js';
import type { MessagingInboundEvent } from '../src/messaging/provider.js';
import type { OrchestratorAgentRun } from '../src/runtime/bot-runtime.js';
import { createTempRoot } from './helpers.js';

const fingerprint = 'd'.repeat(64);
const answer = { action: 'reply' as const, text: 'Synthetic result', complete: true };
async function fixture(
  action: (run: OrchestratorAgentRun) => Promise<void>,
  uncertain = false,
  triageContinuation = false,
) {
  const home = createTempRoot('botharness-final-external-');
  let enabled = false;
  let effects = 0;
  let consumer: Parameters<NonNullable<DshImOutboundService['consumeInbound']>>[1];
  const warnings: string[] = [];
  const core = createCore({
    dshHome: home,
    triageContinuation,
    warn: (message) => warnings.push(message),
    agents: {
      async runOrchestrator(run) {
        if (enabled) await action(run);
      },
      steerOrchestrator() {
        return true;
      },
      requestAssignment() {
        throw new Error('Assignments are outside this final-reply fixture');
      },
      async runAssignment() {},
      async close() {},
    },
  });
  core.registry.create({ slug: 'ada', displayName: 'Ada' });
  const transport: DshImOutboundService = {
    contractVersion: 1,
    replyContextVersion: 1,
    replyReceiptVersion: 1,
    replyFenceVersion: 1,
    listBots: async () => [{ botId: 'synthetic-final', channel: 'feishu' }],
    listTargets: async () => [],
    describeBot: async (botId) => ({
      version: 1,
      botId,
      channel: 'feishu',
      connected: true,
      account: { fingerprint, name: 'Synthetic final' },
      capabilities: [
        'proactive-text-checked',
        'exclusive-text-consumer',
        'reply-text-checked',
        'reply-context-checked',
        'reply-receipt-checked',
        'reply-fence-checked',
      ],
    }),
    consumeInbound: async (_id, input) => {
      consumer = input;
      return () => {};
    },
    qualifyReplyChecked: async (_id, route) => route,
    sendChecked: async () => {
      throw new Error('No proactive route is authorized');
    },
    replyChecked: async (_id, route, _text, input) => {
      expect(input.beforeSend?.()).toBe(true);
      effects++;
      if (uncertain) throw new Error('Synthetic transport ambiguity after effect');
      return {
        sent: true,
        receipt: {
          version: 1,
          messageId: 'synthetic-result',
          conversationId: route.conversationId,
        },
      };
    },
  };
  core.externalMessaging.register(createDshImProvider(transport)!);
  await core.externalMessaging.identity('ada', {
    kind: 'bind',
    providerId: 'dsh-im/feishu',
    accountRef: 'synthetic-final',
    fingerprint,
  });
  const idle = async () => {
    for (let i = 0; i < 4; i++) await tick();
    await core.runtime.whenIdle();
  };
  await idle();
  enabled = true;
  return {
    core,
    transport,
    warnings,
    effects: () => effects,
    async receive(waitForIdle = true, eventId = 'synthetic-input') {
      const event: MessagingInboundEvent = {
        version: 1,
        channel: 'feishu',
        botId: 'synthetic-final',
        fingerprint,
        eventId,
        messageId: eventId,
        actor: { kind: 'user', id: 'ou_synthetic' },
        conversation: { kind: 'dm', id: 'oc_synthetic' },
        mentions: [],
        mentionedAccount: false,
        at: new Date().toISOString(),
        text: 'Synthetic task',
        reply: {
          messageId: eventId,
          conversationId: 'oc_synthetic',
          actorId: 'ou_synthetic',
        },
        replay: { kind: 'provider-redelivery', resumeCursor: false, gapPossible: true },
      };
      await consumer!.onEvent(event, { signal: consumer!.signal });
      if (waitForIdle) await idle();
      else for (let i = 0; i < 4; i++) await tick();
    },
    rows() {
      return attachOperationalModule(core.operationalDatabase, 'final-external-test').read((db) =>
        db
          .prepare(
            "SELECT a.resolved_at, a.resolution, a.final_reply_json FROM inbox_admissions a JOIN source_events e ON e.source_event_id=a.source_event_id WHERE a.bot_slug='ada' AND e.source_kind='bridge-message'",
          )
          .all(),
      );
    },
    async close() {
      core.schedules.close();
      core.externalMessaging.close();
      await core.runtime.close();
      core.operationalDatabase.close();
    },
  };
}

it('real Host final reaches the checked Outbox once after a read; duplicate final cannot erase acceptance', async () => {
  const fx = await fixture(async (run) => {
    run.assignments.list();
    await run.replyFinal?.(answer);
    run.assignments.list();
    await run.replyFinal?.(answer);
  });
  try {
    await fx.receive();
    expect(fx.effects()).toBe(1);
    expect(fx.core.externalMessaging.history('ada')).toEqual([
      expect.objectContaining({ state: 'provider-accepted' }),
    ]);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolution: 'done',
        resolved_at: expect.any(String),
        final_reply_json: expect.stringContaining('"status":"accepted"'),
      }),
    ]);
  } finally {
    await fx.close();
  }
});

it('an ambiguous provider effect stays unaccepted and open; repeating the final does not send again', async () => {
  const fx = await fixture(async (run) => {
    await run.replyFinal?.(answer);
    await expect(
      run.channels.send({ channelId: 'not-authorized', body: 'Synthetic progress' }),
    ).rejects.toThrow();
    await run.replyFinal?.(answer);
  }, true);
  try {
    await fx.receive();
    expect(fx.effects()).toBe(1);
    expect(fx.core.externalMessaging.history('ada')).toEqual([
      expect.objectContaining({ state: 'unknown-outcome' }),
    ]);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('"status":"not-accepted"'),
      }),
    ]);
    const delivery = JSON.parse(String(fx.rows()[0]!.final_reply_json));
    expect(delivery.reason).toBe('unknown-outcome');
    expect(delivery.receipt).toBe(fx.core.externalMessaging.history('ada')[0]!.id);
  } finally {
    await fx.close();
  }
});

it('production triage continuation preserves the unknown Outbox evidence without a fallback send', async () => {
  let turns = 0;
  const fx = await fixture(
    async (run) => {
      turns++;
      await run.replyFinal?.(answer);
    },
    true,
    true,
  );
  try {
    await fx.receive();
    expect(turns).toBeGreaterThanOrEqual(2);
    expect(fx.effects()).toBe(1);
    const history = fx.core.externalMessaging.history('ada');
    expect(history).toEqual([expect.objectContaining({ state: 'unknown-outcome' })]);
    expect(fx.rows()[0]!.resolved_at).toBeNull();
    expect(JSON.parse(String(fx.rows()[0]!.final_reply_json))).toEqual(
      expect.objectContaining({
        status: 'not-accepted',
        reason: 'unknown-outcome',
        receipt: history[0]!.id,
      }),
    );
  } finally {
    await fx.close();
  }
});

it('an over-budget external final creates no intent and leaves a visible refusal', async () => {
  const fx = await fixture(async (run) => {
    await run.replyFinal?.({ ...answer, text: 'x'.repeat(4001) });
  });
  try {
    await fx.receive();
    expect(fx.effects()).toBe(0);
    expect(fx.core.externalMessaging.history('ada')).toEqual([]);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('external-final-text-too-long'),
      }),
    ]);
  } finally {
    await fx.close();
  }
});

it('an explicit progress consumes the sole source intent; absent proactive target is not a license to send the final elsewhere', async () => {
  const fx = await fixture(async (run) => {
    const source = run.triage!.current()[0]!;
    expect(await run.externalMessaging!.targets!()).toEqual([]);
    await run.externalMessaging!.reply(source, 'Synthetic progress');
    await expect(
      run.externalMessaging!.reply(source, 'Different synthetic result'),
    ).rejects.toThrow('request-conflict');
    await run.replyFinal?.(answer);
  });
  try {
    await fx.receive();
    expect(fx.effects()).toBe(1);
    expect(fx.core.externalMessaging.history('ada')).toEqual([
      expect.objectContaining({ text: 'Synthetic progress', state: 'provider-accepted' }),
    ]);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('explicit-send-attempt'),
      }),
    ]);
  } finally {
    await fx.close();
  }
});

it('an acknowledgement is durable and source-bound while preserving one explicit final intent', async () => {
  const fx = await fixture(async (run) => {
    const source = run.triage!.current()[0]!;
    expect(await run.externalMessaging!.targets!()).toEqual([]);
    const ack = await run.externalMessaging!.reply(
      source,
      'I will check this task.',
      'acknowledgement',
    );
    expect(ack.state).toBe('provider-accepted');
    expect(fx.rows().every((row) => row.resolved_at === null)).toBe(true);
    expect(
      await run.externalMessaging!.reply(source, 'I will check this task.', 'acknowledgement'),
    ).toEqual(ack);
    await expect(
      run.externalMessaging!.reply(source, 'Changed acknowledgement', 'acknowledgement'),
    ).rejects.toThrow('request-conflict');
    run.assignments.list();
    const final = await run.externalMessaging!.reply(source, answer.text);
    expect(final.state).toBe('provider-accepted');
    expect(final.id).not.toBe(ack.id);
    expect(final.sourceEventId).toBe(source);
    await run.replyFinal?.(answer);
    run.triage!.resolve({ ids: [source], outcome: 'done' });
  });
  try {
    await fx.receive();
    expect(fx.effects()).toBe(2);
    expect(
      fx.core.externalMessaging
        .history('ada')
        .map((intent) => intent.text)
        .sort(),
    ).toEqual(['I will check this task.', answer.text].sort());
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolution: 'done',
        resolved_at: expect.any(String),
        final_reply_json: expect.stringContaining('explicit-send-attempt'),
      }),
    ]);
    const requests = attachOperationalModule(fx.core.operationalDatabase, 'ack-intent-test').read(
      (db) => db.prepare('SELECT request_id FROM messaging_outbox ORDER BY request_id').all(),
    );
    expect(requests).toEqual([
      expect.objectContaining({ request_id: expect.stringMatching(/^acknowledgement-/) }),
      expect.objectContaining({ request_id: expect.stringMatching(/^reply-/) }),
    ]);
    fx.core.externalMessaging.close();
    const recovered = createOutboundMessaging({
      database: attachOperationalModule(fx.core.operationalDatabase, 'ack-recovery-test'),
      isBotActive: (slug) => {
        const bot = fx.core.registry.get(slug);
        return bot !== undefined && bot.paused !== true;
      },
    });
    recovered.register(createDshImProvider(fx.transport)!);
    try {
      const source = fx.core.externalMessaging.history('ada')[0]!.sourceEventId!;
      expect(
        (await recovered.reply('ada', source, 'I will check this task.', 'acknowledgement')).state,
      ).toBe('provider-accepted');
      expect((await recovered.reply('ada', source, answer.text)).state).toBe('provider-accepted');
      expect(fx.effects()).toBe(2);
    } finally {
      recovered.close();
    }
  } finally {
    await fx.close();
  }
});

it('an uncertain acknowledgement is not retried or converted to an automatic final', async () => {
  const fx = await fixture(async (run) => {
    const source = run.triage!.current()[0]!;
    const ack = await run.externalMessaging!.reply(
      source,
      'I will check this task.',
      'acknowledgement',
    );
    expect(ack.state).toBe('unknown-outcome');
    expect(
      await run.externalMessaging!.reply(source, 'I will check this task.', 'acknowledgement'),
    ).toEqual(ack);
    await run.replyFinal?.(answer);
  }, true);
  try {
    await fx.receive();
    expect(fx.effects()).toBe(1);
    expect(fx.core.externalMessaging.history('ada')).toEqual([
      expect.objectContaining({ state: 'unknown-outcome', text: 'I will check this task.' }),
    ]);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('explicit-send-attempt'),
      }),
    ]);
  } finally {
    await fx.close();
  }
});

it('complete false commits one result but retains the Inbox responsibility', async () => {
  const fx = await fixture(async (run) => {
    await run.replyFinal?.({ ...answer, complete: false });
  });
  try {
    await fx.receive();
    expect(fx.effects()).toBe(1);
    expect(fx.rows()).toEqual([
      expect.objectContaining({
        resolved_at: null,
        final_reply_json: expect.stringContaining('"complete":false'),
      }),
    ]);
  } finally {
    await fx.close();
  }
});

it.each([false, true])(
  'late accepted private source after a scheduled silent step (second source: %s)',
  async (secondSource) => {
    let runs = 0;
    let started!: () => void;
    let release!: () => void;
    const active = new Promise<void>((resolve) => {
      started = resolve;
    });
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fx = await fixture(async (run) => {
      runs++;
      await run.replyFinal?.({ action: 'silent' });
      started();
      await held;
      await run.replyFinal?.(answer);
    });
    try {
      fx.core.channels.getOrCreateDm('ada', 'Ada');
      const schedule = fx.core.schedules.create(
        'ada',
        {
          title: 'Late private source',
          prompt: 'Synthetic report wake',
          trigger: { kind: 'every', everySeconds: 3600 },
          enabled: false,
        },
        'human',
      );
      fx.core.schedules.runNow('ada', schedule.id);
      await active;
      await fx.receive(false);
      if (secondSource) await fx.receive(false, 'second-input');
      release();
      await fx.core.runtime.whenIdle();
      expect(runs).toBe(1);
      if (secondSource) {
        expect(fx.effects()).toBe(0);
        expect(fx.rows().every((row) => row.resolved_at === null)).toBe(true);
        return;
      }
      expect(fx.effects()).toBe(1);
      expect(fx.core.externalMessaging.history('ada')).toEqual([
        expect.objectContaining({ state: 'provider-accepted' }),
      ]);
      expect(fx.rows()).toEqual([
        expect.objectContaining({
          resolution: 'done',
          resolved_at: expect.any(String),
          final_reply_json: expect.stringContaining('"status":"accepted"'),
        }),
      ]);
      const wake = attachOperationalModule(fx.core.operationalDatabase, 'late-wake-test').read(
        (db) =>
          db
            .prepare(
              "SELECT a.resolved_at FROM inbox_admissions a JOIN source_events e USING(source_event_id) WHERE e.source_kind='schedule'",
            )
            .all(),
      );
      expect(wake).toEqual([expect.objectContaining({ resolved_at: null })]);
    } finally {
      release();
      await fx.close();
    }
  },
);

it('reading an additional private source does not authorize or retarget a late final', async () => {
  let started!: () => void;
  let release!: () => void;
  let activeRun!: OrchestratorAgentRun;
  let readSourceId!: string;
  let runs = 0;
  const active = new Promise<void>((resolve) => {
    started = resolve;
  });
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fx = await fixture(async (run) => {
    if (++runs > 1) return;
    activeRun = run;
    started();
    await held;
    run.externalMessaging!.read(readSourceId);
    await run.replyFinal?.(answer);
  });
  try {
    fx.core.channels.getOrCreateDm('ada', 'Ada');
    const schedule = fx.core.schedules.create(
      'ada',
      {
        title: 'Read source boundary',
        prompt: 'Synthetic report wake',
        trigger: { kind: 'every', everySeconds: 3600 },
        enabled: false,
      },
      'human',
    );
    fx.core.schedules.runNow('ada', schedule.id);
    await active;
    await fx.receive(false);
    activeRun.sourcePolicy!.setImmediateDelivery('human-dm', 'turn');
    await fx.receive(false, 'read-only-input');
    const row = attachOperationalModule(fx.core.operationalDatabase, 'late-read-test').read((db) =>
      db
        .prepare(
          "SELECT source_event_id FROM source_events WHERE json_extract(payload_json, '$.external.event.eventId') = ?",
        )
        .get('read-only-input'),
    );
    expect(row).toBeDefined();
    readSourceId = String(row!.source_event_id);
    release();
    await fx.core.runtime.whenIdle();
    expect(fx.effects()).toBe(0);
    expect(fx.core.externalMessaging.history('ada')).toEqual([]);
    expect(fx.rows().every((row) => row.resolved_at === null)).toBe(true);
  } finally {
    release();
    await fx.close();
  }
});
