#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs, promisify } from 'node:util';

const run = promisify(execFile);

export const LABEL = 'long-run-validation';
export const SEVERITY_LABELS = {
  critical: 'severity:critical',
  major: 'severity:major',
  minor: 'severity:minor',
};
export const DEFAULTS = { stuckMinutes: 120, backlogMinutes: 120, unreachableChecks: 2 };

const ACTIVE_SESSION_STATES = new Set(['thinking', 'working']);

export function evaluate(snapshot, state = {}, options = {}) {
  const limits = { ...DEFAULTS, ...options };
  const now = Date.parse(snapshot.at);
  const minutes = (since) => (now - since) / 60_000;
  const findings = [];
  const next = {
    consecutiveFailures: snapshot.reachable ? 0 : (state.consecutiveFailures ?? 0) + 1,
    blockedSince: {},
  };

  if (!snapshot.reachable) {
    if (next.consecutiveFailures >= limits.unreachableChecks)
      findings.push({
        key: 'host-unreachable',
        rule: 'host-unreachable',
        severity: 'critical',
        title: 'Host unreachable from the observer',
        facts: {
          consecutiveFailedChecks: next.consecutiveFailures,
          error: snapshot.error ?? 'unknown',
        },
      });
    next.blockedSince = state.blockedSince ?? {};
    return { findings, state: next };
  }

  for (const bot of snapshot.bots) {
    const activity = bot.activity?.bot;
    if (activity?.state === 'blocked') {
      const since = state.blockedSince?.[bot.slug] ?? now;
      next.blockedSince[bot.slug] = since;
      if (minutes(since) >= limits.stuckMinutes)
        findings.push({
          key: `bot-blocked:${bot.slug}`,
          rule: 'bot-blocked',
          severity: 'major',
          bot: bot.slug,
          title: `${bot.slug} has been blocked for ${Math.round(minutes(since))} minutes`,
          facts: { blockedSince: new Date(since).toISOString(), attention: activity.attention },
        });
    }

    for (const session of activity?.sessions ?? []) {
      if (!ACTIVE_SESSION_STATES.has(session.state)) continue;
      if (minutes(session.at) < limits.stuckMinutes) continue;
      findings.push({
        key: `session-stalled:${session.id}`,
        rule: 'session-stalled',
        severity: 'major',
        bot: bot.slug,
        title: `${bot.slug} session ${session.role} stalled in ${session.state}`,
        facts: {
          sessionId: session.id,
          role: session.role,
          state: session.state,
          lastActivityAt: new Date(session.at).toISOString(),
          tool: session.activity?.tool,
        },
      });
    }

    for (const session of bot.sessions?.sessions ?? []) {
      if (session.assignmentActivity !== 'error') continue;
      findings.push({
        key: `assignment-error:${session.sessionId}`,
        rule: 'assignment-error',
        severity: 'major',
        bot: bot.slug,
        title: `${bot.slug} Assignment Session ended in error`,
        facts: { sessionId: session.sessionId, role: session.role, createdAt: session.createdAt },
      });
    }

    const items = bot.attention?.items ?? [];
    for (const item of items) {
      if (item.state !== 'needs-repair') continue;
      findings.push({
        key: `attention-needs-repair:${item.id}`,
        rule: 'attention-needs-repair',
        severity: 'major',
        bot: bot.slug,
        title: `${bot.slug} Attention Unit needs repair (${item.reason})`,
        facts: attentionFacts(item),
        evidence: evidenceAnchor(item),
      });
    }

    const stale = items.filter(
      (item) =>
        item.state === 'open' && minutes(Date.parse(item.createdAt)) >= limits.backlogMinutes,
    );
    if (stale.length > 0)
      findings.push({
        key: `attention-backlog:${bot.slug}`,
        rule: 'attention-backlog',
        severity: 'minor',
        bot: bot.slug,
        title: `${bot.slug} has ${stale.length} open Attention Units older than ${limits.backlogMinutes} minutes`,
        facts: {
          count: stale.length,
          oldest: stale.map((item) => item.createdAt).sort()[0],
          ids: stale.slice(0, 10).map((item) => item.id),
          reasons: [...new Set(stale.map((item) => item.reason))],
        },
        evidence: evidenceAnchor(stale[0]),
      });
  }
  return { findings, state: next };
}

