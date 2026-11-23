import type { AgentManagementInvocation } from './cli-agent-management.js';
import { CliLiveError } from './cli-live-error.js';

export const TOB_MEMORY_LEASE_COMMAND_USAGE: Readonly<Record<string, string>> = {
  'assignment-memory-lease':
    'deepseekbot assignment-memory-lease <assignment-session-id> <bot-slug> [<bot-slug>...] --operation-key <stable key for this request>; the Assignment then reads with deepseekbot memory-snapshot|memory-file|memory-history|memory-diff <bot-slug>',
  'assignment-memory-leases': 'deepseekbot assignment-memory-leases [<assignment-session-id>]',
  'assignment-memory-revoke': 'deepseekbot assignment-memory-revoke <lease-id> [--reason <text>]',
  'memory-snapshot': 'deepseekbot memory-snapshot <bot-slug>',
  'memory-file': 'deepseekbot memory-file <bot-slug> --path <file>',
  'memory-history': 'deepseekbot memory-history <bot-slug> [--limit <1-50>]',
  'memory-diff': 'deepseekbot memory-diff <bot-slug> --sha <commit>',
};

const OPTIONS: Readonly<Record<string, readonly string[]>> = {
  'assignment-memory-lease': ['operation-key'],
  'assignment-memory-leases': [],
  'assignment-memory-revoke': ['reason'],
};

function usage(message: string): never {
  throw new CliLiveError('usage', message);
}

function textValue(value: unknown, field: string, limit = 200): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    usage(`${field} needs a nonempty value of at most ${String(limit)} characters.`);
  return value.trim();
}

export function parseAgentMemoryLease(
  command: string,
  rest: string[],
  values: Record<string, unknown>,
): AgentManagementInvocation | undefined {
  if (!Object.hasOwn(OPTIONS, command)) return undefined;
  const allowed = new Set(['compact', 'help', 'timeout', ...OPTIONS[command]!]);
  if (Object.entries(values).some(([key, value]) => value !== undefined && !allowed.has(key)))
    throw new CliLiveError(
      'agent-scope-denied',
      'This option is not available for the scoped CLI operation.',
    );
  switch (command) {
    case 'assignment-memory-lease': {
      if (rest.length < 2 || rest.length > 9)
        usage('assignment-memory-lease needs an Assignment and one to eight Bots.');
      const [assignment, ...bots] = rest.map((value, index) =>
        textValue(value, `argument ${String(index + 1)}`),
      );
      return {
        command,
        args: {
          assignment,
          bots,
          leaseKey: textValue(values['operation-key'], '--operation-key', 100),
        },
        write: false,
      };
    }
    case 'assignment-memory-leases':
      if (rest.length > 1) usage('assignment-memory-leases takes an optional Assignment.');
      return {
        command,
        args: rest.length === 0 ? {} : { assignment: textValue(rest[0], 'Assignment') },
        write: false,
      };
    default:
      if (rest.length !== 1) usage('assignment-memory-revoke needs exactly one lease id.');
      return {
        command,
        args: {
          leaseId: textValue(rest[0], 'lease id'),
          ...(values['reason'] === undefined
            ? {}
            : { reason: textValue(values['reason'], '--reason') }),
        },
        write: false,
      };
  }
}
