export const MARKETPLACE_SKILL_ID = /^[0-9a-f]{24}$/u;
export const MAX_MARKETPLACE_SKILL_QUERY = 100;

export type MarketplaceSkillFindingKind =
  | 'secret'
  | 'prompt-injection'
  | 'exfiltration'
  | 'download-exec';

export interface MarketplaceSkillFinding {
  kind: MarketplaceSkillFindingKind;
  path: string;
  line: number;
  severity: 'warning' | 'malicious';
}

export const MARKETPLACE_SKILL_REVISION = /^[0-9a-f]{32}$/u;

export interface MarketplaceSkillUpload {
  author: { id: string; name: string };
  revision: string;
}

export interface MarketplaceSkillUploadInput {
  requestKey?: string;
  expectedAuthorId?: string;
  files: { path: string; data: string }[];
}

export interface MarketplaceSkillPublication {
  bot: string;
  name: string;
  expectedAuthorId?: string;
  requestKey?: string;
}

export type MarketplaceSkillReplacement = Omit<MarketplaceSkillPublication, 'requestKey'> & {
  id: string;
};

export interface MarketplaceSkill {
  upload?: MarketplaceSkillUpload;
  id: string;
  name: string;
  description: string;
  owner: string;
  repo: string;
  fullName: string;
  path: string;
  htmlUrl: string;
  commitSha: string;
  stars: number;
  installs: number;
  scripts: string[];
  scan: 'clean' | 'warning';
  findings: MarketplaceSkillFinding[];
  fileCount: number;
  size: number;
  official: boolean;
  pushedAt: string;
}

export interface MarketplaceSkillFile {
  path: string;
  size: number;
}

export interface MarketplaceSkillDetail {
  skill: MarketplaceSkill;
  content: string;
  files: MarketplaceSkillFile[];
}

export interface MarketplaceSkillPage {
  skills: MarketplaceSkill[];
  nextCursor: string | null;
}

export interface MarketplaceSkillTargets {
  bots: string[];
  global: boolean;
}

export interface MarketplaceSkillAddCandidate {
  slug: string;
  displayName: string;
  avatar?: string;
  avatarSeed?: 2;
}

export interface MarketplaceSkillAddCandidates {
  bots: MarketplaceSkillAddCandidate[];
  global: boolean;
}

export interface MarketplaceSkillReview {
  reviewId: string;
  skill: MarketplaceSkill;
  verdict: 'clean' | 'warning' | 'blocked';
  findings: MarketplaceSkillFinding[];
  scripts: string[];
  files: MarketplaceSkillFile[];
  hash: string;
  conflicts: MarketplaceSkillTargets;
}

export type MarketplaceSkillConflictChoice = 'replace' | 'rename';

export interface MarketplaceSkillAddResult {
  name: string;
  added: { target: 'global' | string; name: string; path: string }[];
}

export interface MarketplaceSkillAdded {
  id: string;
  name: string;
  description: string;
  target: 'global' | string;
  hash: string;
}

export interface MarketplaceSkillAddedList {
  skills: MarketplaceSkillAdded[];
}

const record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

const strings = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

function parseFinding(value: unknown): MarketplaceSkillFinding | undefined {
  const source = record(value);
  const kind = source?.['kind'];
  const severity = source?.['severity'];
  if (
    (kind !== 'secret' &&
      kind !== 'prompt-injection' &&
      kind !== 'exfiltration' &&
      kind !== 'download-exec') ||
    (severity !== 'warning' && severity !== 'malicious') ||
    typeof source?.['path'] !== 'string' ||
    typeof source['line'] !== 'number'
  )
    return undefined;
  return { kind, path: source['path'], line: source['line'], severity };
}

export function parseMarketplaceSkill(value: unknown): MarketplaceSkill | undefined {
  const source = record(value);
  if (source === undefined) return undefined;
  const text = (key: string) => (typeof source[key] === 'string' ? source[key] : undefined);
  const count = (key: string) => (typeof source[key] === 'number' ? source[key] : undefined);
  const uploadValue = source['upload'];
  const uploaded = record(uploadValue);
  const author = record(uploaded?.['author']);
  const revision = uploaded?.['revision'];
  const upload =
    typeof author?.['id'] === 'string' &&
    typeof author['name'] === 'string' &&
    typeof revision === 'string' &&
    MARKETPLACE_SKILL_REVISION.test(revision)
      ? { author: { id: author['id'], name: author['name'] }, revision }
      : undefined;
  const id = text('id');
  const name = text('name');
  const description = text('description');
  const owner = text('owner');
  const repo = text('repo');
  const fullName = text('fullName');
  const path = text('path');
  const htmlUrl = text('htmlUrl');
  const commitSha = text('commitSha');
  const pushedAt = text('pushedAt');
  const stars = count('stars');
  const installs = count('installs');
  const fileCount = count('fileCount');
  const size = count('size');
  const scripts = strings(source['scripts']);
  const scan = source['scan'];
  const findings = Array.isArray(source['findings'])
    ? source['findings'].map(parseFinding)
    : undefined;
  if (
    id === undefined ||
    !MARKETPLACE_SKILL_ID.test(id) ||
    name === undefined ||
    description === undefined ||
    owner === undefined ||
    repo === undefined ||
    fullName === undefined ||
    path === undefined ||
    htmlUrl === undefined ||
    (upload === undefined ? !htmlUrl.startsWith('https://github.com/') : htmlUrl !== '') ||
    (uploadValue !== undefined && upload === undefined) ||
    commitSha === undefined ||
    (upload === undefined ? !/^[0-9a-f]{40}$/u.test(commitSha) : commitSha !== '') ||
    pushedAt === undefined ||
    stars === undefined ||
    installs === undefined ||
    fileCount === undefined ||
    size === undefined ||
    scripts === undefined ||
    (scan !== 'clean' && scan !== 'warning') ||
    findings === undefined ||
    !findings.every((finding) => finding !== undefined)
  )
    return undefined;
  return {
    ...(upload === undefined ? {} : { upload }),
    id,
    name,
    description,
    owner,
    repo,
    fullName,
    path,
    htmlUrl,
    commitSha,
    stars,
    installs,
    scripts,
    scan,
    findings,
    fileCount,
    size,
    official: source['official'] === true,
    pushedAt,
  };
}

export function parseMarketplaceSkillPage(value: unknown): MarketplaceSkillPage | undefined {
  const source = record(value);
  const skills = Array.isArray(source?.['skills'])
    ? source['skills'].map(parseMarketplaceSkill)
    : undefined;
  const nextCursor = source?.['nextCursor'];
  if (
    skills === undefined ||
    !skills.every((skill) => skill !== undefined) ||
    (nextCursor !== null && typeof nextCursor !== 'string')
  )
    return undefined;
  return { skills, nextCursor };
}

export function parseMarketplaceSkillDetail(value: unknown): MarketplaceSkillDetail | undefined {
  const source = record(value);
  const skill = parseMarketplaceSkill(source?.['skill']);
  const content = source?.['content'];
  const files = Array.isArray(source?.['files'])
    ? source['files'].map((item) => {
        const file = record(item);
        return typeof file?.['path'] === 'string' && typeof file['size'] === 'number'
          ? { path: file['path'], size: file['size'] }
          : undefined;
      })
    : undefined;
  if (
    skill === undefined ||
    typeof content !== 'string' ||
    files === undefined ||
    !files.every((file) => file !== undefined)
  )
    return undefined;
  return { skill, content, files };
}
