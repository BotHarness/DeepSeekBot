import {
  skillOwnerKey,
  type SkillCatalogEntry,
  type SkillOwner,
} from '../../../core/src/skills/entries.js';

export interface SelectedSkill {
  name: string;
  owner: SkillOwner;
  start: number;
  end: number;
}

export interface SkillQuery {
  start: number;
  end: number;
  query: string;
}

export function sameSkillOwner(left: SkillOwner, right: SkillOwner): boolean {
  return skillOwnerKey(left) === skillOwnerKey(right);
}

export function activeSkillQuery(
  value: string,
  caret: number,
  skills: readonly SelectedSkill[],
): SkillQuery | undefined {
  const match = /(^|\s)\/([a-z0-9-]{0,64})$/u.exec(value.slice(0, caret));
  if (match === null) return undefined;
  const start = caret - match[2]!.length - 1;
  if (skills.some((item) => item.start === start)) return undefined;
  return { start, end: caret, query: match[2]! };
}

export function rebaseSkills(
  before: string,
  after: string,
  skills: readonly SelectedSkill[],
): SelectedSkill[] {
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix])
    prefix += 1;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix += 1;
  const oldEnd = before.length - suffix;
  const delta = after.length - before.length;
  return skills
    .flatMap((item) => {
      if (item.end <= prefix) return [item];
      if (item.start >= oldEnd)
        return [{ ...item, start: item.start + delta, end: item.end + delta }];
      return [];
    })
    .filter((item) => after.slice(item.start, item.end) === '/' + item.name);
}

export function selectSkill(
  value: string,
  skills: readonly SelectedSkill[],
  query: SkillQuery,
  option: Pick<SkillCatalogEntry, 'name' | 'owner'>,
): { value: string; skills: SelectedSkill[]; caret: number } {
  const token = '/' + option.name;
  const trailing = value[query.end] === ' ' ? '' : ' ';
  const next = value.slice(0, query.start) + token + trailing + value.slice(query.end);
  const selected: SelectedSkill = {
    name: option.name,
    owner: option.owner,
    start: query.start,
    end: query.start + token.length,
  };
  return {
    value: next,
    skills: [...rebaseSkills(value, next, skills), selected].sort((a, b) => a.start - b.start),
    caret: selected.end + trailing.length,
  };
}

export function liveSkills(value: string, skills: readonly SelectedSkill[]): SelectedSkill[] {
  return skills.filter((item) => value.slice(item.start, item.end) === '/' + item.name);
}
