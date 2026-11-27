import { loadSkillCatalog } from '@botharness/host-client/skill-catalog';
import type { PersonaBotSummary } from '../bridge/methods.js';
import { dmChannelId, type ChannelSkillInvocationToken } from '../channels/channel.js';
import { parseSkillOwnerKey, rankSkillEntries, type SkillCatalogEntry } from '../skills/entries.js';
import { CliLiveError } from './cli-live-error.js';

type Rpc = (method: string, payload: Record<string, unknown>) => Promise<unknown>;

export { SKILL_OPTIONS } from '../kernel/cli-option-spec.js';

export interface SkillValues {
  bot?: string;
  channel?: string;
  session?: string;
  query?: string;
  owner?: string;
  confirm?: boolean;
  global?: boolean;
  cursor?: string;
  'on-conflict'?: string;
  review?: string;
}

export const SKILL_COMMANDS = [
  {
    command: 'skills-publish',
    description:
      'publish a Project Skill from a Bot to the Marketplace: skills publish <name> --bot <slug>',
  },
  {
    command: 'skills-replace',
    description:
      'replace a Marketplace Skill with files from a Bot: skills replace <id> <name> --bot <slug> --confirm',
  },
  {
    command: 'skills-delete',
    description: 'delete a Marketplace Skill: skills delete <id> --confirm',
  },
  {
    command: 'skills-mine',
    description: 'list the Skills published by the signed-in Marketplace author',
  },
  {
    command: 'skills-list',
    description:
      "list the Skills the / menu offers in a conversation (--bot <slug> for its DM, or --channel <id>): Host Skills plus each PersonaBot Memory Repository and Workspace Grant Project Skill, ranked by --query like the menu; with --bot and --session <id>, the Skills that Session's own composer offers: Host, that Bot's Memory and the Session's Workspace, one per name",
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
  {
    command: 'marketplace-skill-list',
    description:
      'browse or search Marketplace Skills / 浏览或搜索市场 Skill: [--query <text>] [--cursor <n>]',
  },
  {
    command: 'marketplace-skill-detail',
    description:
      'read one Marketplace Skill with its SKILL.md, files, scripts and scan findings / 查看市场 Skill 详情: <id>',
  },
  {
    command: 'skills-add',
    description:
      "add a Marketplace Skill to Bots' Memory Repositories or globally as a Host Skill / 把市场 Skill 添加到 Bot 或全局: skills-add <id> (--bot <slug>[,<slug>...] | --global) [--on-conflict replace|rename]; without --confirm it prints the review (scripts, scan findings, name conflicts) and changes nothing",
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
  if (command === 'skills-publish') {
    if (rest.length !== 1 || !bot) usage('skills publish takes <name> --bot <slug>.');
    return (await connect())('marketplaceSkillPublish', { name: rest[0], bot });
  }
  if (command === 'skills-replace') {
    if (rest.length !== 2 || !bot || values.confirm !== true)
      usage('skills replace takes <id> <name> --bot <slug> --confirm.');
    return (await connect())('marketplaceSkillReplace', { id: rest[0], name: rest[1], bot });
  }
  if (command === 'skills-delete') {
    if (rest.length !== 1 || values.confirm !== true) usage('skills delete takes <id> --confirm.');
    return (await connect())('marketplaceSkillDelete', { id: rest[0] });
  }
  if (command === 'skills-mine') {
    if (rest.length !== 0) usage('skills mine takes no positional arguments.');
    return (await connect())('marketplaceSkillMine', {});
  }
  if (command === 'marketplace-skill-list') {
    if (rest.length !== 0) usage('marketplace-skill-list takes --query and --cursor only.');
    return (await connect())('marketplaceSkillList', {
      ...(values.query === undefined ? {} : { q: values.query }),
      ...(values.cursor === undefined ? {} : { cursor: values.cursor }),
    });
  }
  if (command === 'marketplace-skill-detail') {
    if (rest.length !== 1) usage('marketplace-skill-detail takes <id>.');
    return (await connect())('marketplaceSkillDetail', { id: rest[0] });
  }
  if (command === 'skills-add') return addSkill(rest, values, connect);
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
  const session = values.session?.trim();
  if (session) {
    if (!bot || values.channel?.trim())
      usage('skills-list --session <id> takes --bot <slug> and no --channel.');
    const result = (await (
      await connect()
    )('sessionSkillCatalog', {
      slug: bot,
      sessionId: session,
    })) as { skills: SkillCatalogEntry[] };
    return {
      sessionId: session,
      skills: rankSkillEntries(result.skills, values.query ?? '', (entry) =>
        entry.owner.kind === 'workspace' ? [entry.owner.name, entry.owner.workspaceId] : [],
      ),
    };
  }
  const channel = values.channel?.trim();
  if ((bot ? 1 : 0) + (channel ? 1 : 0) !== 1)
    usage('skills-list requires exactly one of --bot or --channel.');
  const rpc = await connect();
  const channelId = channel || dmChannelId(bot!);
  const skills = await loadSkillCatalog(
    { call: (method, args = {}) => rpc(method, args) },
    channelId,
  );
  const bots = values.query?.trim()
    ? ((await rpc('list', {})) as { bots: PersonaBotSummary[] }).bots
    : [];
  const names = new Map(bots.map((bot) => [bot.slug, [bot.displayName, bot.slug]]));
  return {
    channelId,
    skills: rankSkillEntries(skills, values.query ?? '', (entry) =>
      entry.owner.kind === 'host'
        ? []
        : entry.owner.kind === 'workspace'
          ? [entry.owner.name, entry.owner.workspaceId]
          : (names.get(entry.owner.botSlug) ?? [entry.owner.botSlug]),
    ),
  };
}

async function addSkill(
  rest: string[],
  values: SkillValues,
  connect: () => Promise<Rpc>,
): Promise<unknown> {
  const bots = (values.bot ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => slug.length > 0);
  const onConflict = values['on-conflict'];
  if (rest.length !== 1 || (bots.length === 0 && values.global !== true))
    usage('skills-add takes <id> and --bot <slug>[,<slug>...] or --global.');
  if (onConflict !== undefined && onConflict !== 'replace' && onConflict !== 'rename')
    usage('--on-conflict takes replace or rename.');
  if (values.confirm === true && values.review === undefined)
    usage('skills-add --confirm takes --review <review-id> from the preview the Human saw.');
  const rpc = await connect();
  if (values.confirm !== true) {
    const review = await rpc('marketplaceSkillReview', { id: rest[0] });
    const candidates = await rpc('marketplaceSkillAddCandidates', {});
    return {
      review,
      candidates,
      next: 'Show the scripts and findings to the Human, then repeat with --review <reviewId> --confirm to add exactly this review.',
    };
  }
  return rpc('marketplaceSkillAdd', {
    id: rest[0],
    reviewId: values.review,
    ...(bots.length === 0 ? {} : { bots }),
    ...(values.global === true ? { global: true } : {}),
    ...(onConflict === undefined ? {} : { onConflict }),
  });
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
