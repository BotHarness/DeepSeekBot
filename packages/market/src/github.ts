export const BOT_TOPIC = 'botharness-bot';

export interface RepositoryLocator {
  owner: string;
  name: string;
}

export interface GitHubRepository {
  nodeId: string;
  owner: string;
  name: string;
  htmlUrl: string;
  cloneUrl: string;
  description: string | null;
  topics: string[];
  stars: number;
  pushedAt: string;
  defaultBranch: string;
  private: boolean;
  archived: boolean;
}

export interface GitHubCommit {
  sha: string;
  committedAt: string;
}

export type GitHubLookup<T> =
  | { ok: true; value: T }
  | { ok: false; reason: 'not-found' | 'unavailable' };

export interface RepositoryNode extends GitHubRepository {
  head: GitHubCommit | null;
}

export interface TopicSearchPage {
  totalCount: number;
  repositories: GitHubRepository[];
}

export interface CreatedRange {
  from: string;
  to: string;
}

export const SEARCH_PAGE_SIZE = 100;

export interface GitHubClient {
  repository(locator: RepositoryLocator): Promise<GitHubLookup<GitHubRepository>>;
  headCommit(locator: RepositoryLocator, ref: string): Promise<GitHubLookup<GitHubCommit>>;
  searchTopic(range: CreatedRange, page: number): Promise<GitHubLookup<TopicSearchPage>>;
  nodes(ids: readonly string[]): Promise<GitHubLookup<(RepositoryNode | null)[]>>;
  readme(locator: RepositoryLocator): Promise<GitHubLookup<string | null>>;
  file(locator: RepositoryLocator, path: string): Promise<GitHubLookup<string | null>>;
  rootFiles(locator: RepositoryLocator): Promise<GitHubLookup<string[]>>;
}

const repositoryUrl =
  /^https:\/\/github\.com\/([A-Za-z0-9-]{1,39})\/([A-Za-z0-9._-]{1,100}?)(?:\.git)?\/?$/u;

