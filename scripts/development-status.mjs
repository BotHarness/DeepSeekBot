#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ARTIFACTS = new Map([
  ['DeepSeekBot', 'deepseekbot'],
  ['DSH Skill', 'dsh-skill'],
]);
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUTPUT = resolve(ROOT, 'apps/docs/src/data/development-status.json');
const PROJECT_QUERY = `
  query DevelopmentStatus($owner: String!, $number: Int!, $cursor: String) {
    organization(login: $owner) {
      projectV2(number: $number) {
        fields(first: 50) {
          pageInfo { hasNextPage }
          nodes {
            __typename
            ... on ProjectV2SingleSelectField {
              name
              options { name }
            }
          }
        }
        items(first: 100, after: $cursor) {
          pageInfo { hasNextPage endCursor }
          nodes {
            fieldValues(first: 20) {
              pageInfo { hasNextPage }
              nodes {
                __typename
                ... on ProjectV2ItemFieldSingleSelectValue {
                  name
                  field {
                    ... on ProjectV2SingleSelectField { name }
                  }
                }
              }
            }
            content {
              __typename
              ... on Issue {
                title
                url
                updatedAt
                milestone { title }
                repository { visibility }
              }
              ... on PullRequest {
                title
                url
                updatedAt
                milestone { title }
                repository { visibility }
              }
            }
          }
        }
      }
    }
  }
`;

class ProjectSchemaError extends Error {}

function failSchema(message) {
  throw new ProjectSchemaError(`Development status Project schema mismatch: ${message}`);
}

