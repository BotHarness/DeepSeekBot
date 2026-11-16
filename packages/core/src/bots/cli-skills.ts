import type { PersonaBotSummary } from '../bridge/methods.js';
import { dmChannelId, type ChannelSkillInvocationToken } from '../channels/channel.js';
import { parseSkillOwnerKey, rankSkillEntries, type SkillCatalogEntry } from '../skills/entries.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export const SKILL_OPTIONS = {
  skill: { type: 'string', multiple: true },
  owner: { type: 'string' },
  confirm: { type: 'boolean' },
} as const;

export interface SkillValues {
  bot?: string;
  channel?: string;
  query?: string;
  owner?: string;
  confirm?: boolean;
}

export const SKILL_COMMANDS = [
  {
    command: 'skills-list',
    description:
      'list the Skills the / menu offers in a conversation (--bot <slug> for its DM, or --channel <id>): Host Skills plus each PersonaBot Memory Repository and Workspace Grant Project Skill, ranked by --query like the menu',
  },
  {
    command: 'skills-memory',
    description:
      "list a PersonaBot's own Memory Repository Skills as its profile Skills card shows them (--bot <slug>), including Skills hidden from the / menu",
  },
  {
    command: 'skills-show',
    description:
      'print one Skill in full: skills-show <name> --owner <host|bot:slug|workspace:id>, as the profile card and marketplace viewer show it',
  },
  {
    command: 'skills-remove',
    description:
      "delete one Skill from a PersonaBot's Memory Repository and commit the deletion (restorable from git history): skills-remove <name> --bot <slug> --confirm",
  },
] as const;

type Command = (typeof SKILL_COMMANDS)[number]['command'];

export function isSkillCommand(command: string): command is Command {
  return SKILL_COMMANDS.some((entry) => entry.command === command);
}

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

export async function runSkillCommand(
  command: Command,
  rest: string[],
  values: SkillValues,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const bot = values.bot?.trim();
  if (command === 'skills-memory') {
    if (rest.length !== 0 || !bot)
      usage('skills-memory takes --bot <slug> and no positional arguments.');
    return (await connect())('botSkills', { slug: bot });
  }
  if (command === 'skills-show') {
    const owner = values.owner?.trim();
    if (rest.length !== 1 || !owner || parseSkillOwnerKey(owner) === undefined)
      usage('skills-show takes <name> --owner <host|bot:slug|workspace:id>.');
    return (await connect())('skillShow', { name: rest[0], owner });
  }
  if (command === 'skills-remove') {
    if (rest.length !== 1 || !bot) usage('skills-remove takes <name> --bot <slug> --confirm.');
    if (values.confirm !== true)
      usage('skills-remove deletes the Skill from the Memory Repository; repeat with --confirm.');
    return (await connect())('botSkillRemove', { slug: bot, name: rest[0] });
  }
  if (rest.length !== 0)
    usage('skills-list takes no positional arguments; use --bot or --channel.');
  const channel = values.channel?.trim();
  if ((bot ? 1 : 0) + (channel ? 1 : 0) !== 1)
    usage('skills-list requires exactly one of --bot or --channel.');
  const rpc = await connect();
  const channelId = channel || dmChannelId(bot!);
  const result = (await rpc('channelSkillCatalog', { channelId })) as {
    skills: SkillCatalogEntry[];
  };
  const bots = values.query?.trim()
    ? ((await rpc('list', {})) as { bots: PersonaBotSummary[] }).bots
    : [];
  const names = new Map(bots.map((bot) => [bot.slug, [bot.displayName, bot.slug]]));
  return {
    channelId,
    skills: rankSkillEntries(result.skills, values.query ?? '', (entry) =>
      entry.owner.kind === 'host'
        ? []
        : entry.owner.kind === 'workspace'
          ? [entry.owner.name, entry.owner.workspaceId]
          : (names.get(entry.owner.botSlug) ?? [entry.owner.botSlug]),
    ),
  };
}

export function skillInvocationTokens(
  body: string,
  values: readonly string[] | undefined,
): ChannelSkillInvocationToken[] {
  const tokens: ChannelSkillInvocationToken[] = [];
  for (const raw of values ?? []) {
    const split = raw.lastIndexOf('/');
    const owner = split <= 0 ? undefined : parseSkillOwnerKey(raw.slice(0, split));
    const name = raw.slice(split + 1);
    if (owner === undefined || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(name))
      usage('--skill takes <owner>/<name>, where owner is host, bot:<slug> or workspace:<id>.');
    const matches = body.matchAll(new RegExp(`(^|\\s)/${name}(?=\\s|$)`, 'gu'));
    let start: number | undefined;
    for (const match of matches) {
      const offset = match.index + match[1]!.length;
      if (tokens.some((token) => token.start === offset)) continue;
      start = offset;
      break;
    }
    if (start === undefined)
      usage(`--skill ${raw} needs /${name} in the message body at an unused occurrence.`);
    tokens.push({ name, owner, start, end: start + name.length + 1 });
  }
  return tokens.sort((a, b) => a.start - b.start);
}