export function parseRepositoryUrl(input: string): RepositoryLocator | undefined {
  const match = repositoryUrl.exec(input.trim());
  if (match === null) return undefined;
  const [, owner, name] = match;
  if (owner === undefined || name === undefined || name === '.' || name === '..') return undefined;
  return { owner, name };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function parseRepository(value: unknown): GitHubRepository | undefined {
  const source = record(value);
  const owner = text(record(source?.['owner'])?.['login']);
  const nodeId = text(source?.['node_id']);
  const name = text(source?.['name']);
  const htmlUrl = text(source?.['html_url']);
  const cloneUrl = text(source?.['clone_url']);
  const pushedAt = text(source?.['pushed_at']);
  const defaultBranch = text(source?.['default_branch']);
  if (
    source === undefined ||
    owner === undefined ||
    nodeId === undefined ||
    name === undefined ||
    htmlUrl === undefined ||
    cloneUrl === undefined ||
    pushedAt === undefined ||
    defaultBranch === undefined
  ) {
    return undefined;
  }
  const topics = Array.isArray(source['topics'])
    ? source['topics'].filter((topic): topic is string => typeof topic === 'string')
    : [];
  const stars = source['stargazers_count'];
  return {
    nodeId,
    owner,
    name,
    htmlUrl,
    cloneUrl,
    description: text(source['description']) ?? null,
    topics,
    stars: typeof stars === 'number' && Number.isFinite(stars) ? stars : 0,
    pushedAt,
    defaultBranch,
    private: source['private'] === true,
    archived: source['archived'] === true,
  };
}

function parseRootFiles(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map(record)
    .filter((item) => item?.['type'] === 'file')
    .map((item) => text(item?.['name']))
    .filter((name): name is string => name !== undefined);
}

function parseCommit(value: unknown): GitHubCommit | undefined {
  const source = record(value);
  const sha = text(source?.['sha']);
  const commit = record(source?.['commit']);
  const committedAt =
    text(record(commit?.['committer'])?.['date']) ?? text(record(commit?.['author'])?.['date']);
  if (sha === undefined || committedAt === undefined) return undefined;
  return { sha, committedAt };
}

function parseSearchPage(value: unknown): TopicSearchPage | undefined {
  const source = record(value);
  const totalCount = source?.['total_count'];
  const items = source?.['items'];
  if (typeof totalCount !== 'number' || !Array.isArray(items)) return undefined;
  const repositories = items.map(parseRepository);
  if (!repositories.every((item): item is GitHubRepository => item !== undefined)) return undefined;
  return { totalCount, repositories };
}

const NODES_QUERY = `query($ids: [ID!]!) {
  nodes(ids: $ids) {
    ... on Repository {
      id
      name
      owner { login }
      url
      description
      stargazerCount
      pushedAt
      isPrivate
      isArchived
      repositoryTopics(first: 20) { nodes { topic { name } } }
      defaultBranchRef { name target { ... on Commit { oid committedDate } } }
    }
  }
}`;

function parseNode(value: unknown): RepositoryNode | null | undefined {
  if (value === null) return null;
  const source = record(value);
  const nodeId = text(source?.['id']);
  const name = text(source?.['name']);
  const owner = text(record(source?.['owner'])?.['login']);
  const url = text(source?.['url']);
  const pushedAt = text(source?.['pushedAt']);
  if (
    source === undefined ||
    nodeId === undefined ||
    name === undefined ||
    owner === undefined ||
    url === undefined ||
    pushedAt === undefined
  ) {
    return Object.keys(source ?? {}).length === 0 ? null : undefined;
  }
  const topicNodes = record(source['repositoryTopics'])?.['nodes'];
  const topics = Array.isArray(topicNodes)
    ? topicNodes
        .map((node) => text(record(record(node)?.['topic'])?.['name']))
        .filter((topic): topic is string => topic !== undefined)
    : [];
  const branch = record(source['defaultBranchRef']);
  const target = record(branch?.['target']);
  const sha = text(target?.['oid']);
  const committedAt = text(target?.['committedDate']);
  const stars = source['stargazerCount'];
  return {
    nodeId,
    owner,
    name,
    htmlUrl: url,
    cloneUrl: `${url}.git`,
    description: text(source['description']) ?? null,
    topics,
    stars: typeof stars === 'number' && Number.isFinite(stars) ? stars : 0,
    pushedAt,
    defaultBranch: text(branch?.['name']) ?? 'main',
    private: source['isPrivate'] === true,
    archived: source['isArchived'] === true,
    head: sha !== undefined && committedAt !== undefined ? { sha, committedAt } : null,
  };
}

function parseNodes(value: unknown): (RepositoryNode | null)[] | undefined {
  const nodes = record(record(value)?.['data'])?.['nodes'];
  if (!Array.isArray(nodes)) return undefined;
  const parsed = nodes.map(parseNode);
  return parsed.every((node): node is RepositoryNode | null => node !== undefined)
    ? parsed
    : undefined;
}

export function createGitHubClient(options: {
  token?: string | undefined;
  fetchImpl?: typeof fetch;
  apiBase?: string;
}): GitHubClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const apiBase = options.apiBase ?? 'https://api.github.com';
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
    'user-agent': 'botharness-market',
    'x-github-api-version': '2022-11-28',
  };
  if (options.token !== undefined && options.token.length > 0) {
    headers['authorization'] = `Bearer ${options.token}`;
  }

  const get = async <T>(
    path: string,
    parse: (value: unknown) => T | undefined,
    init: RequestInit = { headers },
  ): Promise<GitHubLookup<T>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, init);
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    if (response.status === 404) return { ok: false, reason: 'not-found' };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    const value = parse(body);
    return value === undefined ? { ok: false, reason: 'unavailable' } : { ok: true, value };
  };

  const repoPath = (locator: RepositoryLocator): string =>
    `/repos/${encodeURIComponent(locator.owner)}/${encodeURIComponent(locator.name)}`;

  const raw = async (path: string): Promise<GitHubLookup<string | null>> => {
    let response: Response;
    try {
      response = await fetchImpl(`${apiBase}${path}`, {
        headers: { ...headers, accept: 'application/vnd.github.raw+json' },
      });
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
    if (response.status === 404) return { ok: true, value: null };
    if (!response.ok) return { ok: false, reason: 'unavailable' };
    try {
      return { ok: true, value: await response.text() };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  };
  return {
    repository: (locator) => get(repoPath(locator), parseRepository),
    headCommit: (locator, ref) =>
      get(`${repoPath(locator)}/commits/${encodeURIComponent(ref)}`, parseCommit),
    searchTopic: (range, page) => {
      const query = `topic:${BOT_TOPIC} created:${range.from}..${range.to}`;
      return get(
        `/search/repositories?q=${encodeURIComponent(query)}&sort=updated&order=desc&per_page=${SEARCH_PAGE_SIZE}&page=${page}`,
        parseSearchPage,
      );
    },
    nodes: async (ids) => {
      if (!('authorization' in headers)) return { ok: false, reason: 'unavailable' };
      return get('/graphql', parseNodes, {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ query: NODES_QUERY, variables: { ids } }),
      });
    },
    readme: (locator) => raw(`${repoPath(locator)}/readme`),
    rootFiles: async (locator) => {
      const listing = await get(`${repoPath(locator)}/contents/`, parseRootFiles);
      return !listing.ok && listing.reason === 'not-found' ? { ok: true, value: [] } : listing;
    },
    file: (locator, path) =>
      raw(`${repoPath(locator)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`),
  };
}
