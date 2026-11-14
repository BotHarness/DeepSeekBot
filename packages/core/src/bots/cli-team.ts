import { closeSync, fchmodSync, openSync, unlinkSync, writeFileSync } from 'node:fs';
import { z } from 'zod';
import { CliLiveError } from './cli-live-error.js';
import type { BotCreateCliIo } from './bot-create-cli.js';

export const TEAM_OPTIONS = {
  as: { type: 'string' },
  permissions: { type: 'string' },
  set: { type: 'string' },
  revoke: { type: 'string' },
  'role-ids': { type: 'string' },
  username: { type: 'string' },
  'display-name': { type: 'string' },
  'initial-password-file': { type: 'string' },
  'password-stdin': { type: 'boolean' },
} as const;
export const TEAM_COMMANDS = [
  {
    command: 'roles',
    description:
      'list | catalog | create --name --permissions | update <roleId> | delete <roleId> --confirm',
  },
  {
    command: 'team-mode',
    description:
      'status | on | off | owner-password --password-stdin | insecure-http on|off --confirm | transfer-owner <username> --password-stdin --confirm',
  },
  {
    command: 'members',
    description:
      'list | create --username --display-name --initial-password-file [--role-ids] | roles <username> --set | reset-password <username> --initial-password-file | password --password-stdin',
  },
] as const;

type TeamValues = {
  username?: string;
  name?: string;
  permissions?: string;
  set?: string;
  revoke?: string;
  member?: string[];
  'role-ids'?: string;
  as?: string;
  'display-name'?: string;
  'initial-password-file'?: string;
  'password-stdin'?: boolean;
  confirm?: boolean;
  'body-stdin'?: boolean;
};
type Rpc = <T>(method: string, args: Record<string, unknown>) => Promise<T>;
const usage = (): never => {
  throw new CliLiveError('usage', 'team-command-invalid');
};
async function secret(io: BotCreateCliIo): Promise<string> {
  if (!io.readStdin) throw new CliLiveError('usage', 'password-stdin-required');
  return (await io.readStdin()).replace(/\r?\n$/u, '');
}

function secretJson<T>(schema: z.ZodType<T>, text: string): T {
  try {
    return schema.parse(JSON.parse(text));
  } catch {
    throw new CliLiveError('usage', 'password-input-invalid');
  }
}

const memberRow = z.object({ humanId: z.string(), username: z.string() });
async function memberId(username: string, rpc: Rpc, as?: string): Promise<string> {
  const mode = z
    .object({ viewer: z.object({ humanId: z.string() }) })
    .parse(await rpc('teamMode', {}));
  if (as === username) return mode.viewer.humanId;
  const rows = z.array(memberRow).safeParse(await rpc('members', {}));
  if (!rows.success) throw new CliLiveError('host-protocol-error', 'member-response-invalid');
  const member = rows.data.find((row) => row.username === username);
  if (!member) throw new CliLiveError('member-not-found', 'member-not-found');
  return member.humanId;
}
const ids = (value: string): string[] =>
  value === '' ? [] : value.split(',').map((id) => id.trim());

async function passwordFile(
  path: string,
  issue: () => Promise<{ initialPassword: string; output: Record<string, unknown> }>,
): Promise<unknown> {
  let fd: number;
  try {
    fd = openSync(path, 'wx', 0o600);
  } catch {
    throw new CliLiveError('password-file-unavailable', 'password-file-unavailable');
  }
  let written = false;
  let committed = false;
  try {
    fchmodSync(fd, 0o600);
    const result = await issue();
    committed = true;
    writeFileSync(fd, result.initialPassword, 'utf8');
    written = true;
    return { ...result.output, initialPasswordFile: path };
  } catch (error) {
    if (committed)
      throw new CliLiveError(
        'initial-password-recovery-required',
        'initial-password-recovery-required',
      );
    throw error;
  } finally {
    closeSync(fd);
    if (!written) unlinkSync(path);
  }
}

