#!/usr/bin/env node
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { rpc, verifyPaths } from './verify-app.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_MODEL = 'opencode-go/deepseek-v4.1-flash';

export const usage = `Usage: node scripts/e2e-llm-scenarios.mjs [options]

Run multi-Bot scenarios against a real model on an isolated DSH Host and assert on canonical
Channel state (mentions, deliveries, replies), not on wording. The model is a black box, so these
catch a feature that silently breaks an older model-driven flow. They cost tokens: run them on a
schedule or when the areas a scenario names change, not on every pull request.

Every attempt records the tokens its Bots spent (uncached input, output, cache read, cache write)
from the Host's usage records, so a design change can be judged on cost as well as pass rate.

Options:
  --name <n>            verify-app instance to use (default llm-e2e).
  --launch              Launch that instance first (after pnpm build) and stop it afterwards.
  --scenario <id>       Run only this scenario (repeatable). Default: all.
  --changed-from <ref>  Run only scenarios whose areas changed since this Git ref.
  --attempts <n>        Attempts per scenario, 1-5 (default 2). A scenario passes when any
                        attempt passes; the report keeps every attempt so flakiness stays visible.
  --runs <n>            Run each scenario exactly n times, 1-20, without stopping at the first
                        pass, to measure pass rate and token spread. Replaces --attempts.
  --model <route>       provider/model[@effort] for every scenario Bot (repeatable). Each model
                        runs every selected scenario. Default: ${DEFAULT_MODEL};
                        host-default keeps the Host's own default model.
  --baseline <path>     A previous report; print pass-rate and token deltas against it.
  --compare <a> <b>     Print the deltas between two saved reports (baseline a, current b), then
                        exit without launching anything.
  --settle <s>          Seconds token totals must stay unchanged before an attempt's usage is
                        read as final (default 12, max 120).
  --timeout <s>         Seconds to wait for each scenario's expected state (default 240).
  --report <path>       Write the JSON report here (default .humanlayer/llm-e2e/<time>.json),
                        and a Markdown summary next to it (same name, .md).
  --list                Print the scenarios and their areas, then exit.

The Host needs a model credential: the AX opencode-go selection from docs/agents/ax-model.md
(CI runs dev-model.mjs setup --from-env --model deepseek-v4.1-flash with OPENCODE_GO_API_KEY).
Exit status is 1 when a selected scenario has no passing attempt or run on some model.`;

const RUNTIME_AREAS = [
  'packages/core/src/runtime/',
  'packages/core/src/channels/',
  'packages/core/src/messaging/',
  'packages/core/src/plugin.ts',
  'packages/deepseekbot/',
  'scripts/e2e-llm-scenarios.mjs',
  'package.json',
  'pnpm-lock.yaml',
  'patches/',
];

const CAST = {
  nexus: {
    displayName: '总控 Nexus',
    persona:
      '你是项目总控 Nexus。你在群里协调各位同事，收到同事汇报后简短确认并决定下一步。需要同事做事时在群里 @ 他。',
  },
  aura: {
    displayName: '美工 Aura',
    persona: '你是美工 Aura，负责视觉设计。任务很小就直接在群里给出结果。',
  },
  atlas: {
    displayName: '叙事 Atlas',
    persona: '你是叙事策划 Atlas，负责故事和文案。任务很小就直接在群里给出结果。',
  },
};

const REPORT_RULE = '大家都只在被 @ 时才会被唤醒，所以完成后必须在群消息里 @总控 Nexus 汇报结果。';

