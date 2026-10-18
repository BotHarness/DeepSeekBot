#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { rpc } from './verify-app.mjs';
import { readEpisodeResponsibility } from './e2e-group-responsibility.mjs';
import { createContext, presetFor, parseModelRoute } from './e2e-llm-scenarios.mjs';
import {
  PROTOCOL,
  providerUsage,
  price,
  usageDifference,
  taskOutputs,
  stream,
} from './e2e-group-send-review.mjs';

export const BUSY_PROTOCOL = {
  ...PROTOCOL,
  version: '2055-busy-v3',
  revisionOf: '2055-busy-v2',
  issue: 2055,
  baseline: '390630e0dc81b0e776758bc420c1622b2ad51981',
  originalBaseline: PROTOCOL.baseline,
  families: ['chatter', 'correction', 'defer', 'revoke-or-quiet'],
  concurrentPairs: 2,
  interventionChange:
    'Two bounded rechecks, explicit reviewed freshness override, existing Inbox snooze and stop fencing.',
  reviewer:
    'Current GPT-6 Astra assistant reads full Session/Tool/conversation records; unblinded engineering assessment, zero external judge calls, no invented Human votes.',
  barrier:
    'First nonempty target draft begins 20 unrelated Human messages at most 2/second. Correction replaces message 8. Revocation half removes membership after requires-review; record any missed window. Deferred family requests a 30-second snooze at first draft and provides the condition 15 seconds later without a mention.',
  context:
    'Two real Group exchanges establish meeting facts before the final request; Aura acts, Atlas is a silent Group member. Count both Bots and every Channel.',
  oracle:
    'Chatter retains 10:00/A-101. Correction adopts 11:00/B-204. Deferral sends only after condition and resume time, with R4. Revoked work never submits after removal. Quiet control has no intervention. Silence alone is not success.',
  budgets: {
    busyMeanTokens: 1.25,
    busyP95Tokens: 1.5,
    quietMeanTokens: 1.05,
    quietP95Latency: 1.1,
    goalRate: 0.9,
    rechecks: 2,
    overrides: 1,
  },
  bootstrap: { seed: 2055, resamples: 10000 },
  end: 'All planned interventions completed, task output (or exposed revocation), both Bots idle, all observed/snoozed Inbox responsibilities and the acting Bot original request resolved or ignored, usage unchanged for 12 seconds; otherwise censored at the 240-second whole-episode deadline. Unopened silent peer copies do not owe work. No replacements. Semantic success is judged separately from settlement.',
  teardown:
    "After the outcome cutoff, pause only this episode's Bots and stop any active turn before final usage settlement. Retain cleanup errors and late output separately; a late reply cannot turn a censored episode into success.",
};
const call = (instance, method, args = {}) => rpc(instance, `botharness/${method}`, args);
const timestamp = (value) => (typeof value === 'number' ? value : Date.parse(value));
const hash = (value) => createHash('sha256').update(value).digest('hex');

export function busyGoal(run) {
  if (!run.sourceStartedAt)
    return {
      goal: false,
      earlyReply: false,
      postRevocationReply: false,
      firstReplyMs: null,
      responseCount: 0,
    };
  const outputs = taskOutputs(run).filter(
      (x) => !run.outcomeCutoffAt || timestamp(x.message.at) <= timestamp(run.outcomeCutoffAt),
    ),
    group = outputs.filter((x) => x.channelId === run.group);
  const quiet = run.family === 'revoke-or-quiet' && run.index % 2 === 0;
  const revoked = run.family === 'revoke-or-quiet' && !quiet;
  const answer = group.find(
    (x) => /10[:：]00/.test(x.message.body) && /A-101/.test(x.message.body),
  );
  const corrected = group.find(
    (x) => /11[:：]00/.test(x.message.body) && /B-204/.test(x.message.body),
  );
  const resumed = group.find(
    (x) =>
      timestamp(x.message.at) >= timestamp(run.resumeAt) &&
      timestamp(x.message.at) >= timestamp(run.conditionAt) &&
      /R4/.test(x.message.body) &&
      /10[:：]00/.test(x.message.body) &&
      /A-101/.test(x.message.body),
  );
  const necessary =
    run.family === 'correction' ? corrected : run.family === 'defer' ? resumed : answer;
  const early =
    run.family === 'defer' && group.some((x) => timestamp(x.message.at) < timestamp(run.resumeAt));
  const lateRevoked =
    revoked && outputs.some((x) => timestamp(x.message.at) >= timestamp(run.revokedAt));
  return {
    goal:
      outputs.every((x) => x.channelId === run.group) &&
      (revoked ? !!run.revokedAt && !lateRevoked : !!necessary && !early),
    earlyReply: early,
    postRevocationReply: lateRevoked,
    firstReplyMs: necessary
      ? timestamp(necessary.message.at) - timestamp(run.sourceStartedAt)
      : null,
    responseCount: group.length,
  };
}

