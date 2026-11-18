#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { field } from './pr-body-field.mjs';

const AGENT_MARK =
  /Agent-Task:|Generated with \[|Co-Authored-By:[^\n]*(?:Claude|Codex|Cursor|Copilot|Gemini|opencode|DeepSeek|Kimi|Qwen|GLM)/iu;
const SOURCE = 'https://github.com/BotHarness/DeepSeekBot/issues/4296#issuecomment-6915452893';
const KINDS = ['harness', 'model'];
const AGENT_EMAIL = 'noreply@anthropic.com';
const INTERNAL = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
const WRITERS = new Set(['admin', 'maintain', 'write']);
const EXAMPLE = { harness: 'claude-code', model: 'claude-opus-5-5' };

const slug = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/^[`'"]+|[`'"]+$/gu, '')
    .replace(/\s+/gu, '-');

export function declared(body) {
  const result = { harness: [], model: [] };
  for (const kind of KINDS) {
    const line = field(body, kind, { inline: true }) ?? field(body, `${kind}s`, { inline: true });
    if (!line) continue;
    result[kind] = [
      ...new Set(
        line
          .split(/[,，、/]/u)
          .map(slug)
          .filter((value) => /^[a-z0-9][a-z0-9.-]{0,39}$/u.test(value)),
      ),
    ].slice(0, 5);
  }
  return result;
}

const TRAILERS = [
  {
    harness: 'claude-code',
    session: /^Claude-Session:/imu,
    model: /^Co-Authored-By:[ \t]*(Claude[ \t]+[A-Za-z]+[ \t]+\d+(?:\.\d+)*)[ \t]*</gimu,
  },
];

export function trailers(messages) {
  const result = { harness: [], model: [] };
  for (const message of messages) {
    const footer =
      message
        .trim()
        .split(/\n[ \t]*\n/u)
        .at(-1) ?? '';
    for (const agent of TRAILERS) {
      if (agent.session.test(footer)) result.harness.push(agent.harness);
      for (const [, name] of footer.matchAll(agent.model))
        result.model.push(name.toLowerCase().replace(/[\s.]+/gu, '-'));
    }
  }
  return { harness: [...new Set(result.harness)], model: [...new Set(result.model)] };
}

export function plan({ body, labels, existing, external, commits = [] }) {
  const written = declared(body);
  const signed = trailers(commits);
  const named = Object.fromEntries(
    KINDS.map((kind) => [
      kind,
      written[kind].some((value) => existing.includes(`${kind}:${value}`))
        ? written[kind]
        : [...new Set([...written[kind], ...signed[kind]])],
    ]),
  );
  const wanted = KINDS.flatMap((kind) => named[kind].map((value) => `${kind}:${value}`));
  const add = wanted.filter((label) => existing.includes(label) && !labels.includes(label));
  const unknown = wanted.filter((label) => !existing.includes(label));
  const final = [...labels, ...add];
  const agentWork = AGENT_MARK.test(body ?? '') || wanted.length > 0;
  const missing = agentWork
    ? KINDS.filter((kind) => !final.some((label) => label.startsWith(`${kind}:`)))
    : [];
  const problems = missing.map(
    (kind) =>
      `No \`${kind}:\` label. Write \`${kind[0].toUpperCase()}${kind.slice(1)}: ${EXAMPLE[kind]}\` ` +
      `in the description (several allowed, comma-separated), or add the \`${kind}:${EXAMPLE[kind]}\` label. [${SOURCE}]`,
  );
  const notes = unknown.map(
    (label) => `\`${label}\` is not a label yet; a maintainer creates it on review. [${SOURCE}]`,
  );
  return external
    ? { add, errors: [], warnings: [...problems, ...notes] }
    : { add, errors: problems, warnings: notes };
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      ...init.headers,
    },
  });
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path}: ${response.status}`);
  return response.json();
}

async function repoLabels(repo) {
  const names = [];
  for (let page = 1; ; page++) {
    const batch = await github(`/repos/${repo}/labels?per_page=100&page=${page}`);
    names.push(...batch.map((label) => label.name));
    if (batch.length < 100) return names;
  }
}

export const isInternal = (association, permission) =>
  INTERNAL.has(association) || WRITERS.has(permission);

async function permission(repo, login) {
  try {
    return (await github(`/repos/${repo}/collaborators/${login}/permission`)).permission;
  } catch {
    return 'none';
  }
}

async function agentCommits(repo, number) {
  const messages = [];
  for (let page = 1; page <= 3; page++) {
    const batch = await github(`/repos/${repo}/pulls/${number}/commits?per_page=100&page=${page}`);
    messages.push(
      ...batch
        .filter((entry) => entry.commit.author?.email === AGENT_EMAIL && entry.parents.length === 1)
        .map((entry) => entry.commit.message),
    );
    if (batch.length < 100) break;
  }
  return messages;
}

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const item = event.pull_request ?? event.issue;
  const repo = event.repository.full_name;
  const labels = item.labels.map((label) => label.name);
  const fork = (event.pull_request?.head.repo?.full_name ?? repo) !== repo;
  const result = plan({
    body: item.body,
    commits: event.pull_request ? await agentCommits(repo, item.number) : [],
    labels,
    existing: await repoLabels(repo),
    external: !isInternal(
      item.author_association,
      INTERNAL.has(item.author_association) ? 'none' : await permission(repo, item.user.login),
    ),
  });
  if (result.add.length)
    await github(`/repos/${repo}/issues/${item.number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: result.add }),
    }).catch((error) => {
      if (!fork) throw error;
      result.warnings.push(
        `a fork's token cannot label; a maintainer adds ${result.add.join(', ')} (${error.message})`,
      );
      result.add = [];
    });
  for (const warning of result.warnings) console.log(`::warning::${warning}`);
  for (const error of result.errors) console.log(`::error::${error}`);
  console.log(
    `provenance: ${result.add.length ? `added ${result.add.join(', ')}` : 'no labels added'}`,
  );
  return result.errors.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    process.exitCode = await main();
  } catch (error) {
    console.error(`provenance: ${error.message}`);
    process.exitCode = 1;
  }
}