export const SCENARIOS = [
  {
    id: 'dm-reply',
    summary: 'A Human DM gets a committed reply through channel_send.',
    areas: RUNTIME_AREAS,
    bots: ['aura'],
    async run(ctx) {
      const dm = await ctx.dm('aura');
      await ctx.humanSend(dm, 'What is 6 times 7? Answer with digits only.');
      await ctx.waitFor('Bot reply with 42', () =>
        ctx.messages(dm).find((message) => ctx.isBot(message, 'aura') && /42/u.test(message.body)),
      );
    },
  },
  {
    id: 'worker-reports-to-coordinator',
    summary: 'A worker woken by a Human mention reports to the coordinator with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(group, `请用一句话给出一个像素风 logo 的配色方案。${REPORT_RULE}`, [
        'aura',
      ]);
      await ctx.waitFor('Aura mentions Nexus and Nexus wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus')),
      );
    },
  },
  {
    id: 'two-workers-report',
    summary: 'Two workers from one Human kickoff each wake the coordinator once.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura', 'atlas'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura', 'atlas']);
      await ctx.humanSend(group, `你们两位各写一句游戏口号。${REPORT_RULE}`, ['aura', 'atlas']);
      await ctx.waitFor('Aura and Atlas each mention Nexus and wake it', () => {
        const messages = ctx.messages(group);
        const aura = messages.find((message) => ctx.mentionedAndWoken(message, 'aura', 'nexus'));
        const atlas = messages.find((message) => ctx.mentionedAndWoken(message, 'atlas', 'nexus'));
        return aura && atlas ? [aura, atlas] : undefined;
      });
    },
  },
  {
    id: 'coordinator-delegates',
    summary: 'The coordinator hands a task to a colleague with @, waking it.',
    areas: RUNTIME_AREAS,
    bots: ['nexus', 'aura'],
    async run(ctx) {
      const group = await ctx.mentionsOnlyGroup(['nexus', 'aura']);
      await ctx.humanSend(
        group,
        '请在群里 @美工 Aura，让她给出一个像素风 logo 的配色方案。大家都只在被 @ 时才会被唤醒。',
        ['nexus'],
      );
      await ctx.waitFor('Nexus mentions Aura and Aura wakes', () =>
        ctx.messages(group).find((message) => ctx.mentionedAndWoken(message, 'nexus', 'aura')),
      );
    },
  },
];

export function parseScenarioArgs(argv) {
  const options = {
    name: 'llm-e2e',
    launch: false,
    scenarios: [],
    changedFrom: undefined,
    attempts: 2,
    runs: undefined,
    models: [],
    baseline: undefined,
    compare: undefined,
    settleSeconds: 12,
    timeoutSeconds: 240,
    report: undefined,
    list: false,
    help: false,
  };
  let attemptsGiven = false;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    switch (flag) {
      case '--name':
        options.name = value();
        if (!/^[a-z0-9][a-z0-9-]*$/u.test(options.name))
          throw new Error('--name must be lowercase letters, digits and dashes');
        break;
      case '--launch':
        options.launch = true;
        break;
      case '--scenario': {
        const id = value();
        if (!SCENARIOS.some((scenario) => scenario.id === id))
          throw new Error(`unknown scenario ${id}`);
        options.scenarios.push(id);
        break;
      }
      case '--changed-from':
        options.changedFrom = value();
        break;
      case '--attempts':
        attemptsGiven = true;
        options.attempts = Number(value());
        if (!Number.isInteger(options.attempts) || options.attempts < 1 || options.attempts > 5)
          throw new Error('--attempts must be an integer from 1 to 5');
        break;
      case '--runs':
        options.runs = Number(value());
        if (!Number.isInteger(options.runs) || options.runs < 1 || options.runs > 20)
          throw new Error('--runs must be an integer from 1 to 20');
        break;
      case '--model': {
        const route = parseModelRoute(value());
        if (options.models.some((entry) => modelLabel(entry) === modelLabel(route)))
          throw new Error(`--model ${modelLabel(route)} is given twice`);
        options.models.push(route);
        break;
      }
      case '--baseline':
        options.baseline = value();
        break;
      case '--compare':
        options.compare = [value(), value()];
        break;
      case '--settle':
        options.settleSeconds = Number(value());
        if (
          !Number.isInteger(options.settleSeconds) ||
          options.settleSeconds < 0 ||
          options.settleSeconds > 120
        )
          throw new Error('--settle must be an integer from 0 to 120');
        break;
      case '--timeout':
        options.timeoutSeconds = Number(value());
        if (!Number.isInteger(options.timeoutSeconds) || options.timeoutSeconds < 10)
          throw new Error('--timeout must be at least 10 seconds');
        break;
      case '--report':
        options.report = value();
        break;
      case '--list':
        options.list = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`unknown option ${flag}`);
    }
  }
  if (attemptsGiven && options.runs !== undefined)
    throw new Error('--runs replaces --attempts; pass one of them');
  if (options.models.length === 0) options.models.push(parseModelRoute(DEFAULT_MODEL));
  return options;
}