function attentionFacts(item) {
  return {
    id: item.id,
    reason: item.reason,
    state: item.state,
    sourceKind: item.sourceKind,
    authorKind: item.authorKind,
    createdAt: item.createdAt,
    ...(item.assignmentSessionId === undefined
      ? {}
      : { assignmentSessionId: item.assignmentSessionId }),
    ...(item.assignmentReportState === undefined
      ? {}
      : { assignmentReportState: item.assignmentReportState }),
  };
}

function evidenceAnchor(item) {
  return item?.sourceChannelId !== undefined && item?.sourceMessageId !== undefined
    ? { channelId: item.sourceChannelId, messageId: item.sourceMessageId }
    : undefined;
}

export function issueBody(finding, context) {
  return [
    `Observed by the long-run validation observer (#${context.trackingIssue}).`,
    '',
    `- Rule: \`${finding.rule}\``,
    `- Severity: ${finding.severity}`,
    ...(finding.bot === undefined ? [] : [`- PersonaBot: \`${finding.bot}\``]),
    `- Harness tag: \`${context.harnessTag ?? 'unknown'}\``,
    `- First observed: ${context.at}`,
    ...(context.bundle === undefined
      ? []
      : [`- Diagnostic Bundle kept on the observer machine: \`${context.bundle}\``]),
    '',
    '```json',
    JSON.stringify(finding.facts, null, 2),
    '```',
    '',
    'Recorded only. Per the run rules this is not fixed during the validation unless it causes data loss or a security problem.',
  ].join('\n');
}

export function dailyReport(date, snapshots, events) {
  const checks = snapshots.length;
  const unreachable = snapshots.filter((snapshot) => !snapshot.reachable).length;
  const opened = events.filter((event) => event.type === 'opened');
  const cleared = events.filter((event) => event.type === 'cleared');
  const interventions = events.filter((event) => event.type === 'intervention');
  const bySeverity = { critical: 0, major: 0, minor: 0 };
  for (const event of opened) bySeverity[event.severity] = (bySeverity[event.severity] ?? 0) + 1;
  const states = {};
  for (const snapshot of snapshots)
    for (const bot of snapshot.bots ?? []) {
      const state = bot.activity?.bot?.state ?? 'unknown';
      states[bot.slug] ??= {};
      states[bot.slug][state] = (states[bot.slug][state] ?? 0) + 1;
    }
  const lines = [
    `**Long-run validation, ${date}**`,
    `Checks: ${checks}, Host unreachable in ${unreachable}.`,
    `New issues: ${opened.length} (critical ${bySeverity.critical}, major ${bySeverity.major}, minor ${bySeverity.minor}). Cleared: ${cleared.length}.`,
    `Human interventions: ${interventions.length}.`,
  ];
  for (const event of opened) lines.push(`- ${event.severity}: ${event.title} (#${event.issue})`);
  for (const event of interventions) lines.push(`- intervention: ${event.note}`);
  for (const [slug, counts] of Object.entries(states))
    lines.push(
      `- ${slug}: ${Object.entries(counts)
        .map(([state, count]) => `${state} ${count}`)
        .join(', ')}`,
    );
  return lines.join('\n');
}

