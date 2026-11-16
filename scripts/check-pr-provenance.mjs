#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const AGENT_MARK =
  /Agent-Task:|Generated with \[|Co-Authored-By:[^\n]*(?:Claude|Codex|Cursor|Copilot|Gemini|opencode|DeepSeek|Kimi|Qwen|GLM)/iu;
const SOURCE = 'https://github.com/BotHarness/DeepSeekBot/issues/4296#issuecomment-6915452893';
const KINDS = ['harness', 'model'];
const INTERNAL = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']);
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
    const line = new RegExp(`^[ \\t]*[-*]?[ \\t]*${kind}s?[ \\t]*[:：][ \\t]*(.*)$`, 'imu').exec(
      body ?? '',
    );
    if (!line) continue;
    result[kind] = [
      ...new Set(
        line[1]
          .split(/[,，、/]/u)
          .map(slug)
          .filter((value) => /^[a-z0-9][a-z0-9.-]{0,39}$/u.test(value)),
      ),
    ].slice(0, 5);
  }
  return result;
}

export function plan({ body, labels, existing, external }) {
  const named = declared(body);
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

async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const item = event.pull_request ?? event.issue;
  const repo = event.repository.full_name;
  const labels = item.labels.map((label) => label.name);
  const result = plan({
    body: item.body,
    labels,
    existing: await repoLabels(repo),
    external: !INTERNAL.has(item.author_association),
  });
  if (result.add.length)
    await github(`/repos/${repo}/issues/${item.number}/labels`, {
      method: 'POST',
      body: JSON.stringify({ labels: result.add }),
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