export function parseModelRoute(spec) {
  if (spec === 'host-default') return undefined;
  const match = /^([^/@\s]+)\/([^@\s]+)(?:@([a-z0-9-]+))?$/u.exec(spec);
  if (!match) throw new Error(`--model must be provider/model[@effort], got ${spec}`);
  const [, provider, model, reasoningEffort] = match;
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) };
}

export function modelLabel(route) {
  if (route === undefined) return 'host-default';
  return `${route.provider}/${route.model}${route.reasoningEffort ? `@${route.reasoningEffort}` : ''}`;
}

export function selectScenarios(options, changedFiles) {
  let selected = SCENARIOS;
  if (options.scenarios.length > 0)
    selected = selected.filter((scenario) => options.scenarios.includes(scenario.id));
  if (changedFiles !== undefined)
    selected = selected.filter((scenario) =>
      changedFiles.some((file) => scenario.areas.some((area) => file.startsWith(area))),
    );
  return selected;
}

function changedSince(ref) {
  return execFileSync('git', ['diff', '--name-only', `${ref}...HEAD`], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean);
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export const TOKEN_BUCKETS = ['inputTokens', 'outputTokens', 'cacheReadTokens', 'cacheWriteTokens'];

export function sumHostRows(rows) {
  const usage = { routes: [...new Set(rows.map((row) => `${row.provider}/${row.model}`))].sort() };
  for (const bucket of [...TOKEN_BUCKETS, 'totalTokens'])
    usage[bucket] = rows.some((row) => typeof row[bucket] !== 'number')
      ? null
      : rows.reduce((total, row) => total + row[bucket], 0);
  return usage;
}

export function sumSessionTotals(records, slugs) {
  const usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const routes = new Set();
  let sessions = 0;
  for (const record of records) {
    const cwd = record?.identity?.cwd?.replaceAll('\\', '/') ?? '';
    if (!slugs.some((slug) => cwd.includes(`/bots/${slug}/`))) continue;
    const totals = record.rows?.tokenUsage?.val?.totals;
    if (totals === undefined) continue;
    sessions += 1;
    usage.inputTokens += totals.uncachedInputTokens ?? 0;
    usage.outputTokens += totals.outputTokens ?? 0;
    usage.cacheReadTokens += totals.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += totals.cacheWriteTokens ?? 0;
    const used = record.rows?.modelSelection?.val?.lastUsed;
    if (used?.provider && used?.model) routes.add(`${used.provider}/${used.model}`);
  }
  usage.totalTokens = TOKEN_BUCKETS.reduce((total, bucket) => total + usage[bucket], 0);
  return { ...usage, sessions, routes: [...routes].sort() };
}

function readSessionRecords(home) {
  const folder = join(home, 'storages', 'session_projcache', 'sessions');
  if (!existsSync(folder)) return [];
  return readdirSync(folder)
    .filter((file) => file.endsWith('.json'))
    .flatMap((file) => {
      try {
        return [JSON.parse(readFileSync(join(folder, file), 'utf8')).record];
      } catch {
        return [];
      }
    });
}

function cacheHitRate(tokens) {
  const prompt = tokens.inputTokens + tokens.cacheReadTokens + tokens.cacheWriteTokens;
  return prompt > 0 ? Number((tokens.cacheReadTokens / prompt).toFixed(4)) : null;
}

export function summarizeAttempts(attempts) {
  const passed = attempts.filter((attempt) => attempt.result === 'pass').length;
  const measured = attempts.filter((attempt) => attempt.usage !== undefined);
  const mean = Object.fromEntries(
    [...TOKEN_BUCKETS, 'totalTokens'].map((bucket) => [
      bucket,
      measured.length === 0
        ? null
        : Math.round(
            measured.reduce((total, attempt) => total + attempt.usage[bucket], 0) / measured.length,
          ),
    ]),
  );
  const totals = measured.map((attempt) => attempt.usage.totalTokens);
  return {
    runs: attempts.length,
    passed,
    passRate: attempts.length === 0 ? null : Number((passed / attempts.length).toFixed(4)),
    meanTokens: mean,
    minTotalTokens: totals.length ? Math.min(...totals) : null,
    maxTotalTokens: totals.length ? Math.max(...totals) : null,
    cacheHitRate: mean.totalTokens === null ? null : cacheHitRate(mean),
    usageComplete: measured.length === attempts.length && measured.every((a) => a.usage.settled),
    hostMatches: measured.every((attempt) => attempt.usage.hostMatches),
  };
}

const entryKey = (entry) => `${entry.id} ${entry.model}`;

export function compareReports(baseline, current) {
  const before = new Map(baseline.scenarios.map((entry) => [entryKey(entry), entry]));
  const after = new Map(current.scenarios.map((entry) => [entryKey(entry), entry]));
  const keys = [...new Set([...before.keys(), ...after.keys()])];
  return keys.map((key) => {
    const a = before.get(key)?.stats;
    const b = after.get(key)?.stats;
    const [id, model] = key.split(' ');
    const row = { id, model, baseline: a ?? null, current: b ?? null };
    if (a && b) {
      row.passRateDelta =
        a.passRate === null || b.passRate === null
          ? null
          : Number((b.passRate - a.passRate).toFixed(4));
      row.tokenDelta = Object.fromEntries(
        [...TOKEN_BUCKETS, 'totalTokens'].map((bucket) => {
          const x = a.meanTokens[bucket];
          const y = b.meanTokens[bucket];
          return [bucket, x === null || y === null ? null : y - x];
        }),
      );
      const x = a.meanTokens.totalTokens;
      const y = b.meanTokens.totalTokens;
      row.totalTokensChange = x && y !== null ? Number(((y - x) / x).toFixed(4)) : null;
    }
    return row;
  });
}

const count = (value) => (value === null || value === undefined ? '–' : value.toLocaleString('en'));
const percent = (value) =>
  value === null || value === undefined ? '–' : `${Math.round(value * 100)}%`;
const signed = (value, format = count) =>
  value === null || value === undefined ? '–' : `${value > 0 ? '+' : ''}${format(value)}`;

export function renderMarkdown(report, comparison) {
  const lines = [
    `# Real-model scenarios: ${report.result}`,
    '',
    `Commit \`${report.commit.slice(0, 12)}\`. Tokens are the mean per run across every Bot in the scenario; input is uncached input.`,
    '',
    '| Scenario | Model | Passed | Input | Output | Cache read | Cache write | Total | Cache hit |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const entry of report.scenarios) {
    const { stats } = entry;
    const tokens = stats.meanTokens;
    lines.push(
      `| ${entry.id} | ${entry.model} | ${stats.passed}/${stats.runs} | ${count(tokens.inputTokens)} | ${count(tokens.outputTokens)} | ${count(tokens.cacheReadTokens)} | ${count(tokens.cacheWriteTokens)} | ${count(tokens.totalTokens)}${stats.usageComplete ? '' : ' (unsettled)'}${stats.hostMatches ? '' : ' (Host differs)'} | ${percent(stats.cacheHitRate)} |`,
    );
  }
  if (comparison !== undefined) {
    lines.push(
      '',
      `## Against baseline \`${comparison.baselineCommit?.slice(0, 12) ?? 'unknown'}\``,
      '',
      '| Scenario | Model | Pass rate | Δ input | Δ output | Δ cache read | Δ cache write | Δ total |',
      '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |',
    );
    for (const row of comparison.rows) {
      if (!row.baseline || !row.current) {
        lines.push(
          `| ${row.id} | ${row.model} | ${row.baseline ? 'not run now' : 'new'} | | | | | |`,
        );
        continue;
      }
      const delta = row.tokenDelta;
      lines.push(
        `| ${row.id} | ${row.model} | ${percent(row.baseline.passRate)} → ${percent(row.current.passRate)} | ${signed(delta.inputTokens)} | ${signed(delta.outputTokens)} | ${signed(delta.cacheReadTokens)} | ${signed(delta.cacheWriteTokens)} | ${signed(delta.totalTokens)} (${signed(row.totalTokensChange, percent)}) |`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function localDay(date = new Date()) {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function createContext(instance, scenario, timeoutSeconds, log, presetId) {
  const slugs = {};
  const call = (method, args) => rpc(instance, `botharness/${method}`, args);
  let messageCache = new Map();
  const ctx = {
    async setup() {
      for (const key of scenario.bots) {
        const cast = CAST[key];
        const created = await call('create', {
          displayName: cast.displayName,
          persona: cast.persona,
        });
        if (typeof created.bot?.slug !== 'string') throw new Error(`could not create ${key}`);
        slugs[key] = created.bot.slug;
        await call('channelDm', {
          slug: created.bot.slug,
          displayName: cast.displayName,
        });
        if (presetId !== undefined)
          await call('modelPresetApply', { slug: created.bot.slug, presetId });
      }
      log.bots = Object.fromEntries(Object.entries(slugs));
    },
    async hostUsage(start) {
      const filter = { start, end: localDay() };
      const rows = [];
      let ready = true;
      for (const slug of Object.values(slugs)) {
        const result = await call('profileUsage', {
          channelId: `dm-${slug}`,
          filter,
        });
        if (result.freshness !== 'ready') ready = false;
        rows.push(...result.rows);
      }
      return { ...sumHostRows(rows), ready };
    },
    async settledUsage(start, settleSeconds) {
      const deadline = Date.now() + (settleSeconds + 60) * 1000;
      const bots = Object.values(slugs);
      let last;
      let stableSince = Date.now();
      for (;;) {
        const usage = sumSessionTotals(readSessionRecords(instance.home), bots);
        const host = await ctx.hostUsage(start);
        const moving =
          last === undefined ||
          last.usage.totalTokens !== usage.totalTokens ||
          last.host.totalTokens !== host.totalTokens ||
          !host.ready;
        if (moving) stableSince = Date.now();
        last = { usage, host };
        const settled = !moving && Date.now() - stableSince >= settleSeconds * 1000;
        if (settled || Date.now() >= deadline) {
          const { ready: _ready, ...hostUsage } = host;
          return {
            ...usage,
            settled,
            host: hostUsage,
            hostMatches: host.totalTokens === null || host.totalTokens === usage.totalTokens,
          };
        }
        await delay(3000);
      }
    },
    slug: (key) => slugs[key],
    isBot: (message, key) => message.author.kind === 'bot' && message.author.slug === slugs[key],
    async dm(key) {
      const dm = await call('channelDm', {
        slug: slugs[key],
        displayName: CAST[key].displayName,
      });
      return dm.channel.id;
    },
    async mentionsOnlyGroup(keys) {
      const created = await call('channelCreate', {
        name: `LLM e2e ${scenario.id} ${Date.now()}`,
        members: keys.map((key) => slugs[key]),
      });
      const channelId = created.channel.id;
      for (const key of keys)
        await call('channelGroupWakeSet', {
          channelId,
          botSlug: slugs[key],
          mode: 'mentions',
          count: 5,
          intervalSeconds: 30,
        });
      log.channels.push(channelId);
      return channelId;
    },
    async humanSend(channelId, text, mentionKeys = []) {
      let body = '';
      const mentions = [];
      for (const key of mentionKeys) {
        const label = CAST[key].displayName;
        mentions.push({
          botSlug: slugs[key],
          label,
          start: body.length,
          end: body.length + 1 + label.length,
        });
        body += `@${label} `;
      }
      body += text;
      await call('channelSend', {
        channelId,
        body,
        ...(mentions.length ? { mentions } : {}),
      });
      if (!log.channels.includes(channelId)) log.channels.push(channelId);
    },
    messages: (channelId) => messageCache.get(channelId) ?? [],
    mentionedAndWoken(message, fromKey, toKey) {
      return (
        ctx.isBot(message, fromKey) &&
        (message.mentions ?? []).some((mention) => mention.botSlug === slugs[toKey]) &&
        (message.deliveries ?? []).some(
          (delivery) => delivery.botSlug === slugs[toKey] && delivery.state === 'handled',
        )
      );
    },
    async waitFor(label, predicate) {
      const deadline = Date.now() + timeoutSeconds * 1000;
      while (Date.now() < deadline) {
        messageCache = new Map();
        for (const channelId of log.channels) {
          const page = await call('channelMessages', { channelId, limit: 100 });
          messageCache.set(channelId, page.messages);
        }
        const found = predicate();
        if (found) {
          log.proof = { label, found };
          return found;
        }
        await delay(3000);
      }
      throw new Error(`timed out waiting for: ${label}`);
    },
  };
  return ctx;
}

function summarize(message) {
  return {
    id: message.id,
    author: message.author.kind === 'bot' ? message.author.slug : message.author.kind,
    body: message.body.slice(0, 300),
    mentions: message.mentions?.map((mention) => mention.botSlug),
    deliveries: message.deliveries,
  };
}

async function runScenario(instance, scenario, options, route, presetId) {
  const attempts = [];
  const model = modelLabel(route);
  const total = options.runs ?? options.attempts;
  for (let attempt = 1; attempt <= total; attempt += 1) {
    const log = { attempt, channels: [], startedAt: new Date().toISOString() };
    const ctx = createContext(instance, scenario, options.timeoutSeconds, log, presetId);
    const startDay = localDay();
    try {
      await ctx.setup();
      await scenario.run(ctx);
      log.result = 'pass';
    } catch (error) {
      log.result = 'fail';
      log.error = error instanceof Error ? error.message : String(error);
    }
    try {
      if (log.bots !== undefined)
        log.usage = await ctx.settledUsage(startDay, options.settleSeconds);
    } catch (error) {
      log.usageError = error instanceof Error ? error.message : String(error);
    }
    if (
      route !== undefined &&
      log.usage?.routes.some((entry) => entry !== `${route.provider}/${route.model}`)
    )
      log.routeMismatch = log.usage.routes;
    log.transcript = Object.fromEntries(
      log.channels.map((channelId) => [channelId, ctx.messages(channelId).map(summarize)]),
    );
    if (log.proof !== undefined)
      log.proof.found = [log.proof.found].flat().map((message) => summarize(message));
    log.finishedAt = new Date().toISOString();
    attempts.push(log);
    const tokens = log.usage
      ? ` ${log.usage.totalTokens} tokens (in ${log.usage.inputTokens}, out ${log.usage.outputTokens}, cache read ${log.usage.cacheReadTokens}, cache write ${log.usage.cacheWriteTokens})`
      : '';
    console.error(
      `${scenario.id} [${model}] ${options.runs ? 'run' : 'attempt'} ${attempt}: ${log.result}${log.error ? ` (${log.error})` : ''}${tokens}`,
    );
    if (log.result === 'pass' && options.runs === undefined) break;
  }
  return {
    id: scenario.id,
    summary: scenario.summary,
    model,
    ...(route === undefined ? {} : { route }),
    result: attempts.some((attempt) => attempt.result === 'pass') ? 'pass' : 'fail',
    stats: summarizeAttempts(attempts),
    attempts,
  };
}

async function presetFor(instance, route) {
  const call = (method, args) => rpc(instance, `botharness/${method}`, args);
  const { models } = await call('modelCatalog', {});
  const known = models.find(
    (entry) => entry.provider === route.provider && entry.model === route.model,
  );
  if (!known)
    throw new Error(
      `${modelLabel(route)} is not in the Host model catalog; available: ${models.map((entry) => `${entry.provider}/${entry.model}`).join(', ')}`,
    );
  if (
    route.reasoningEffort !== undefined &&
    !known.efforts?.some((effort) => effort.id === route.reasoningEffort)
  )
    throw new Error(`${modelLabel(route)}: effort ${route.reasoningEffort} is not offered`);
  const { preset } = await call('modelPresetCreate', {
    name: `LLM e2e ${modelLabel(route)} ${Date.now()}`,
    orchestrator: route,
    assignmentDefault: route,
  });
  return preset.id;
}

function verifyApp(args) {
  const result = spawnSync(process.execPath, ['scripts/verify-app.mjs', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'inherit'],
    timeout: 900_000,
  });
  if (result.status !== 0) throw new Error(`verify-app ${args[0]} failed`);
  return JSON.parse(result.stdout);
}

async function main() {
  const options = parseScenarioArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }
  if (options.compare !== undefined) {
    const [baseline, current] = options.compare.map((path) =>
      JSON.parse(readFileSync(path, 'utf8')),
    );
    const rows = compareReports(baseline, current);
    console.log(renderMarkdown(current, { baselineCommit: baseline.commit, rows }));
    return;
  }
  if (options.list) {
    console.log(
      JSON.stringify(
        SCENARIOS.map(({ id, summary, areas }) => ({ id, summary, areas })),
        null,
        2,
      ),
    );
    return;
  }
  const baseline =
    options.baseline === undefined ? undefined : JSON.parse(readFileSync(options.baseline, 'utf8'));
  const changed = options.changedFrom === undefined ? undefined : changedSince(options.changedFrom);
  const selected = selectScenarios(options, changed);
  if (selected.length === 0) {
    console.log(JSON.stringify({ result: 'skipped', reason: 'no scenario area changed' }));
    return;
  }
  const paths = verifyPaths(options.name);
  let launched = false;
  if (options.launch) {
    const started = verifyApp(['launch', '--name', options.name]);
    launched = true;
    if (!String(started.model ?? '').length || /missing/u.test(String(started.model)))
      console.error(`warning: Host model credential is ${JSON.stringify(started.model)}`);
  }
  try {
    if (!existsSync(paths.instance))
      throw new Error(`no instance at ${paths.instance}; pass --launch or run verify-app launch`);
    const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
    const results = [];
    const routes = options.models;
    const reportPath = resolve(
      options.report ??
        join(
          repoRoot,
          '.humanlayer',
          'llm-e2e',
          `${new Date().toISOString().replace(/[:.]/gu, '-')}.json`,
        ),
    );
    const summaryPath = reportPath.replace(/\.json$/u, '') + '.md';
    mkdirSync(dirname(reportPath), { recursive: true });
    const report = {
      result: 'running',
      model: instance.secret,
      models: routes.map(modelLabel),
      mode: options.runs === undefined ? { attempts: options.attempts } : { runs: options.runs },
      commit: execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      }).trim(),
      ...(changed === undefined ? {} : { changedFrom: options.changedFrom }),
      scenarios: results,
    };
    let comparison;
    const save = () => {
      comparison =
        baseline === undefined
          ? undefined
          : { baselineCommit: baseline.commit, rows: compareReports(baseline, report) };
      if (comparison !== undefined) report.comparison = comparison;
      writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(summaryPath, renderMarkdown(report, comparison));
    };
    for (const route of routes) {
      const presetId = route === undefined ? undefined : await presetFor(instance, route);
      for (const scenario of selected) {
        results.push(await runScenario(instance, scenario, options, route, presetId));
        save();
      }
    }
    report.result = results.every((item) => item.result === 'pass') ? 'pass' : 'fail';
    save();
    console.log(
      JSON.stringify(
        {
          result: report.result,
          report: reportPath,
          summary: summaryPath,
          scenarios: results.map(({ id, model, result, stats, attempts }) => ({
            id,
            model,
            result,
            passed: `${stats.passed}/${stats.runs}`,
            meanTokens: stats.meanTokens,
            cacheHitRate: stats.cacheHitRate,
            attempts: attempts.map((attempt) => attempt.result),
          })),
        },
        null,
        2,
      ),
    );
    if (report.result !== 'pass') process.exitCode = 1;
  } finally {
    if (launched) verifyApp(['stop', '--name', options.name]);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`e2e-llm-scenarios: ${error.message}`);
    process.exit(1);
  });
}
