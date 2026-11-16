import {
  activeSkillQuery,
  liveSkills,
  rebaseSkills,
  selectSkill,
  type SelectedSkill,
  type SkillQuery,
} from '../../../../../packages/client/src/client/skill-refs';
import {
  rankSkillEntries,
  type SkillCatalogEntry,
} from '../../../../../packages/core/src/skills/entries';
import type { RosterBot } from '../../host/client';
import type { WireSkillInvocation } from '../../host/wire';

export { activeSkillQuery, rebaseSkills, selectSkill, type SelectedSkill, type SkillQuery };

export type SkillOption = SkillCatalogEntry & { bot?: RosterBot };

const MAX_OPTIONS = 8;

export function skillOptions(
  catalog: readonly SkillCatalogEntry[],
  bots: readonly RosterBot[],
): SkillOption[] {
  return catalog.map((entry) => {
    const owner = entry.owner;
    const bot =
      owner.kind === 'bot' ? bots.find((candidate) => candidate.slug === owner.botSlug) : undefined;
    return bot === undefined ? entry : { ...entry, bot };
  });
}

export function skillMatches(
  options: readonly SkillOption[],
  query: SkillQuery | undefined,
): SkillOption[] {
  if (query === undefined) return [];
  return rankSkillEntries(options, query.query, (option) =>
    option.owner.kind === 'host'
      ? []
      : option.owner.kind === 'workspace'
        ? [option.owner.name]
        : [option.bot?.displayName ?? option.owner.botSlug, option.owner.botSlug],
  ).slice(0, MAX_OPTIONS);
}

export function deleteSkillBackward(
  before: string,
  after: string,
  skills: readonly SelectedSkill[],
): { value: string; caret: number; skills: SelectedSkill[] } | undefined {
  if (after.length !== before.length - 1) return undefined;
  let index = 0;
  while (index < after.length && before[index] === after[index]) index += 1;
  if (before.slice(index + 1) !== after.slice(index)) return undefined;
  const token = skills.find((item) => index >= item.start && index < item.end);
  if (token === undefined || index === token.start) return undefined;
  const value = before.slice(0, token.start) + before.slice(token.end);
  return {
    value,
    caret: token.start,
    skills: rebaseSkills(
      before,
      value,
      skills.filter((item) => item !== token),
    ),
  };
}

export function submittedSkills(
  draft: string,
  skills: readonly SelectedSkill[],
): WireSkillInvocation[] {
  const body = draft.trim();
  const leftTrim = draft.length - draft.trimStart().length;
  return liveSkills(draft, skills).flatMap((item) => {
    const start = item.start - leftTrim;
    const end = item.end - leftTrim;
    return start >= 0 && body.slice(start, end) === '/' + item.name
      ? [{ name: item.name, owner: item.owner, start, end }]
      : [];
  });
}

export function messageSkillRuns<T extends { start: number; end: number }>(
  body: string,
  tokens: readonly T[],
): { text: string; token?: T }[] {
  const runs: { text: string; token?: T }[] = [];
  let cursor = 0;
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    if (token.start < cursor || token.end <= token.start || token.end > body.length) continue;
    if (token.start > cursor) runs.push({ text: body.slice(cursor, token.start) });
    runs.push({ text: body.slice(token.start, token.end), token });
    cursor = token.end;
  }
  if (cursor < body.length) runs.push({ text: body.slice(cursor) });
  return runs;
}
