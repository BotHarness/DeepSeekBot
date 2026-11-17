#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { cookieFor, rpc, verifyPaths } from './verify-app.mjs';
import { installed } from './e2e-assignment-probe.mjs';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const usage = `Usage: node scripts/eval-orchestrator-delegation.mjs [options]

Measure how an Orchestrator splits work between itself and Assignments on a real model and an
isolated Host started with verify-app.mjs launch. Every run gets a fresh Bot with one Workspace
Grant, one Human DM message, and is observed until the Bot and its Assignments go quiet.

Per run it records: Assignments created, how many ran at the same time, work tools the
Orchestrator ran itself (web, Shell, file edits outside Memory), time to the first and last Bot
reply, tokens and their list-price cost across every Session of the Bot, Orchestrator turns,
Assignment steps, a few deterministic checks, and an LLM judge score (1-5) of the delivered answer.

Options:
  --name <n>         verify-app instance (default orch-eval).
  --label <s>        Label stored in the report, e.g. before or after (default run).
  --task <id>        Run only this task (repeatable). --list prints them.
  --runs <n>         Runs per task, 1-10 (default 2).
  --parallel <n>     Runs in flight at once, 1-8 (default 4).
  --model <p/m@e>    Orchestrator and Assignment route (default deepseek-official/deepseek-flash).
  --timeout <s>      Seconds per run before it is cut off (default 600).
  --quiet <s>        Seconds without a new Bot message, an active Bot or a working Assignment
                     that end a run (default 45).
  --judge <p/m>      Judge route: deepseek-official/<model> through DEEPSEEK_API_KEY, or
                     opencode-go/<model> through OPENCODE_GO_API_KEY (default
                     deepseek-official/deepseek-flash). none skips judging.
  --report <path>    JSON report (default .humanlayer/orch-eval/<label>-<time>.json, plus .md).
  --compare <a> <b>  Print a Markdown comparison of two reports and exit.
  --rejudge <path>   Judge a saved report's answers again with --judge and rewrite it.
  --retrace <path>   Re-read the tool calls of a saved report's Bots on this instance and
                     recompute the Orchestrator work columns.
  --list             Print the tasks and exit.`;

const WORK_TOOLS = new Set([
  'web_search',
  'web_fetch',
  'bash',
  'pwsh',
  'shell',
  'write',
  'edit',
  'browser',
  'computer',
]);

const CSV = {
  'data/orders.csv':
    'id,customer,amount,coupon\n1,ann,12.5,\n2,bob,,SPRING\n3,,8,\n4,dan,30,VIP\n5,eve,14,\n',
  'data/users.csv': 'id,name,email,city\n1,ann,ann@x.io,Paris\n2,bob,,Berlin\n3,cid,cid@x.io,\n',
  'data/events.csv':
    'ts,kind,user\n2026-01-01,login,1\n2026-01-01,,2\n2026-01-02,logout,\n2026-01-03,login,3\n2026-01-03,login,\n2026-01-04,,\n',
};

