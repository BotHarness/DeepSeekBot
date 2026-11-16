import { describe, expect, it } from 'vitest';

import type { RosterBot } from '../src/host/client';
import { loadSkillCatalog, skillInvocationsOf } from '../src/host/skill-catalog';
import {
  activeSkillQuery,
  deleteSkillBackward,
  messageSkillRuns,
  selectSkill,
  skillMatches,
  skillOptions,
  submittedSkills,
} from '../src/ui/chat/skill-draft';

const ada: RosterBot = {
  slug: 'ada',
  displayName: 'Ada',
  roles: [],
  computerAccess: false,
  browserAccess: false,
  state: 'idle',
  paused: false,
};

const catalog = [
  {
    name: 'release-notes',
    description: 'Group merged PRs',
    owner: { kind: 'bot' as const, botSlug: 'ada' },
  },
  {
    name: 'deploy',
    description: 'Ship it',
    owner: { kind: 'workspace' as const, workspaceId: 'w1', name: 'shop' },
  },
  { name: 'review', description: 'Review code', owner: { kind: 'host' as const } },
];

describe('mobile / Skill Invocation', () => {
  it('reads the Channel Skill catalog and drops malformed entries', async () => {
    const calls: unknown[] = [];
    const skills = await loadSkillCatalog(
      {
        call: async <T>(method: string, params?: unknown) => {
          calls.push([method, params]);
          return {
            skills: [...catalog, { name: 'Bad Name', description: '', owner: { kind: 'host' } }],
          } as T;
        },
      },
      'chan',
    );
    expect(calls).toEqual([['channelSkillCatalog', { channelId: 'chan' }]]);
    expect(skills.map((skill) => skill.name)).toEqual(['release-notes', 'deploy', 'review']);
  });

  it('ranks Skills by name and owner after / and attaches the roster Bot', () => {
    const options = skillOptions(catalog, [ada]);
    expect(options[0]?.bot?.displayName).toBe('Ada');
    expect(skillMatches(options, activeSkillQuery('please /', 8, []))).toHaveLength(3);
    expect(
      skillMatches(options, activeSkillQuery('please /dep', 11, [])).map((option) => option.name),
    ).toEqual(['deploy']);
    expect(
      skillMatches(options, activeSkillQuery('/ada', 4, [])).map((option) => option.name),
    ).toEqual(['release-notes']);
    expect(skillMatches(options, activeSkillQuery('a/b', 3, []))).toEqual([]);
  });

  it('inserts an atomic chip that one backspace removes whole', () => {
    const query = activeSkillQuery('run /rel', 8, [])!;
    const chosen = selectSkill('run /rel', [], query, catalog[0]!);
    expect(chosen.value).toBe('run /release-notes ');
    expect(chosen.skills).toEqual([
      { name: 'release-notes', owner: { kind: 'bot', botSlug: 'ada' }, start: 4, end: 18 },
    ]);
    const before = chosen.value;
    const after = before.slice(0, 17) + before.slice(18);
    const removed = deleteSkillBackward(before.slice(0, 18), after.slice(0, 17), chosen.skills);
    expect(removed).toEqual({ value: 'run ', caret: 4, skills: [] });
    expect(deleteSkillBackward('run x', 'run ', chosen.skills)).toBeUndefined();
  });

  it('sends Skill Invocations against the trimmed body without mentioning a Bot', () => {
    const skills = [
      { name: 'release-notes', owner: { kind: 'bot' as const, botSlug: 'ada' }, start: 2, end: 16 },
    ];
    expect(submittedSkills('  /release-notes for v2 ', skills)).toEqual([
      { name: 'release-notes', owner: { kind: 'bot', botSlug: 'ada' }, start: 0, end: 14 },
    ]);
    expect(submittedSkills('  /release-note for v2', skills)).toEqual([]);
  });

  it('renders stored Skill Invocations as chips and ignores ones that no longer match', () => {
    const body = 'use /deploy now';
    const tokens = skillInvocationsOf(body, [
      { name: 'deploy', owner: catalog[1]!.owner, start: 4, end: 11 },
      { name: 'review', owner: { kind: 'host' }, start: 0, end: 7 },
    ]);
    expect(tokens).toHaveLength(1);
    expect(messageSkillRuns(body, tokens).map((run) => [run.text, run.token?.name])).toEqual([
      ['use ', undefined],
      ['/deploy', 'deploy'],
      [' now', undefined],
    ]);
  });
});
