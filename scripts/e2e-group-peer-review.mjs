#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { rpc } from './verify-app.mjs';
import { createContext, presetFor, parseModelRoute } from './e2e-llm-scenarios.mjs';
import {
  PROTOCOL,
  providerUsage,
  price,
  usageDifference,
  taskOutputs,
  stream,
} from './e2e-group-send-review.mjs';

export const PEER_PROTOCOL = {
  ...PROTOCOL,
  version: '2054-peer-v1',
  revisionOf: null,
  priorCandidate: 'f103902165d0b682b089174d3139b927fb1efadb',
  issue: 2054,
  baseline: 'f103902165d0b682b089174d3139b927fb1efadb',
  originalBaseline: PROTOCOL.baseline,
  families: ['redundant', 'independent', 'new-question', 'fyi-control'],
  concurrentPairs: 2,
  interventionChange:
    'Observed peer-answer IDs and explicit audited yield; peer-aware prompt. Existing freshness owner, wake policies and permissions unchanged.',
  context:
    'Each Bot receives a real DM preparatory exchange. A has fixture-verifiable extra evidence only in independent; public request authorizes sharing. Both models run on the final Group request. Natural branches and missed race windows retained.',
  barrier:
    'Peer B commits after A starts a native model Step and before A sends; record draft timing separately. New direct question follows B commit. FYI then same-length explicit-request control in the same episode.',
  oracle:
    'All-Bot/all-Channel history. Redundancy is diagnostic; necessary coverage is not silence alone. Independent evidence QA-317 and rollback R2 must be contributed by A; new question requires 18:00 JST; FYI control requires A confirmation.',
  latency:
    'Last necessary contribution since Group target request; separate explicit-request control latency. Prelude and all settlement remain charged to the episode.',
  budgets: {
    redundantTokens: 1.15,
    independentTokens: 1.2,
    newQuestionTokens: 1.1,
    fyiTokens: 1.1,
    contributionP95: 1.3,
    quietP95: 1.1,
    necessaryCoverage: 0.95,
    independentCoverage: 0.9,
    redundancyReduction: 0.5,
  },
  bootstrap: { seed: 2054, resamples: 10000 },
  comparisons:
    'Forty matched triplets: candidate vs accepted Bi and same candidate vs original B0; no replacement runs. Two pairwise reports share candidate episodes and must not double-count their costs.',
  end: 'Peer reply plus both Bots idle and usage unchanged for 12 seconds, followed by explicit-request control for FYI; otherwise censored at the 240-second whole-episode deadline.',
};
const call = (instance, method, args = {}) => rpc(instance, `botharness/${method}`, args);
const sha = (value) => createHash('sha256').update(value).digest('hex');
const timestamp = (value) => (typeof value === 'number' ? value : Date.parse(value));