function readJsonl(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function readJson(path, fallback) {
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : fallback;
}

async function cli(binary, args) {
  const { stdout } = await run(binary, [...args, '--compact'], {
    env: process.env,
    timeout: 150_000,
    maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(stdout);
}

async function readHost(binary) {
  const at = new Date().toISOString();
  try {
    const { bots } = await cli(binary, ['list']);
    const live = bots.filter((bot) => !bot.deleted);
    const readings = [];
    for (const bot of live) {
      const [activity, attention, sessions] = await Promise.all([
        cli(binary, ['bot-activity', bot.slug, '--limit', '100']),
        cli(binary, ['bot-attention', bot.slug, '--limit', '100']),
        cli(binary, ['bot-sessions', bot.slug, '--limit', '100']),
      ]);
      readings.push({ slug: bot.slug, paused: bot.paused === true, activity, attention, sessions });
    }
    return { at, reachable: true, bots: readings };
  } catch (error) {
    const code = /"code"\s*:\s*"([^"]+)"/.exec(String(error.stdout ?? ''))?.[1];
    return { at, reachable: false, error: code ?? error.code ?? 'cli-failed', bots: [] };
  }
}

async function exportBundle(anchor, directory, name) {
  const base = process.env.DEEPSEEKBOT_HOST;
  const token = process.env.DEEPSEEKBOT_HOST_TOKEN;
  if (!base || !token) return undefined;
  const login = new URL(base);
  login.searchParams.set('token', token);
  const response = await fetch(login, { redirect: 'manual' });
  await response.body?.cancel();
  const cookie = response.headers
    .getSetCookie()
    .map((entry) => entry.split(';')[0])
    .join('; ');
  if (!cookie) return undefined;
  const post = (path, body) =>
    fetch(new URL(path, base), {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify(body),
    });
  const preview = await post('/api/botharness/diagnostic-bundle/preview', {
    channelId: anchor.channelId,
    fromMessageId: anchor.messageId,
    paddingMinutes: 60,
  });
  if (!preview.ok) return undefined;
  const { token: previewToken } = await preview.json();
  const archive = await post('/api/botharness/diagnostic-bundle', { token: previewToken });
  if (!archive.ok) return undefined;
  mkdirSync(directory, { recursive: true });
  const file = `${name}.zip`;
  writeFileSync(join(directory, file), Buffer.from(await archive.arrayBuffer()));
  return file;
}

async function gh(args) {
  const { stdout } = await run('gh', args, { env: process.env });
  return stdout.trim();
}

function paths(stateDir, at) {
  return {
    state: join(stateDir, 'state.json'),
    events: join(stateDir, 'events.jsonl'),
    snapshots: join(stateDir, 'snapshots', `${at.slice(0, 10)}.jsonl`),
    bundles: join(stateDir, 'bundles'),
    reports: join(stateDir, 'reports'),
  };
}

async function check(config) {
  const snapshot = await readHost(config.cli);
  const files = paths(config.stateDir, snapshot.at);
  mkdirSync(join(config.stateDir, 'snapshots'), { recursive: true });
  appendFileSync(files.snapshots, `${JSON.stringify(snapshot)}\n`);
  const saved = readJson(files.state, { rules: {}, open: {} });
  const { findings, state } = evaluate(snapshot, saved.rules, config.limits);
  const open = { ...saved.open };
  const event = (value) =>
    appendFileSync(files.events, `${JSON.stringify({ at: snapshot.at, ...value })}\n`);

  for (const finding of findings) {
    if (open[finding.key] !== undefined) continue;
    const stamp = snapshot.at.replace(/[:.]/g, '-');
    const bundle =
      finding.evidence === undefined || config.dryRun
        ? undefined
        : await exportBundle(finding.evidence, files.bundles, `${stamp}-${finding.rule}`).catch(
            () => undefined,
          );
    const body = issueBody(finding, { ...config, at: snapshot.at, bundle });
    let issue = 'dry-run';
    if (config.dryRun) console.log(`[dry-run] ${finding.severity} ${finding.title}\n${body}\n`);
    else {
      const url = await gh([
        'issue',
        'create',
        '--repo',
        config.repo,
        '--title',
        `[long-run] ${finding.title}`,
        '--body',
        body,
        '--label',
        LABEL,
        '--label',
        SEVERITY_LABELS[finding.severity],
      ]);
      issue = url.split('/').at(-1);
    }
    open[finding.key] = { issue, since: snapshot.at };
    event({
      type: 'opened',
      key: finding.key,
      severity: finding.severity,
      title: finding.title,
      issue,
    });
  }

  const current = new Set(findings.map((finding) => finding.key));
  for (const [key, entry] of Object.entries(open)) {
    if (current.has(key) || (!snapshot.reachable && key !== 'host-unreachable')) continue;
    if (!config.dryRun && entry.issue !== 'dry-run')
      await gh([
        'issue',
        'comment',
        entry.issue,
        '--repo',
        config.repo,
        '--body',
        `Cleared at ${snapshot.at}: the observer no longer sees this condition.`,
      ]);
    delete open[key];
    event({ type: 'cleared', key, issue: entry.issue });
  }
  writeFileSync(files.state, JSON.stringify({ rules: state, open }, null, 2));
  console.log(
    `${snapshot.at} reachable=${snapshot.reachable} bots=${snapshot.bots.length} findings=${findings.length} open=${Object.keys(open).length}`,
  );
}

async function daily(config, date) {
  const files = paths(config.stateDir, `${date}T00:00:00Z`);
  const events = readJsonl(files.events).filter((event) => event.at.startsWith(date));
  const report = dailyReport(date, readJsonl(files.snapshots), events);
  mkdirSync(files.reports, { recursive: true });
  writeFileSync(join(files.reports, `${date}.md`), `${report}\n`);
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook && !config.dryRun)
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: report.slice(0, 1900), allowed_mentions: { parse: [] } }),
    });
  console.log(report);
}

