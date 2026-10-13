import type { PrivateAccountSummary } from '../../../core/src/credentials/contracts.js';

export interface PrivateAccountList {
  status: 'ready' | 'unavailable';
  accounts: PrivateAccountSummary[];
  replaceable: boolean;
  mcpServers?: PrivateMcpServer[];
}

export interface PrivateMcpServer {
  serverName: string;
  account: string;
  program: string;
  args: string[];
  approvedAt: string;
  connected: boolean;
}

const STATUSES = ['configured', 'replacing', 'unavailable'];

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string';
}

export function parsePrivateAccountList(value: unknown): PrivateAccountList {
  const list = value as Partial<PrivateAccountList> | null;
  if (
    list === null ||
    typeof list !== 'object' ||
    (list.status !== 'ready' && list.status !== 'unavailable') ||
    typeof list.replaceable !== 'boolean' ||
    !Array.isArray(list.accounts)
  )
    throw new Error('Private accounts are invalid');
  const accounts = list.accounts.map((entry: unknown): PrivateAccountSummary => {
    const row = entry as Partial<PrivateAccountSummary> | null;
    if (
      row === null ||
      typeof row !== 'object' ||
      typeof row.account !== 'string' ||
      !STATUSES.includes(row.status as string) ||
      !Array.isArray(row.fields) ||
      ![
        row.purpose,
        row.configuredAt,
        row.channelId,
        row.messageId,
        row.replacementMessageId,
      ].every(optionalString)
    )
      throw new Error('Private accounts are invalid');
    const fields = row.fields.map((field: unknown) => {
      const item = field as { id?: unknown; label?: unknown; required?: unknown } | null;
      if (
        item === null ||
        typeof item.id !== 'string' ||
        typeof item.label !== 'string' ||
        typeof item.required !== 'boolean'
      )
        throw new Error('Private accounts are invalid');
      return { id: item.id, label: item.label, required: item.required };
    });
    return {
      account: row.account,
      ...(row.purpose === undefined ? {} : { purpose: row.purpose }),
      fields,
      status: row.status!,
      ...(row.configuredAt === undefined ? {} : { configuredAt: row.configuredAt }),
      ...(row.channelId === undefined ? {} : { channelId: row.channelId }),
      ...(row.messageId === undefined ? {} : { messageId: row.messageId }),
      ...(row.replacementMessageId === undefined
        ? {}
        : { replacementMessageId: row.replacementMessageId }),
    };
  });
  const mcpServers = (Array.isArray(list.mcpServers) ? list.mcpServers : []).map(
    (entry: unknown): PrivateMcpServer => {
      const row = entry as Partial<PrivateMcpServer> | null;
      if (
        row === null ||
        typeof row !== 'object' ||
        typeof row.serverName !== 'string' ||
        typeof row.account !== 'string' ||
        typeof row.program !== 'string' ||
        !Array.isArray(row.args) ||
        !row.args.every((arg) => typeof arg === 'string') ||
        typeof row.approvedAt !== 'string' ||
        typeof row.connected !== 'boolean'
      )
        throw new Error('Private accounts are invalid');
      return {
        serverName: row.serverName,
        account: row.account,
        program: row.program,
        args: [...row.args],
        approvedAt: row.approvedAt,
        connected: row.connected,
      };
    },
  );
  return { status: list.status, accounts, replaceable: list.replaceable, mcpServers };
}
