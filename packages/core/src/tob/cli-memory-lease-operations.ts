import { canonicalCliCommandName } from '../bots/cli-command-names.js';
import { parseBotCliArgs } from '../bots/cli-options.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import type { TobMemoryLeases } from './memory-lease.js';
import { TobError } from './service.js';

export const TOB_MEMORY_LEASE_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'assignment-memory-lease',
    description:
      "Let one of your Assignments read the selected Bots' Memory, read-only, for the current Human request and until the Assignment is archived or the lease is revoked",
    write: false,
  },
  {
    command: 'assignment-memory-leases',
    description: 'List Memory leases with their state, per-Bot status and read provenance',
    write: false,
  },
  {
    command: 'assignment-memory-revoke',
    description: 'Revoke a Memory lease at once',
    write: false,
  },
];

export const TOB_ASSIGNMENT_LEASE_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'memory-snapshot',
    description: 'List a leased Bot Memory files at its accepted revision',
    write: false,
  },
  {
    command: 'memory-file',
    description: 'Read one leased Bot Memory file with its revision',
    write: false,
  },
  {
    command: 'memory-history',
    description: "List a leased Bot's Memory Commits",
    write: false,
  },
  {
    command: 'memory-diff',
    description: 'Read one leased Bot Memory commit diff',
    write: false,
  },
  {
    command: 'assignment-memory-leases',
    description: 'Show this Assignment lease, per-Bot status and read provenance',
    write: false,
  },
];

const LEASE_READS: Readonly<Record<string, string>> = {
  'memory-snapshot': 'snapshot',
  'memory-file': 'file',
  'memory-history': 'history',
  'memory-diff': 'diff',
};

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}

function keys(value: Record<string, unknown>, allowed: string[], required: string[] = []) {
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TobError('invalid-input');
}

function text(value: unknown, limit = 200): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > limit ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    throw new TobError('invalid-input');
  return value.trim();
}

export function createTobMemoryLeaseOperations(deps: {
  leases: () => TobMemoryLeases;
  tobSlug: () => string;
  sources: () => readonly string[];
}): PrepareTobOperation {
  return (command, raw) => {
    if (!TOB_MEMORY_LEASE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const args = object(raw);
    switch (command) {
      case 'assignment-memory-lease': {
        keys(args, ['assignment', 'bots', 'leaseKey'], ['assignment', 'bots', 'leaseKey']);
        const assignment = text(args.assignment);
        const leaseKey = text(args.leaseKey, 100);
        if (!Array.isArray(args.bots)) throw new TobError('invalid-input');
        const bots = args.bots.map((bot) => text(bot));
        return {
          completed: true,
          run(guard) {
            guard();
            return {
              lease: deps.leases().grant({
                tobSlug: deps.tobSlug(),
                leaseKey,
                assignmentSessionId: assignment,
                sourceEventIds: deps.sources(),
                bots,
              }),
            };
          },
        };
      }
      case 'assignment-memory-leases': {
        keys(args, ['assignment']);
        const assignment = args.assignment === undefined ? undefined : text(args.assignment);
        return {
          run(guard) {
            guard();
            return {
              leases: deps.leases().list({
                tobSlug: deps.tobSlug(),
                ...(assignment === undefined ? {} : { assignmentSessionId: assignment }),
              }),
            };
          },
        };
      }
      default: {
        keys(args, ['leaseId', 'reason'], ['leaseId']);
        const leaseId = text(args.leaseId);
        const reason = args.reason === undefined ? undefined : text(args.reason);
        return {
          completed: true,
          run(guard) {
            guard();
            return {
              lease: deps.leases().revoke({
                tobSlug: deps.tobSlug(),
                leaseId,
                ...(reason === undefined ? {} : { reason }),
              }),
            };
          },
        };
      }
    }
  };
}

export function createTobAssignmentLeaseOperations(deps: {
  leases: () => TobMemoryLeases;
  assignmentSessionId: string;
}): PrepareTobOperation {
  return (command, raw) => {
    const args = object(raw);
    if (command === 'assignment-memory-leases') {
      keys(args, []);
      return {
        completed: true,
        run(guard) {
          guard();
          const lease = deps.leases().active(deps.assignmentSessionId);
          if (!lease) throw new TobError('lease-unavailable');
          return { lease };
        },
      };
    }
    if (command !== 'cli') throw new TobError('lease-read-only');
    keys(args, ['argv', 'stdin', 'cwd'], ['argv']);
    const { argv } = args;
    if (
      !Array.isArray(argv) ||
      argv.length === 0 ||
      argv.length > 32 ||
      argv.some((arg) => typeof arg !== 'string')
    )
      throw new TobError('invalid-request');
    const name = canonicalCliCommandName(String(argv[0]));
    const kind = LEASE_READS[name];
    if (kind === undefined)
      throw new TobError(name.startsWith('memory-') ? 'lease-read-only' : 'tob-authority-required');
    if (typeof args.stdin === 'string' && args.stdin !== '') throw new TobError('invalid-request');
    let parsed: ReturnType<typeof parseBotCliArgs>;
    try {
      parsed = parseBotCliArgs(argv as string[]);
    } catch {
      throw new TobError('invalid-request');
    }
    const allowed = new Set(['path', 'sha', 'limit', 'compact', 'timeout']);
    if (
      Object.entries(parsed.values).some(([key, value]) => value !== undefined && !allowed.has(key))
    )
      throw new TobError('lease-read-only');
    const bot = parsed.positionals[1];
    if (parsed.positionals.length !== 2 || typeof bot !== 'string' || !bot.trim())
      throw new TobError('invalid-request');
    const value = (key: string) => {
      const option = (parsed.values as Record<string, unknown>)[key];
      return typeof option === 'string' ? option : undefined;
    };
    const limit = value('limit');
    if (limit !== undefined && !/^\d{1,3}$/u.test(limit)) throw new TobError('invalid-input');
    return {
      completed: true,
      run(guard) {
        guard();
        return deps.leases().read({
          assignmentSessionId: deps.assignmentSessionId,
          bot: bot.trim(),
          kind,
          ...(value('path') === undefined ? {} : { path: value('path')! }),
          ...(value('sha') === undefined ? {} : { sha: value('sha')! }),
          ...(limit === undefined ? {} : { limit: Number(limit) }),
        });
      },
    };
  };
}