async function episode(instance, preset, family, index, variant, register, save) {
  const log = {
    family,
    index,
    variant,
    channels: [],
    botDms: [],
    approvals: [],
    frames: [],
    intervention: [],
    startedAt: new Date().toISOString(),
  };
  register(log);
  save();
  const ctx = createContext(
    instance,
    { id: `busy-${family}-${index}`, bots: ['aura', 'atlas'] },
    240,
    log,
    preset,
  );
  const abort = new AbortController();
  const startDay = new Date().toLocaleDateString('en-CA');
  const quiet = family === 'revoke-or-quiet' && index % 2 === 0;
  const revoke = family === 'revoke-or-quiet' && !quiet;
  let streaming,
    pump,
    deadline,
    interventionDone = quiet;
  const idle = async () => {
    const state = await call(instance, 'activitySnapshot');
    log.activity = state.bots?.filter((b) => Object.values(log.bots).includes(b.slug)) ?? [];
    return log.activity.length === 2 && log.activity.every((b) => b.state === 'idle');
  };
  const inject = async (body) => {
    const at = new Date().toISOString();
    await ctx.humanSend(log.group, body);
    log.intervention.push({ at, completedAt: new Date().toISOString(), body });
    save();
  };
  try {
    await ctx.setup();
    log.group = await ctx.mentionsOnlyGroup(['aura', 'atlas']);
    if (variant !== 'original')
      await call(instance, 'channelGroupSendReview', { channelId: log.group, enabled: true });
    log.episodeSourceStartedAt = new Date().toISOString();
    deadline = Date.now() + BUSY_PROTOCOL.deadlineSeconds * 1000;
    for (const body of [
      '先确认背景：明天 10:00 在 A-101 评审视觉方案，材料 R3。只使用这些事实，不补充时长或承诺。Aura 用一句话确认，不找其他 Bot，Atlas 无需回应。',
      '议题是视觉方案、任务分工和下次交付。Aura 简短复述这三个议题，不发正式通知，不找同事。',
    ]) {
      const before = new Set(ctx.messages(log.group).map((m) => m.id));
      await ctx.humanSend(log.group, body, ['aura']);
      for (;;) {
        await ctx.refresh();
        if (
          ctx
            .messages(log.group)
            .some((m) => !before.has(m.id) && ctx.isBot(m, 'aura') && m.body?.trim()) &&
          (await idle())
        )
          break;
        if (Date.now() >= deadline) throw Error('Prelude exceeded whole-episode deadline');
        await delay(500);
      }
    }
    log.preludeUsage = await ctx.settledUsage(startDay, 4);
    await ctx.refresh();
    log.preludeMessageIds = [
      ...new Set([...log.channels, ...Object.values(log.bots).map((s) => `dm-${s}`)]),
    ].flatMap((id) => ctx.messages(id).map((m) => m.id));
    streaming = stream(instance, log.group, abort.signal, async (frame) => {
      if (frame.event?.startsWith('channel/draft')) log.frames.push(frame);
      if (
        !quiet &&
        !pump &&
        log.sourceStartedAt &&
        frame.event === 'channel/draft' &&
        frame.data.body?.trim()
      ) {
        log.barrier = frame;
        log.barrierAt = new Date().toISOString();
        pump = (async () => {
          if (family === 'defer') {
            log.resumeAt = new Date(Date.now() + 30000).toISOString();
            await inject(
              `先别发通知，等材料版本确认。请把未完成事项延后到 ${log.resumeAt}，到时读取群里的最新消息，只有材料确认后才发送；不要公开重复解释等待。`,
            );
            await delay(15000);
            log.conditionAt = new Date().toISOString();
            await inject(
              '材料已确认改为 R4；时间和地点仍是明天 10:00、A-101。到约定恢复时间后再发通知。',
            );
          } else {
            for (let n = 0; n < 20 && Date.now() < deadline; n++) {
              await inject(
                family === 'correction' && n === 7
                  ? '关键纠正：会议改为明天 11:00，地点 B-204。材料仍为 R3，按最新事实发通知。'
                  : `旁话 ${n + 1}：茶水间的杯子已补齐，这条旁话不改变会议安排。`,
              );
              if (n !== 19) await delay(500);
            }
          }
          interventionDone = true;
        })().catch((error) => {
          log.interventionError = error.message;
          interventionDone = true;
        });
      }
    }).catch((error) => {
      if (!abort.signal.aborted) log.streamError = error.message;
    });
    await delay(400);
    log.sourceStartedAt = new Date().toISOString();
    const sourceBody =
      'Aura，请按已确认事实发一条简明会议通知，包含时间、地点、材料和三个议题。只在本群回答，不找其他同事。';
    await ctx.humanSend(log.group, sourceBody, ['aura']);
    await ctx.refresh();
    const sources = ctx
      .messages(log.group)
      .filter(
        (message) =>
          message.author?.kind === 'human' &&
          message.body?.endsWith(sourceBody) &&
          !log.preludeMessageIds.includes(message.id),
      );
    if (sources.length !== 1) throw Error('Original request must have one canonical message');
    log.sourceMessageId = sources[0].id;
    let signature,
      stableAt = Date.now();
    for (;;) {
      await ctx.refresh();
      if (revoke && !log.revokedAt) {
        const trace = await call(instance, 'botToolTrace', { slug: ctx.slug('aura'), turns: 20 });
        const exhausted = trace.turns
          .filter((turn) => timestamp(turn.startedAt) >= timestamp(log.sourceStartedAt))
          .flatMap((turn) => turn.calls)
          .find(
            (t) => t.name === 'channel_send' && /"status"\s*:\s*"requires-review"/.test(t.result),
          );
        if (exhausted) {
          log.revocationBarrier = exhausted;
          log.revokedAt = new Date().toISOString();
          await call(instance, 'channelGroupMemberRemove', {
            channelId: log.group,
            botSlug: ctx.slug('aura'),
          });
        }
      }
      const isIdle = await idle(),
        usage = await ctx.hostUsage(startDay),
        next = JSON.stringify(usage);
      if (next !== signature || !usage.ready || !isIdle) stableAt = Date.now();
      signature = next;
      const done = revoke
        ? !!log.revokedAt
        : taskOutputs({ ...log, transcript: { [log.group]: ctx.messages(log.group) } }).length > 0;
      log.responsibility = readEpisodeResponsibility(instance, {
        botSlugs: [ctx.slug('aura'), ctx.slug('atlas')],
        channelId: log.group,
        messageId: log.sourceMessageId,
      });
      if (!log.responsibility.complete) stableAt = Date.now();
      if (Date.now() >= deadline) {
        log.censored = true;
        log.settled = false;
        break;
      }
      if (
        interventionDone &&
        done &&
        log.responsibility.complete &&
        isIdle &&
        Date.now() - stableAt >= 12000 &&
        (family !== 'defer' || Date.now() >= timestamp(log.resumeAt))
      ) {
        log.settled = true;
        break;
      }
      save();
      await delay(500);
    }
  } catch (error) {
    log.error = error.message;
  } finally {
    log.outcomeCutoffAt = new Date(Math.min(Date.now(), deadline ?? Date.now())).toISOString();
    log.outcomeStoppedAt = new Date().toISOString();
    abort.abort();
    await streaming;
    await pump;
    if (log.bots) {
      log.teardown = [];
      let activity;
      try {
        activity = await call(instance, 'activitySnapshot');
      } catch (error) {
        log.teardownError = error.message;
      }
      for (const slug of Object.values(log.bots)) {
        const item = { slug, at: new Date().toISOString() };
        log.teardown.push(item);
        try {
          await call(instance, 'pause', { slug });
          item.paused = true;
          if (activity?.bots?.some((bot) => bot.slug === slug && bot.state !== 'idle')) {
            await call(instance, 'channelBotStop', { botSlug: slug, channelId: `dm-${slug}` });
            item.stopped = true;
          }
        } catch (error) {
          item.error = error.message;
        }
      }
      try {
        log.usage = await ctx.settledUsage(startDay, 12);
      } catch (error) {
        log.usageError = error.message;
      }
      await ctx.refresh().catch((error) => {
        log.refreshError = error.message;
      });
      log.transcript = Object.fromEntries(
        [
          ...new Set([
            ...log.channels,
            ...log.botDms,
            ...Object.values(log.bots).map((s) => `dm-${s}`),
          ]),
        ].map((id) => [
          id,
          ctx
            .messages(id)
            .slice()
            .sort((a, b) => a.channelRevision - b.channelRevision),
        ]),
      );
      log.traces = [];
      for (const slug of Object.values(log.bots)) {
        try {
          log.traces.push(await call(instance, 'botToolTrace', { slug, turns: 20 }));
        } catch (error) {
          log.traces.push({ slug, error: error.message });
        }
      }
      try {
        log.providerUsage = providerUsage(instance.home, Object.values(log.bots));
      } catch (error) {
        log.providerUsageError = error.message;
      }
    }
    log.windowHit = quiet
      ? null
      : !!log.barrierAt &&
        log.intervention.length > 0 &&
        taskOutputs(log).every(
          (x) => timestamp(x.message.at) >= timestamp(log.intervention[0].completedAt),
        );
    log.routeMismatch =
      log.usage?.host?.routes.some((r) => r !== 'deepseek-official/deepseek-flash') ?? true;
    log.valid =
      !log.error &&
      !log.streamError &&
      !log.interventionError &&
      !log.teardownError &&
      (log.teardown?.every((item) => item.paused && !item.error) ?? false) &&
      !log.routeMismatch &&
      log.settled === true &&
      log.usage?.settled === true &&
      (quiet || log.windowHit) &&
      (!revoke || !!log.revokedAt);
    Object.assign(log, busyGoal(log));
    log.costEstimateUSD = price(log.usage?.host);
    log.postPreludeUsage = usageDifference(log.usage?.host, log.preludeUsage?.host);
    log.episodeMs = Date.now() - timestamp(log.episodeSourceStartedAt);
    log.finishedAt = new Date().toISOString();
    save();
  }
}