export const TASKS = [
  {
    id: 'quick-math',
    kind: 'trivial',
    expect: { assignments: [0, 0] },
    text: '2 的 20 次方是多少？只回数字。',
    check: ({ answer }) => answer.includes('1048576') || answer.includes('1,048,576'),
  },
  {
    id: 'greeting',
    kind: 'trivial',
    expect: { assignments: [0, 0] },
    text: '你好，简单说说你能帮我做什么？',
  },
  {
    id: 'remember',
    kind: 'trivial',
    expect: { assignments: [0, 0] },
    text: '记住：我写 JS 项目默认用 pnpm，不用 npm。',
  },
  {
    id: 'web-single',
    kind: 'research',
    expect: { assignments: [1, 9] },
    text: '帮我查一下 Bun 最新版本有哪些新特性，简单总结一下。',
  },
  {
    id: 'web-compare',
    kind: 'research',
    expect: { assignments: [2, 9] },
    text: '帮我对比 Hono、Fastify、Elysia 三个 TypeScript Web 框架：各自最新版本号、性能定位、生态成熟度。最后给一张对比表和你的推荐。',
  },
  {
    id: 'coding',
    kind: 'coding',
    expect: { assignments: [1, 9] },
    text: '在工作区写一个 Python 脚本 primes.py，打印 1000 以内质数的个数和总和；再写 test_primes.py 用 unittest 测它，跑通后把结果告诉我。',
    check: ({ answer, workspace }) =>
      existsSync(join(workspace, 'primes.py')) && /168/.test(answer) && /76127|76,127/.test(answer),
  },
  {
    id: 'two-jobs',
    kind: 'mixed',
    expect: { assignments: [2, 9] },
    text: '两件事：1）在工作区写一个 hello.sh，运行时打印当前日期；2）查一下 Node.js 现在最新的 LTS 版本号。',
    check: ({ workspace }) => existsSync(join(workspace, 'hello.sh')),
  },
  {
    id: 'csv-stats',
    kind: 'files',
    expect: { assignments: [1, 9] },
    seed: CSV,
    text: '工作区 data/ 下有三个 CSV，分别统计每个文件的数据行数和每一列的空值数量，汇总成一张表发我。',
    check: ({ answer }) => ['5', '3', '6'].every((rows) => answer.includes(rows)),
  },
];