async function setup(config) {
  const labels = [
    [LABEL, 'ededed', 'Found during the long-run multi-Bot validation'],
    [SEVERITY_LABELS.critical, 'b60205', 'Long-run validation: run stopped or data at risk'],
    [SEVERITY_LABELS.major, 'd93f0b', 'Long-run validation: a Bot or Assignment stopped working'],
    [SEVERITY_LABELS.minor, 'fbca04', 'Long-run validation: degraded but still working'],
  ];
  for (const [name, color, description] of labels)
    await gh([
      'label',
      'create',
      name,
      '--repo',
      config.repo,
      '--color',
      color,
      '--description',
      description,
      '--force',
    ]);
  console.log(`Labels ready in ${config.repo}.`);
}

function intervene(config, note) {
  const at = new Date().toISOString();
  const files = paths(config.stateDir, at);
  mkdirSync(config.stateDir, { recursive: true });
  appendFileSync(files.events, `${JSON.stringify({ at, type: 'intervention', note })}\n`);
  console.log(`Recorded intervention at ${at}.`);
}

const USAGE = `Usage: node scripts/long-run-observer.mjs <check|daily|setup|intervene> [options]

  check                 read the Host once, open or clear issues (run every 30 minutes)
  daily [--date D]      write the day's report and post it to DISCORD_WEBHOOK_URL
  setup                 create the long-run labels in the target repository
  intervene --note N    record a Human intervention (restart, unstick, correction)

Options: --state-dir <dir> --repo <owner/name> --cli <deepseekbot binary> --dry-run
Environment: DEEPSEEKBOT_HOST, DEEPSEEKBOT_HOST_TOKEN, LONG_RUN_HARNESS_TAG, DISCORD_WEBHOOK_URL`;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      'state-dir': { type: 'string' },
      repo: { type: 'string' },
      cli: { type: 'string' },
      date: { type: 'string' },
      note: { type: 'string' },
      'dry-run': { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  const command = positionals[0];
  if (values.help || command === undefined) return console.log(USAGE);
  const config = {
    stateDir: values['state-dir'] ?? join(homedir(), '.local', 'state', 'long-run-observer'),
    repo: values.repo ?? 'BotHarness/DeepSeekBot',
    cli: values.cli ?? 'deepseekbot',
    dryRun: values['dry-run'] === true,
    harnessTag: process.env.LONG_RUN_HARNESS_TAG,
    trackingIssue: 1593,
    limits: DEFAULTS,
  };
  if (command === 'check') return check(config);
  if (command === 'daily')
    return daily(config, values.date ?? new Date(Date.now() - 864e5).toISOString().slice(0, 10));
  if (command === 'setup') return setup(config);
  if (command === 'intervene' && values.note) return intervene(config, values.note);
  console.error(USAGE);
  process.exitCode = 2;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