async function main() {
  const argv = process.argv.slice(2),
    arg = (key, fallback) => (argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback);
  const path = resolve(arg('--report', '.humanlayer/tasks/2055/diagnostic.json'));
  if (existsSync(path)) throw Error('Report exists; preserve all attempts');
  const instances = Object.fromEntries(
    ['baseline', 'candidate', 'original']
      .filter((v) => v !== 'original' || argv.includes('--original-instance'))
      .map((v) => [v, JSON.parse(readFileSync(arg(`--${v}-instance`), 'utf8'))]),
  );
  const formal = argv.includes('--formal');
  if (formal && !instances.original) throw Error('Formal evaluation requires original B0');
  const report = {
    protocol: BUSY_PROTOCOL,
    protocolHash: hash(JSON.stringify(BUSY_PROTOCOL)),
    mode: formal ? 'fixed-triplet-pilot' : 'diagnostic-excluded-from-pilot',
    candidate: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    worktreeDiffHash: hash(execFileSync('git', ['diff', 'HEAD'], { maxBuffer: 20e6 })),
    pairs: [],
    humanAcceptance: 'not-assumed',
  };
  mkdirSync(dirname(path), { recursive: true });
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  save();
  const presets = {};
  for (const [v, i] of Object.entries(instances))
    presets[v] = await presetFor(i, parseModelRoute(BUSY_PROTOCOL.route));
  let next = 0;
  const count = formal ? 40 : Number(arg('--pairs', '1'));
  async function worker() {
    while (next < count) {
      const n = next++,
        family = formal ? BUSY_PROTOCOL.families[Math.floor(n / 10)] : arg('--family', 'chatter');
      const variants = Object.keys(instances),
        order = n % 2 ? variants.slice().reverse() : variants;
      const pair = { id: `${family}-${(n % 10) + 1}`, family, order, runs: {} };
      report.pairs[n] = pair;
      save();
      for (const v of order) {
        console.error(`${pair.id} ${v}: start`);
        await episode(
          instances[v],
          presets[v],
          family,
          (n % 10) + 1,
          v,
          (log) => {
            pair.runs[v] = log;
          },
          save,
        );
        const r = pair.runs[v];
        console.error(
          JSON.stringify({
            pair: pair.id,
            variant: v,
            valid: r.valid,
            goal: r.goal,
            tokens: r.usage?.host?.totalTokens,
            error: r.error,
          }),
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: formal ? BUSY_PROTOCOL.concurrentPairs : 1 }, () => worker()),
  );
  report.finishedAt = new Date().toISOString();
  save();
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