export function parseArgs(argv) {
  const options = {
    name: 'orch-eval',
    label: 'run',
    tasks: [],
    runs: 2,
    parallel: 4,
    model: 'deepseek-official/deepseek-flash',
    timeoutSeconds: 600,
    quietSeconds: 45,
    judge: 'deepseek-official/deepseek-flash',
    report: undefined,
    compare: undefined,
    list: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = () => {
      const next = argv[++index];
      if (next === undefined) throw new Error(`${flag} needs a value`);
      return next;
    };
    const int = (min, max) => {
      const n = Number(value());
      if (!Number.isInteger(n) || n < min || n > max)
        throw new Error(`${flag} must be an integer from ${min} to ${max}`);
      return n;
    };
    switch (flag) {
      case '--name':
        options.name = value();
        break;
      case '--label':
        options.label = value();
        break;
      case '--task': {
        const id = value();
        if (!TASKS.some((task) => task.id === id)) throw new Error(`unknown task ${id}`);
        options.tasks.push(id);
        break;
      }
      case '--runs':
        options.runs = int(1, 10);
        break;
      case '--parallel':
        options.parallel = int(1, 8);
        break;
      case '--model':
        options.model = value();
        break;
      case '--timeout':
        options.timeoutSeconds = int(60, 3600);
        break;
      case '--quiet':
        options.quietSeconds = int(10, 300);
        break;
      case '--judge':
        options.judge = value();
        break;
      case '--report':
        options.report = value();
        break;
      case '--compare':
        options.compare = [value(), value()];
        break;
      case '--retrace':
        options.retrace = value();
        break;
      case '--rejudge':
        options.rejudge = value();
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
  return options;
}

function parseRoute(spec) {
  const match = /^([^/@\s]+)\/([^@\s]+)(?:@([a-z0-9-]+))?$/u.exec(spec);
  if (!match) throw new Error(`route must be provider/model[@effort], got ${spec}`);
  const [, provider, model, reasoningEffort] = match;
  return { provider, model, ...(reasoningEffort ? { reasoningEffort } : {}) };
}

const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export function maxOverlap(intervals) {
  const edges = intervals.flatMap(([start, end]) => [
    [start, 1],
    [end, -1],
  ]);
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let now = 0;
  let max = 0;
  for (const [, step] of edges) {
    now += step;
    max = Math.max(max, now);
  }
  return max;
}

async function sessionSnapshot(instance, sessionId) {
  const WebSocket = installed('ws');
  const origin = new URL(instance.url).origin;
  const socket = new WebSocket(`${origin.replace(/^http/u, 'ws')}/api/remote.mux`, {
    headers: { cookie: cookieFor(instance.home) },
  });
  let timeout;
  try {
    return await new Promise((done, fail) => {
      timeout = setTimeout(() => fail(new Error('Session snapshot timed out')), 20_000);
      socket.once('error', fail);
      socket.once('open', () =>
        socket.send(
          JSON.stringify({
            type: 'open',
            streamId: crypto.randomUUID(),
            endpoint: 'session/follow',
            payload: {
              args: { request: { address: { kind: 'session', sessionId }, maxMessages: 200 } },
            },
          }),
        ),
      );
      socket.on('message', (raw) => {
        const frame = JSON.parse(String(raw));
        if (frame.type === 'error') fail(new Error(JSON.stringify(frame.error)));
        if (frame.type === 'item' && frame.value.type === 'snapshot') done(frame.value);
      });
    });
  } finally {
    clearTimeout(timeout);
    socket.terminate();
  }
}

export const PRICE_PER_MILLION = { input: 0.15, cacheRead: 0.003, cacheWrite: 0.15, output: 0.6 };

export function readSessionUsage(home, sessionIds) {
  const folder = join(home, 'storages', 'session_projcache', 'sessions');
  return sessionIds.flatMap((sessionId) => {
    const file = join(folder, `${sessionId}.json`);
    if (!existsSync(file)) return [];
    try {
      return [JSON.parse(readFileSync(file, 'utf8')).record];
    } catch {
      return [];
    }
  });
}

export function sessionCost(records) {
  const usage = { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 };
  for (const record of records) {
    const totals = record?.rows?.tokenUsage?.val?.totals;
    if (totals === undefined) continue;
    usage.inputTokens += totals.uncachedInputTokens ?? 0;
    usage.cacheReadTokens += totals.cacheReadTokens ?? 0;
    usage.cacheWriteTokens += totals.cacheWriteTokens ?? 0;
    usage.outputTokens += totals.outputTokens ?? 0;
  }
  const totalTokens = Object.values(usage).reduce((a, b) => a + b, 0);
  const costUsd =
    (usage.inputTokens * PRICE_PER_MILLION.input +
      usage.cacheReadTokens * PRICE_PER_MILLION.cacheRead +
      usage.cacheWriteTokens * PRICE_PER_MILLION.cacheWrite +
      usage.outputTokens * PRICE_PER_MILLION.output) /
    1_000_000;
  return { ...usage, totalTokens, costUsd };
}

async function toolTrace(instance, call, slug) {
  const { sessions } = await call('sessions', { slug });
  const trace = [];
  trace.sessions = sessions;
  trace.turns = { orchestrator: 0, assignment: 0 };
  trace.steps = { orchestrator: 0, assignment: 0 };
  for (const session of sessions) {
    let records = [];
    try {
      records = (await sessionSnapshot(instance, session.sessionId)).records;
    } catch {
      continue;
    }
    const role = session.role === 'orchestrator' ? 'orchestrator' : 'assignment';
    for (const { event } of records) {
      if (event.type === 'turn/start') trace.turns[role] += 1;
      if (event.type === 'step/start') trace.steps[role] += 1;
      if (event.type === 'tool/call') {
        let args = event.data.arguments;
        try {
          args = JSON.parse(args);
        } catch {}
        trace.push({
          role: session.role,
          sessionId: session.sessionId,
          name: event.data.name,
          args,
        });
      }
    }
  }
  return trace;
}

function memoryPath(args, memory) {
  if (JSON.stringify(args ?? '').includes('orch-eval-ws-')) return false;
  const path = typeof args === 'object' ? (args?.path ?? args?.file_path ?? args?.workdir) : '';
  return typeof path !== 'string' || path.startsWith(memory) || !path.startsWith('/');
}

function workCalls(trace, instance, slug) {
  const memory = join(instance.home, 'botharness', 'bots', slug, 'memory');
  return trace.filter(
    (entry) =>
      entry.role === 'orchestrator' &&
      WORK_TOOLS.has(entry.name) &&
      !(
        ['write', 'edit', 'bash', 'pwsh', 'shell'].includes(entry.name) &&
        memoryPath(entry.args, memory)
      ),
  );
}

async function runOne({ instance, call, task, index, route, options, root }) {
  const stamp = `${task.id}-${index}-${Date.now()}`;
  const workspace = join(root, stamp);
  mkdirSync(workspace, { recursive: true });
  for (const [path, content] of Object.entries(task.seed ?? {})) {
    mkdirSync(dirname(join(workspace, path)), { recursive: true });
    writeFileSync(join(workspace, path), content);
  }
  const preset = (
    await call('modelPresetCreate', {
      name: `Eval ${stamp}`,
      orchestrator: route,
      assignmentDefault: route,
    })
  ).preset;
  const bot = (
    await call('create', {
      displayName: `Eval ${task.id} ${index}`,
      persona: '你是 Vain 的私人助理，回答用中文，简洁、可靠。',
    })
  ).bot;
  await call('modelPresetApply', { slug: bot.slug, presetId: preset.id });
  const dm = (await call('channelDm', { slug: bot.slug })).channel.id;
  const created = await call('create', { request: { path: workspace } }, 'workspace');
  await call('grantCreate', { slug: bot.slug, workspaceId: created.workspace.workspaceId });
  const sentAt = Date.now();
  await call('channelSend', { channelId: dm, body: task.text });
  const deadline = sentAt + options.timeoutSeconds * 1000;
  let quietSince = Date.now();
  let lastSignature = '';
  let botMessages = [];
  let assignments = [];
  let timedOut = false;
  const approved = new Set();
  for (;;) {
    await delay(5000);
    const messages = (await call('channelMessages', { channelId: dm, limit: 100 })).messages;
    for (const message of messages)
      if (message.toolApprovalRequest !== undefined && !approved.has(message.id)) {
        approved.add(message.id);
        await call('toolApprovalDecide', {
          channelId: dm,
          messageId: message.id,
          outcome: 'allowed-once',
        }).catch(() => undefined);
      }
    botMessages = messages
      .filter((message) => message.author?.kind === 'bot' && !message.sessionFailure)
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    assignments = (await call('assignments', { slug: bot.slug, includeArchived: true }))
      .assignments;
    const activity = (await call('activitySnapshot', {})).bots.find((b) => b.slug === bot.slug);
    const busy =
      activity?.active === true ||
      assignments.some((a) => ['working', 'stopping'].includes(a.activity));
    const signature = JSON.stringify([
      botMessages.length,
      busy,
      assignments.map((a) => [a.activity, a.updatedAt]),
    ]);
    if (signature !== lastSignature || busy) quietSince = Date.now();
    lastSignature = signature;
    if (botMessages.length > 0 && !busy && Date.now() - quietSince >= options.quietSeconds * 1000)
      break;
    if (Date.now() > deadline) {
      timedOut = true;
      break;
    }
  }
  const trace = await toolTrace(instance, call, bot.slug);
  const orchestratorWork = workCalls(trace, instance, bot.slug);
  const intervals = assignments.map((a) => [
    Date.parse(a.createdAt),
    a.activity === 'working' ? Date.now() : Date.parse(a.latestReport?.at ?? a.updatedAt),
  ]);
  const answer = botMessages.map((message) => message.body ?? '').join('\n\n---\n\n');
  const usage = sessionCost(
    readSessionUsage(
      instance.home,
      trace.sessions.map((session) => session.sessionId),
    ),
  );
  const first = botMessages[0];
  const last = botMessages.at(-1);
  const [low, high] = task.expect.assignments;
  return {
    task: task.id,
    kind: task.kind,
    index,
    bot: bot.slug,
    timedOut,
    assignments: assignments.length,
    assignmentTitles: assignments.map((a) => a.title),
    assignmentStates: assignments.map((a) => a.latestReport?.state ?? a.activity),
    maxParallel: intervals.length ? maxOverlap(intervals) : 0,
    createAssignmentCalls: trace.filter(
      (entry) => entry.role === 'orchestrator' && entry.name === 'create_assignment',
    ).length,
    waitCalls: trace.filter((entry) => entry.name === 'wait_for_assignment').length,
    orchestratorWorkTools: orchestratorWork.map((entry) => entry.name),
    orchestratorWork: orchestratorWork.map((entry) => ({
      name: entry.name,
      args: JSON.stringify(entry.args).slice(0, 300),
    })),
    orchestratorToolCount: trace.filter((entry) => entry.role === 'orchestrator').length,
    assignmentToolCount: trace.filter((entry) => entry.role !== 'orchestrator').length,
    delegationFit: assignments.length >= low && assignments.length <= high,
    firstReplyMs: first ? Date.parse(first.at) - sentAt : null,
    finalReplyMs: last ? Date.parse(last.at) - sentAt : null,
    botMessages: botMessages.length,
    check: task.check ? task.check({ answer, workspace }) : null,
    tokens: usage.totalTokens,
    usage,
    costUsd: usage.costUsd,
    orchestratorTurns: trace.turns.orchestrator,
    orchestratorSteps: trace.steps.orchestrator,
    assignmentSteps: trace.steps.assignment,
    answer,
  };
}

async function judge(spec, task, answer) {
  if (spec === 'none') return null;
  const { provider, model } = parseRoute(spec);
  const [url, key, headers] =
    provider === 'opencode-go'
      ? [
          'https://opencode.ai/zen/go/v1/chat/completions',
          process.env.OPENCODE_GO_API_KEY,
          { 'x-opencode-session': `orch-eval-judge-${Date.now()}` },
        ]
      : ['https://api.deepseek.com/chat/completions', process.env.DEEPSEEK_API_KEY, {}];
  if (!key) throw new Error(`no API key for judge ${spec}`);
  const prompt = `You grade an assistant's reply to a user's request. Today is ${new Date().toISOString().slice(0, 10)}.
Request: ${task.text}
Everything the assistant sent, in order (messages separated by ---):
${answer || '(nothing)'}

The assistant had live web access, so versions, dates and features newer than your own knowledge are expected: do not mark a claim down because you do not recognize it, only when the reply contradicts itself, is vague, or skips part of the request.
Score 1-5: 5 = fully answers every part of the request accurately and usefully; 3 = partly answers or is vague; 1 = missing, wrong or only an acknowledgment. Interim "I'm on it" messages are fine when a final answer follows. Return JSON only: {"score": n, "reason": "<one sentence>"}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${key}`, ...headers },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' },
          max_tokens: 2000,
        }),
        signal: AbortSignal.timeout(120_000),
      });
      const body = await response.json();
      const parsed = JSON.parse(body.choices[0].message.content);
      if (typeof parsed.score === 'number') return parsed;
    } catch {}
    await delay(3000);
  }
  return null;
}