function assertProjectFields(fields) {
  if (!Array.isArray(fields)) failSchema('fields must be an array');

  const statuses = fields.filter((field) => field?.name === 'Status');
  const artifacts = fields.filter((field) => field?.name === 'Artifact');
  if (statuses.length !== 1) failSchema('Status must exist exactly once');
  if (artifacts.length !== 1) failSchema('Artifact must exist exactly once');
  const status = statuses[0];
  const artifact = artifacts[0];
  if (status?.type !== 'ProjectV2SingleSelectField') {
    failSchema('Status must be a single-select field');
  }
  if (artifact?.type !== 'ProjectV2SingleSelectField') {
    failSchema('Artifact must be a single-select field');
  }
  if (!status.options?.includes('In Progress')) {
    failSchema('Status must define the In Progress option');
  }
  for (const option of ARTIFACTS.keys()) {
    if (!artifact.options?.includes(option)) {
      failSchema(`Artifact must define the ${option} option`);
    }
  }
  if (
    artifact.options.length !== ARTIFACTS.size ||
    artifact.options.some((option) => !ARTIFACTS.has(option))
  ) {
    failSchema('Artifact options must be exactly DeepSeekBot and DSH Skill');
  }
}

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isIsoTimestamp(value) {
  return (
    typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

export function projectDevelopmentStatus(snapshot, syncedAt) {
  if (!snapshot || typeof snapshot !== 'object') failSchema('snapshot must be an object');
  assertProjectFields(snapshot.fields);
  if (!Array.isArray(snapshot.items)) failSchema('items must be an array');
  if (!isIsoTimestamp(syncedAt)) failSchema('syncedAt must be an ISO timestamp');

  const items = snapshot.items.flatMap((item) => {
    if (item?.status !== 'In Progress') return [];
    const content = item.content;
    if (
      !content ||
      (content.type !== 'Issue' && content.type !== 'PullRequest') ||
      content.repositoryVisibility !== 'PUBLIC'
    ) {
      return [];
    }
    if (item.artifact === null || item.artifact === undefined) return [];
    const artifact = ARTIFACTS.get(item.artifact);
    if (!artifact) failSchema('selected item has an unsupported Artifact value');
    if (typeof content.title !== 'string' || content.title.length === 0) {
      failSchema('selected item title must be a non-empty string');
    }
    if (
      typeof content.url !== 'string' ||
      !/^https:\/\/github\.com\/[^/]+\/[^/]+\/(?:issues|pull)\/\d+$/.test(content.url)
    ) {
      failSchema('selected item URL must be a public GitHub Issue or Pull Request URL');
    }
    if (content.milestone !== null && typeof content.milestone !== 'string') {
      failSchema('selected item milestone must be a string or null');
    }
    if (!isIsoTimestamp(content.updatedAt)) {
      failSchema('selected item updatedAt must be an ISO timestamp');
    }

    return [
      {
        artifact,
        title: content.title,
        url: content.url,
        milestone: content.milestone,
        updatedAt: content.updatedAt,
      },
    ];
  });
  items.sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      compareText(left.url, right.url) ||
      compareText(left.title, right.title),
  );

  return {
    schemaVersion: 1,
    syncedAt,
    items,
  };
}

const AUTHORITY_ERROR =
  'Development status sync could not read Roadmap Project #1. Authenticate GitHub CLI with the read:project scope and retry.';

function queryRoadmapProjectPage({ cursor }) {
  const args = [
    'api',
    'graphql',
    '-f',
    `query=${PROJECT_QUERY}`,
    '-f',
    'owner=BotHarness',
    '-F',
    'number=1',
  ];
  if (cursor) args.push('-f', `cursor=${cursor}`);
  const result = spawnSync('gh', args, {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  if (result.error || result.status !== 0) {
    const detail = result.stderr ?? '';
    if (
      /doesn't exist on type|unknown argument|expected type|parse error|variable \$/i.test(detail)
    ) {
      failSchema('GitHub GraphQL query no longer matches the Project API schema');
    }
    throw new Error(AUTHORITY_ERROR);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    failSchema('GitHub returned invalid JSON');
  }
}

function normalizeProjectPage(response) {
  if (response?.errors !== undefined && !Array.isArray(response.errors)) {
    failSchema('GitHub GraphQL errors must be an array');
  }
  if (response?.errors?.length > 0) {
    const authorityFailure = response.errors.every((error) => {
      const code = String(
        error?.extensions?.code ?? error?.extensions?.type ?? error?.type ?? '',
      ).toUpperCase();
      const message = typeof error?.message === 'string' ? error.message : '';
      return (
        ['FORBIDDEN', 'UNAUTHENTICATED', 'INSUFFICIENT_SCOPES'].includes(code) ||
        /^(resource not accessible|not authorized|requires authentication|insufficient scope|forbidden|unauthenticated)(\b|:)/i.test(
          message.trim(),
        )
      );
    });
    if (authorityFailure) throw new Error(AUTHORITY_ERROR);
    failSchema('GitHub GraphQL response contains errors');
  }

  const project = response?.data?.organization?.projectV2;
  if (!project) failSchema('GitHub response is missing organization.projectV2');
  if (project.fields?.pageInfo?.hasNextPage === true) {
    failSchema('GitHub response truncated the Project field schema');
  }
  if (project.fields?.pageInfo?.hasNextPage !== false) {
    failSchema('GitHub response is missing Project field pagination');
  }
  if (!Array.isArray(project.fields?.nodes))
    failSchema('GitHub response is missing Project fields');
  if (!Array.isArray(project.items?.nodes)) failSchema('GitHub response is missing Project items');
  if (
    typeof project.items.pageInfo?.hasNextPage !== 'boolean' ||
    (project.items.pageInfo.hasNextPage &&
      (typeof project.items.pageInfo.endCursor !== 'string' ||
        project.items.pageInfo.endCursor.trim().length === 0))
  ) {
    failSchema('GitHub response has invalid Project pagination');
  }

  const fields = project.fields.nodes.flatMap((field) => {
    if (field?.__typename !== 'ProjectV2SingleSelectField') return [];
    return [
      {
        name: field.name,
        type: field.__typename,
        options: Array.isArray(field.options)
          ? field.options.map((option) => option?.name)
          : undefined,
      },
    ];
  });
  const items = project.items.nodes.map((item) => {
    if (item?.fieldValues?.pageInfo?.hasNextPage === true) {
      failSchema("GitHub response truncated an item's Project field values");
    }
    if (item?.fieldValues?.pageInfo?.hasNextPage !== false) {
      failSchema("GitHub response is missing an item's field-value pagination");
    }
    if (!Array.isArray(item.fieldValues.nodes)) {
      failSchema("GitHub response is missing an item's Project field values");
    }
    const selections = new Map();
    for (const value of item.fieldValues.nodes) {
      if (value?.__typename !== 'ProjectV2ItemFieldSingleSelectValue') continue;
      const name = value.field?.name;
      if (name !== 'Status' && name !== 'Artifact') continue;
      if (selections.has(name)) failSchema(`GitHub response has duplicate ${name} values`);
      selections.set(name, value.name);
    }
    const content = item?.content;
    return {
      status: selections.get('Status') ?? null,
      artifact: selections.get('Artifact') ?? null,
      content: content
        ? {
            type: content.__typename,
            repositoryVisibility: content.repository?.visibility ?? null,
            title: content.title ?? null,
            url: content.url ?? null,
            milestone: content.milestone?.title ?? null,
            updatedAt: content.updatedAt ?? null,
          }
        : null,
    };
  });

  return {
    fields,
    items,
    pageInfo: project.items.pageInfo,
  };
}

export async function githubProjectDevelopmentStatus({ syncedAt, queryProjectPage }) {
  const fields = [];
  const items = [];
  const seenCursors = new Set();
  let cursor = null;
  do {
    let response;
    try {
      response = await queryProjectPage({ cursor });
    } catch (error) {
      if (error instanceof ProjectSchemaError) throw error;
      throw new Error(AUTHORITY_ERROR, { cause: error });
    }
    const page = normalizeProjectPage(response);
    if (fields.length === 0) fields.push(...page.fields);
    items.push(...page.items);
    const nextCursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
    if (nextCursor !== null) {
      if (seenCursors.has(nextCursor)) {
        failSchema('GitHub response repeated a Project pagination cursor');
      }
      seenCursors.add(nextCursor);
    }
    cursor = nextCursor;
  } while (cursor);

  return projectDevelopmentStatus({ fields, items }, syncedAt);
}

export async function syncDevelopmentStatus({
  syncedAt = new Date().toISOString(),
  queryProjectPage = queryRoadmapProjectPage,
  output = DEFAULT_OUTPUT,
} = {}) {
  const projection = await githubProjectDevelopmentStatus({ syncedAt, queryProjectPage });
  const serialized = `${JSON.stringify(projection, null, 2)}\n`;
  if (output === null) return serialized;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, serialized, 'utf8');
  return projection;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const toStdout = process.argv.includes('--stdout');
  try {
    const result = await syncDevelopmentStatus({ output: toStdout ? null : DEFAULT_OUTPUT });
    if (toStdout) process.stdout.write(result);
    else {
      process.stdout.write(
        `Wrote ${relative(ROOT, DEFAULT_OUTPUT)} (${result.items.length} public items).\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