export async function runTeamCommand(
  command: string,
  rest: string[],
  values: TeamValues,
  io: BotCreateCliIo,
  rpc: Rpc,
): Promise<unknown> {
  const [action, argument] = rest;
  if (command === 'roles') {
    if (action === 'list' && rest.length === 1) return rpc('roles', {});
    if (action === 'catalog' && rest.length === 1) return rpc('permissionCatalog', {});
    if (action === 'create' && rest.length === 1 && values.name && values.permissions !== undefined)
      return rpc('roleCreate', { name: values.name, permissions: ids(values.permissions) });
    if (
      action === 'update' &&
      argument &&
      rest.length === 2 &&
      (values.name !== undefined || values.permissions !== undefined)
    )
      return rpc('roleUpdate', {
        roleId: argument,
        ...(values.name === undefined ? {} : { name: values.name }),
        ...(values.permissions === undefined ? {} : { permissions: ids(values.permissions) }),
      });
    if (action === 'delete' && argument && rest.length === 2) {
      if (!values.confirm) throw new CliLiveError('confirm-required', 'confirm-required');
      return rpc('roleDelete', { roleId: argument });
    }
    return usage();
  }
  if (command === 'devices') {
    const username = values.member?.[0];
    if (rest.length || !username || values.member?.length !== 1) return usage();
    const humanId = await memberId(username, rpc, values.as);
    return values.revoke === undefined
      ? rpc('memberDevices', { humanId })
      : rpc('memberDeviceRevoke', { humanId, grantId: values.revoke });
  }
  if (command === 'team-mode') {
    if (
      action === 'transfer-owner' &&
      argument &&
      rest.length === 2 &&
      values['password-stdin'] &&
      values.confirm
    ) {
      const humanId = await memberId(argument, rpc, values.as);
      return rpc('ownerTransfer', { humanId, password: await secret(io) });
    }

    if (action === 'status' && rest.length === 1) return rpc('teamMode', {});
    if ((action === 'on' || action === 'off') && rest.length === 1)
      return rpc('teamModeSet', { enabled: action === 'on' });
    if (action === 'owner-password' && values['password-stdin'] && rest.length === 1) {
      const text = await secret(io);
      const input = text.startsWith('{')
        ? secretJson(z.object({ password: z.string(), current: z.string().optional() }), text)
        : { password: text };
      return rpc('teamOwnerPasswordSet', input);
    }
    if (
      action === 'insecure-http' &&
      rest.length === 2 &&
      (argument === 'on' || argument === 'off') &&
      values.confirm
    )
      return rpc('teamInsecureHttpSet', { allowed: argument === 'on' });
    return usage();
  }
  if (command === 'members') {
    if (action === 'roles' && argument && rest.length === 2 && values.set !== undefined)
      return rpc('memberRolesSet', {
        humanId: await memberId(argument, rpc, values.as),
        roleIds: ids(values.set),
      });
    if (action === 'list' && rest.length === 1) return rpc('members', {});
    if (action === 'password' && rest.length === 1 && values['password-stdin'])
      return rpc(
        'memberPasswordChange',
        secretJson(z.object({ current: z.string(), next: z.string() }), await secret(io)),
      );
    if (
      action === 'reset-password' &&
      argument &&
      rest.length === 2 &&
      values['initial-password-file']
    )
      return passwordFile(values['initial-password-file'], async () => {
        const members = z
          .array(z.object({ username: z.string(), humanId: z.string() }))
          .parse(await rpc('members', {}));
        const member = members.find((entry) => entry.username === argument);
        if (!member) throw new CliLiveError('member-not-found', 'member-not-found');
        const result = z
          .object({ initialPassword: z.string() })
          .parse(await rpc('memberPasswordReset', { humanId: member.humanId }));
        return { initialPassword: result.initialPassword, output: { humanId: member.humanId } };
      });
    if (
      action === 'create' &&
      rest.length === 1 &&
      values.username &&
      values['display-name'] &&
      values['initial-password-file']
    ) {
      return passwordFile(values['initial-password-file'], async () => {
        const result = z.object({ member: z.unknown(), initialPassword: z.string() }).parse(
          await rpc('memberCreate', {
            username: values.username,
            displayName: values['display-name'],
            ...(values['role-ids'] === undefined ? {} : { roleIds: ids(values['role-ids']) }),
          }),
        );
        return { initialPassword: result.initialPassword, output: { member: result.member } };
      });
    }
    return usage();
  }
  if (command === 'channels') {
    if (rest.length === 0) return rpc('channels', {});
    if (action === 'send' && argument && rest.length === 2 && values['body-stdin']) {
      const body = await io.readStdin?.();
      if (!body?.trim()) return usage();
      return rpc('channelSend', { channelId: argument, body });
    }
    if (action === 'browse-public' && rest.length === 1) return rpc('publicChannels', {});
    if (action === 'join-public' && argument && rest.length === 2)
      return rpc('publicChannelJoin', { channelId: argument });
    if (
      action === 'set-public' &&
      argument &&
      rest.length === 3 &&
      (rest[2] === 'on' || rest[2] === 'off')
    )
      return rpc('channelPublicSet', { channelId: argument, public: rest[2] === 'on' });
  }
  return usage();
}