const mean = (values) => {
  const list = values.filter((value) => typeof value === 'number');
  return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null;
};
const rate = (values) => {
  const list = values.filter((value) => typeof value === 'boolean');
  return list.length ? list.filter(Boolean).length / list.length : null;
};

export function summarize(runs) {
  const group = (list) => ({
    runs: list.length,
    delegated: rate(list.map((run) => run.assignments > 0)),
    meanAssignments: mean(list.map((run) => run.assignments)),
    parallelRuns: rate(list.map((run) => run.maxParallel >= 2)),
    meanMaxParallel: mean(list.map((run) => run.maxParallel)),
    orchestratorDidWork: rate(list.map((run) => run.orchestratorWorkTools.length > 0)),
    delegationFit: rate(list.map((run) => run.delegationFit)),
    check: rate(list.map((run) => run.check)),
    judge: mean(list.map((run) => run.judge?.score)),
    firstReplyS: mean(list.map((run) => run.firstReplyMs)) / 1000,
    finalReplyS: mean(list.map((run) => run.finalReplyMs)) / 1000,
    tokens: mean(list.map((run) => run.tokens)),
    costUsd: mean(list.map((run) => run.costUsd)),
    orchestratorTurns: mean(list.map((run) => run.orchestratorTurns)),
    assignmentSteps: mean(list.map((run) => run.assignmentSteps)),
    timedOut: list.filter((run) => run.timedOut).length,
  });
  const tasks = Object.fromEntries(
    [...new Set(runs.map((run) => run.task))].map((id) => [
      id,
      group(runs.filter((run) => run.task === id)),
    ]),
  );
  return {
    all: group(runs),
    trivial: group(runs.filter((run) => run.kind === 'trivial')),
    work: group(runs.filter((run) => run.kind !== 'trivial')),
    tasks,
  };
}