export function peerGoal(run) {
  const outputs = taskOutputs(run),
    group = outputs.filter((x) => x.channelId === run.group);
  const a = group.filter((x) => x.message.author.slug === run.bots?.aura);
  const b = group.filter((x) => x.message.author.slug === run.bots?.atlas);
  const clean = outputs.every((x) => x.channelId === run.group);
  const base = b.some((x) => /09[:：]00/.test(x.message.body) && /R3/.test(x.message.body));
  const fact = a.find((x) => /QA-317/.test(x.message.body) && /R2/.test(x.message.body));
  const answer = a.find(
    (x) =>
      timestamp(x.message.at) >= timestamp(run.questionAt) &&
      /18[:：]00/.test(x.message.body) &&
      /JST|东京/.test(x.message.body),
  );
  const control = a.find(
    (x) => timestamp(x.message.at) >= timestamp(run.controlAt) && /R3/.test(x.message.body),
  );
  const necessary =
    run.family === 'independent'
      ? fact
      : run.family === 'new-question'
        ? answer
        : run.family === 'fyi-control'
          ? control
          : b.find((x) => /09[:：]00/.test(x.message.body) && /R3/.test(x.message.body));
  const optional = a.filter(
    (x) => run.family !== 'fyi-control' || timestamp(x.message.at) < timestamp(run.controlAt),
  );
  return {
    goal: clean && base && !!necessary,
    aReplyCount: a.length,
    bReplyCount: b.length,
    redundantReplyCount: run.family === 'redundant' ? optional.length : null,
    fyiAcknowledgments: run.family === 'fyi-control' ? optional.length : null,
    contributionMs: necessary
      ? timestamp(necessary.message.at) - timestamp(run.sourceStartedAt)
      : null,
    controlReplyMs: control ? timestamp(control.message.at) - timestamp(run.controlAt) : null,
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
    startedAt: new Date().toISOString(),
  };
  register(log);
  save();
  const ctx = createContext(
    instance,
    { id: `peer-${family}-${index}`, bots: ['aura', 'atlas'] },
    240,
    log,
    preset,
  );
  const abort = new AbortController();
  let streaming;
  const startDay = new Date().toLocaleDateString('en-CA');
  let deadline;
  const idle = async () => {
    const state = await call(instance, 'activitySnapshot');
    log.activity = state.bots?.filter((b) => Object.values(log.bots).includes(b.slug)) ?? [];
    return log.activity.length === 2 && log.activity.every((b) => b.state === 'idle');
  };
  const waitUntil = async (predicate) => {
    for (;;) {
      await ctx.refresh();
      if (await predicate()) return;
      if (Date.now() >= deadline) {
        log.censored = true;
        throw Error('whole-episode deadline exceeded');
      }
      await delay(500);
    }
  };
  try {
    await ctx.setup();
    log.group = await ctx.mentionsOnlyGroup(['aura', 'atlas']);
    if (variant !== 'original')
      await call(instance, 'channelGroupSendReview', { channelId: log.group, enabled: true });
    log.episodeSourceStartedAt = new Date().toISOString();
    deadline = Date.now() + PEER_PROTOCOL.deadlineSeconds * 1000;
    for (const key of ['atlas', 'aura']) {
      const dm = await ctx.dm(key);
      const extra =
        family === 'independent' && key === 'aura'
          ? '你还有一条独立核验记录：QA-317 指出 R3 的导出有阻断缺陷，发布前必须改用 R2。稍后群里问发布安排时要把这条记录分享出来。'
          : '';
      await ctx.humanSend(
        dm,
        `稍后会在群里讨论发布安排。已知事实：10月20日 09:00 UTC 发布，材料 R3。不要添加未知细节，不创建任务、不找其他 Bot。${extra}现在在此私聊用一句话确认事实，暂不去群里发言。`,
      );
      await waitUntil(
        async () =>
          ctx.messages(dm).some((m) => ctx.isBot(m, key) && m.body?.trim()) && (await idle()),
      );
    }
    log.preludeUsage = await ctx.settledUsage(startDay, 4);
    await ctx.refresh();
    log.preludeMessageIds = [
      ...new Set([...log.channels, ...Object.values(log.bots).map((s) => `dm-${s}`)]),
    ].flatMap((id) => ctx.messages(id).map((m) => m.id));
    streaming = stream(instance, log.group, abort.signal, async (frame) => {
      if (frame.event?.startsWith('channel/draft')) log.frames.push(frame);
    }).catch((error) => {
      if (!abort.signal.aborted) log.streamError = error.message;
    });
    await delay(400);
    log.sourceStartedAt = new Date().toISOString();
    await ctx.humanSend(
      log.group,
      family === 'fyi-control'
        ? '发布安排 FYI：Atlas 请只简短复述日期、UTC 时间和材料。Aura 只作背景知悉，无需回应。不要额外找同事或去私聊。'
        : '请确认发布安排：Atlas 只简短回答日期、UTC 时间和材料；Aura 检查是否有必要补充，有补充时用一段清楚的说明。以已有事实为准，只在本群交流，不找其他同事。',
      ['atlas', 'aura'],
    );
    let previousUsage,
      stableAt = Date.now(),
      controlSent = false;
    for (;;) {
      await ctx.refresh();
      const messages = ctx.messages(log.group);
      const peer = messages
        .filter((m) => ctx.isBot(m, 'atlas') && !log.preludeMessageIds.includes(m.id))
        .sort((a, b) => a.channelRevision - b.channelRevision)[0];
      if (peer && !log.peerMessageId) {
        log.peerMessageId = peer.id;
        log.peerCommittedAt = peer.at;
      }
      if (family === 'new-question' && peer && !log.questionAt) {
        log.questionAt = new Date().toISOString();
        await ctx.humanSend(
          log.group,
          '新的直接问题：Aura，刚才说的发布日期和时间，换算成东京 JST 是几点？请明确给出当地时间，不要只重复 UTC。',
          ['aura'],
        );
      }
      const isIdle = await idle();
      const usage = await ctx.hostUsage(startDay),
        signature = JSON.stringify(usage);
      if (signature !== previousUsage || !usage.ready || !isIdle) stableAt = Date.now();
      previousUsage = signature;
      if (peer && isIdle && Date.now() - stableAt >= PEER_PROTOCOL.usageStableSeconds * 1000) {
        if (family === 'fyi-control' && !controlSent) {
          log.controlAt = new Date().toISOString();
          controlSent = true;
          await ctx.humanSend(
            log.group,
            '发布安排确认：Aura 请只简短复述日期、UTC 时间和材料。Atlas 只作背景知悉，无需回应。不要额外找同事或去私聊。',
            ['aura'],
          );
          stableAt = Date.now();
        } else {
          log.settled = true;
          break;
        }
      }
      if (Date.now() >= deadline) {
        log.censored = true;
        log.settled = false;
        break;
      }
      save();
      await delay(1000);
    }
  } catch (error) {
    log.error = error.message;
  } finally {
    abort.abort();
    await streaming;
    if (log.bots) {
      try {
        log.usage = await ctx.settledUsage(startDay, 12);
      } catch (error) {
        log.usageError = error.message;
      }
      await ctx.refresh().catch(() => {});
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
    const requests =
      log.providerUsage?.filter((s) => s.botSlug === log.bots?.aura).flatMap((s) => s.modelSteps) ??
      [];
    const generationBeforePeer = requests.some(
      (r) =>
        timestamp(r.at) >= timestamp(log.sourceStartedAt) &&
        timestamp(r.at) < timestamp(log.peerCommittedAt),
    );
    const aOutputs = taskOutputs(log).filter(
      (x) => x.channelId === log.group && x.message.author.slug === log.bots?.aura,
    );
    log.windowHit =
      family === 'fyi-control'
        ? null
        : !!log.peerCommittedAt &&
          generationBeforePeer &&
          aOutputs.every((x) => timestamp(x.message.at) >= timestamp(log.peerCommittedAt));
    log.routeMismatch =
      log.usage?.host?.routes.some((r) => r !== 'deepseek-official/deepseek-flash') ?? true;
    log.valid =
      !log.error &&
      !log.streamError &&
      !log.routeMismatch &&
      log.settled === true &&
      log.usage?.settled === true &&
      (family === 'fyi-control' || log.windowHit);
    Object.assign(log, peerGoal(log));
    log.firstReplyMs = log.contributionMs;
    log.costEstimateUSD = price(log.usage?.host);
    log.postPreludeUsage = usageDifference(log.usage?.host, log.preludeUsage?.host);
    log.postPreludeCostEstimateUSD = price(log.postPreludeUsage);
    log.episodeMs = Date.now() - timestamp(log.episodeSourceStartedAt);
    log.finishedAt = new Date().toISOString();
    save();
  }
  return log;
}

async function main() {
  const argv = process.argv.slice(2),
    arg = (key, fallback) => (argv.includes(key) ? argv[argv.indexOf(key) + 1] : fallback);
  const path = resolve(arg('--report', '.humanlayer/tasks/2054/diagnostic.json'));
  if (existsSync(path)) throw Error('Report exists; retain every attempt');
  const instances = Object.fromEntries(
    ['baseline', 'candidate', 'original']
      .filter((v) => v !== 'original' || argv.includes('--original-instance'))
      .map((v) => [v, JSON.parse(readFileSync(arg(`--${v}-instance`), 'utf8'))]),
  );
  const formal = argv.includes('--formal');
  if (formal && !instances.original) throw Error('Formal evaluation requires original B0');
  const report = {
    protocol: PEER_PROTOCOL,
    protocolHash: sha(JSON.stringify(PEER_PROTOCOL)),
    mode: formal ? 'fixed-triplet-pilot' : 'diagnostic-excluded-from-pilot',
    candidate: execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    worktreeDiffHash: sha(execFileSync('git', ['diff', 'HEAD'], { maxBuffer: 20e6 })),
    pairs: [],
    humanAcceptance: 'pending',
  };
  mkdirSync(dirname(path), { recursive: true });
  const save = () => writeFileSync(path, JSON.stringify(report, null, 2) + '\n');
  save();
  const presets = {};
  for (const [v, i] of Object.entries(instances))
    presets[v] = await presetFor(i, parseModelRoute(PEER_PROTOCOL.route));
  let next = 0;
  const count = formal ? 40 : Number(arg('--pairs', '1'));
  async function worker() {
    while (next < count) {
      const n = next++,
        family = formal ? PEER_PROTOCOL.families[Math.floor(n / 10)] : arg('--family', 'redundant');
      const variants = Object.keys(instances);
      const order = n % 2 ? variants.slice().reverse() : variants;
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
            window: r.windowHit,
            tokens: r.usage?.host?.totalTokens,
            error: r.error,
          }),
        );
      }
    }
  }
  await Promise.all(
    Array.from({ length: formal ? PEER_PROTOCOL.concurrentPairs : 1 }, () => worker()),
  );
  report.finishedAt = new Date().toISOString();
  save();
}
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