const pct = (value) =>
  value === null || Number.isNaN(value) ? '–' : `${Math.round(value * 100)}%`;
const num = (value, digits = 1) =>
  value === null || Number.isNaN(value) ? '–' : value.toFixed(digits);

function row(label, s) {
  return `| ${label} | ${s.runs} | ${pct(s.delegated)} | ${num(s.meanAssignments)} | ${pct(s.parallelRuns)} | ${pct(s.orchestratorDidWork)} | ${pct(s.delegationFit)} | ${pct(s.check)} | ${num(s.judge, 2)} | ${num(s.firstReplyS, 0)}s | ${num(s.finalReplyS, 0)}s | ${s.tokens === null ? '–' : Math.round(s.tokens / 1000)}k | ${s.costUsd == null ? '–' : `$${s.costUsd.toFixed(4)}`} | ${num(s.orchestratorTurns ?? null)} | ${num(s.assignmentSteps ?? null, 0)} |`;
}

const HEADER = [
  '| Task | Runs | Delegated | Assignments | ≥2 parallel | Orchestrator did work | Expected split | Check | Judge (1-5) | First reply | Last reply | Tokens | Cost | Orch turns | Assignment steps |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
];

export function renderMarkdown(report) {
  const { summary } = report;
  return [
    `# Orchestrator delegation eval: ${report.label}`,
    '',
    `Commit \`${report.commit.slice(0, 12)}\`, model \`${report.model}\`, judge \`${report.judge}\`, ${report.runs.length} runs.`,
    '',
    ...HEADER,
    row('**trivial asks**', summary.trivial),
    row('**work asks**', summary.work),
    ...Object.entries(summary.tasks).map(([id, s]) => row(id, s)),
    '',
  ].join('\n');
}

export function renderComparison(before, after) {
  const lines = [
    `# Orchestrator delegation: ${before.label} vs ${after.label}`,
    '',
    `Before \`${before.commit.slice(0, 12)}\` (${before.runs.length} runs), after \`${after.commit.slice(0, 12)}\` (${after.runs.length} runs), model \`${after.model}\`.`,
    '',
    ...HEADER,
  ];
  const pairs = [
    ['trivial asks', before.summary.trivial, after.summary.trivial],
    ['work asks', before.summary.work, after.summary.work],
    ...Object.keys({ ...before.summary.tasks, ...after.summary.tasks }).map((id) => [
      id,
      before.summary.tasks[id],
      after.summary.tasks[id],
    ]),
  ];
  for (const [id, a, b] of pairs) {
    if (a) lines.push(row(`${id} · ${before.label}`, a));
    if (b) lines.push(row(`${id} · ${after.label}`, b));
  }
  return `${lines.join('\n')}\n`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) return console.log(usage);
  if (options.list) {
    for (const task of TASKS) console.log(`${task.id} (${task.kind}): ${task.text}`);
    return;
  }
  if (options.compare) {
    const [a, b] = options.compare.map((path) => JSON.parse(readFileSync(path, 'utf8')));
    return console.log(renderComparison(a, b));
  }
  if (options.rejudge) {
    const report = JSON.parse(readFileSync(options.rejudge, 'utf8'));
    report.judge = options.judge;
    await Promise.all(
      report.runs.map(async (run) => {
        run.judge = await judge(
          options.judge,
          TASKS.find((task) => task.id === run.task),
          run.answer,
        );
      }),
    );
    report.summary = summarize(report.runs);
    writeFileSync(options.rejudge, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(options.rejudge.replace(/\.json$/u, '.md'), renderMarkdown(report));
    return console.log(renderMarkdown(report));
  }
  const paths = verifyPaths(options.name);
  const instance = JSON.parse(readFileSync(paths.instance, 'utf8'));
  const call = (method, args = {}, namespace = 'botharness') =>
    rpc(instance, `${namespace}/${method}`, args);
  if (options.retrace) {
    const report = JSON.parse(readFileSync(options.retrace, 'utf8'));
    for (const run of report.runs) {
      const work = workCalls(await toolTrace(instance, call, run.bot), instance, run.bot);
      run.orchestratorWorkTools = work.map((entry) => entry.name);
      const trace = await toolTrace(instance, call, run.bot);
      run.usage = sessionCost(
        readSessionUsage(
          instance.home,
          trace.sessions.map((session) => session.sessionId),
        ),
      );
      run.tokens = run.usage.totalTokens;
      run.costUsd = run.usage.costUsd;
      run.orchestratorTurns = trace.turns.orchestrator;
      run.orchestratorSteps = trace.steps.orchestrator;
      run.assignmentSteps = trace.steps.assignment;
      run.orchestratorWork = work.map((entry) => ({
        name: entry.name,
        args: JSON.stringify(entry.args).slice(0, 300),
      }));
    }
    report.summary = summarize(report.runs);
    writeFileSync(options.retrace, `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(options.retrace.replace(/\.json$/u, '.md'), renderMarkdown(report));
    return console.log(renderMarkdown(report));
  }
  const route = parseRoute(options.model);
  const root = join(tmpdir(), `orch-eval-ws-${options.label}-${Date.now()}`);
  const selected = TASKS.filter(
    (task) => options.tasks.length === 0 || options.tasks.includes(task.id),
  );
  const queue = [];
  for (let index = 0; index < options.runs; index += 1)
    for (const task of selected) queue.push({ task, index });
  const runs = [];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      try {
        const result = await runOne({ instance, call, ...job, route, options, root });
        result.judge = await judge(options.judge, job.task, result.answer);
        runs.push(result);
        console.error(
          `${job.task.id}#${job.index}: assignments=${result.assignments} parallel=${result.maxParallel} selfWork=${result.orchestratorWorkTools.join(',') || '-'} final=${Math.round((result.finalReplyMs ?? 0) / 1000)}s judge=${result.judge?.score ?? '-'}`,
        );
      } catch (error) {
        console.error(`${job.task.id}#${job.index}: error ${error.message}`);
        runs.push({
          task: job.task.id,
          kind: job.task.kind,
          index: job.index,
          error: String(error),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: options.parallel }, worker));
  const finished = runs.filter((run) => run.error === undefined);
  const report = {
    label: options.label,
    commit: execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: repoRoot,
      encoding: 'utf8',
      windowsHide: true,
    }).trim(),
    model: options.model,
    judge: options.judge,
    at: new Date().toISOString(),
    summary: summarize(finished),
    errors: runs.filter((run) => run.error !== undefined),
    runs: finished,
  };
  const path =
    options.report ??
    join(
      repoRoot,
      '.humanlayer',
      'orch-eval',
      `${options.label}-${report.at.replace(/[:.]/gu, '-')}.json`,
    );
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.replace(/\.json$/u, '.md'), renderMarkdown(report));
  console.log(renderMarkdown(report));
  console.log(path);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
