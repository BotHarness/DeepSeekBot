import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import type { OrchestratorAgentRun } from '../../runtime/bot-runtime.js';
import type { InboxOpenFilter } from '../../runtime/inbox-triage.js';

type InboxToolRun = Pick<OrchestratorAgentRun, 'inboxHistory' | 'triage'> & {
  channels: Pick<OrchestratorAgentRun['channels'], 'ignore'>;
};

const INBOX_FILTER_PARAMETERS = {
  source_kind: {
    type: 'array',
    items: { type: 'string' },
    description:
      'Admission reasons or Source Event kinds, such as human-dm, group-mention, bot-dm, schedule, assignment-report.',
  },
  channel_id: { type: 'string', description: 'Only items in this Channel.' },
  assignment_id: { type: 'string', description: 'Only items about this Assignment Session id.' },
  author: {
    type: 'string',
    description: 'Author kind (human, bot, bridged), Bot slug, or external sender id or name.',
  },
  since: { type: 'string', description: 'Inclusive ISO timestamp lower bound.' },
  until: { type: 'string', description: 'Inclusive ISO timestamp upper bound.' },
} as const;

function inboxFilter(args: {
  source_kind?: string[];
  channel_id?: string;
  assignment_id?: string;
  author?: string;
  since?: string;
  until?: string;
}): InboxOpenFilter {
  return {
    ...(args.source_kind === undefined ? {} : { sourceKind: args.source_kind }),
    ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
    ...(args.assignment_id === undefined ? {} : { assignmentSessionId: args.assignment_id }),
    ...(args.author === undefined ? {} : { author: args.author }),
    ...(args.since === undefined ? {} : { since: args.since }),
    ...(args.until === undefined ? {} : { until: args.until }),
  };
}

export function registerInboxTools(
  currentRun: () => InboxToolRun | undefined,
  registerTool: (tool: ToolDefinition) => unknown,
  engineChannel: () => string | undefined,
): void {
  registerTool(
    defineTool({
      name: 'inbox_history',
      description:
        'List or search this PersonaBot’s own Bot Inbox across Sessions, including handled history and Self-Records. Read-only: never observes, handles, ignores or wakes work. Search is a literal FTS5 trigram phrase of at least 3 Unicode characters, ranked by relevance. Return at most 50 bounded snippets; read full Channel content with channel_read. Reuse the same filters with nextCursor. Search cursors last 10 minutes or until Host restart, and up to 64 searches are retained; narrow queries with more than 10000 matches.',
      parameters: {
        query: {
          type: 'string',
          description: 'Literal text to find; 3–300 characters, Chinese or English.',
        },
        kind: {
          type: 'string',
          description:
            'Admission reason or Source Event kind, such as memory-commit, bot-action, schedule, dm, mention, assignment-report.',
        },
        channel_id: { type: 'string', description: 'Filter to this Channel.' },
        cause_source_event_id: {
          type: 'string',
          description: 'Filter by the Source Event that caused the record.',
        },
        since: { type: 'string', description: 'Inclusive ISO timestamp lower bound.' },
        until: { type: 'string', description: 'Inclusive ISO timestamp upper bound.' },
        limit: { type: 'integer', description: '1–50 results; default 30.' },
        cursor: {
          type: 'string',
          description: 'nextCursor from the previous page with the same filters.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.inboxHistory === undefined)
          throw new Error('inbox_history: Orchestrator history is unavailable');
        return JSON.stringify(
          active.inboxHistory({
            ...(args.query === undefined ? {} : { query: args.query }),
            ...(args.kind === undefined ? {} : { kind: args.kind }),
            ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
            ...(args.cause_source_event_id === undefined
              ? {}
              : { causeSourceEventId: args.cause_source_event_id }),
            ...(args.since === undefined ? {} : { since: args.since }),
            ...(args.until === undefined ? {} : { until: args.until }),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'inbox_list',
      description:
        'Review open Bot Inbox items: ones a turn has seen and you have not resolved. Items in the same Channel conversation or Assignment are grouped with a count and up to 20 ids, newest conversation first. Read-only. Filters narrow by source kind, Channel, Assignment, author and time; reuse the same filters with nextCursor.',
      parameters: {
        ...INBOX_FILTER_PARAMETERS,
        include_snoozed: {
          type: 'boolean',
          description: 'Also list snoozed items, with their snoozedUntil.',
        },
        limit: { type: 'integer', description: '1–50 conversations; default 20.' },
        cursor: {
          type: 'string',
          description: 'nextCursor from the previous page with the same filters.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.triage === undefined)
          throw new Error('inbox_list: the Orchestrator inbox is unavailable');
        return JSON.stringify(
          active.triage.list({
            ...inboxFilter(args),
            ...(args.include_snoozed === undefined ? {} : { includeSnoozed: args.include_snoozed }),
            ...(args.limit === undefined ? {} : { limit: args.limit }),
            ...(args.cursor === undefined ? {} : { cursor: args.cursor }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'inbox_resolve',
      description:
        'Resolve Bot Inbox items you have seen, with outcome done or ignored and an optional short note kept in the Inbox diary. Pass ids (open items, or items of this turn), or pass filter fields to resolve every matching open item: the first filter call returns outcome confirm with the count, a sample and a token, and only a repeat of the same call with confirm set to that token resolves them. A changed match returns a new count and token instead.',
      parameters: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Source Event ids from [Open Inbox] or inbox_list, or the Message ID shown in a turn header, to resolve; 1–200. Do not combine with filter fields.',
        },
        ...INBOX_FILTER_PARAMETERS,
        outcome: {
          type: 'string',
          enum: ['done', 'ignored'],
          required: true,
          description:
            'done when answered, finished or needing nothing more; ignored for spam, misdelivery or irrelevant content.',
        },
        note: { type: 'string', description: 'Why, in at most 500 characters.' },
        confirm: {
          type: 'string',
          description: 'Token from the previous filter call, to resolve that exact set.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.triage === undefined)
          throw new Error('inbox_resolve: the Orchestrator inbox is unavailable');
        const filter = inboxFilter(args);
        const scope = engineChannel();
        return JSON.stringify(
          active.triage.resolve({
            ...(scope === undefined ? {} : { channelId: scope }),
            outcome: args.outcome,
            ...(args.ids === undefined ? {} : { ids: args.ids }),
            ...(Object.keys(filter).length === 0 ? {} : { filter }),
            ...(args.note === undefined ? {} : { note: args.note }),
            ...(args.confirm === undefined ? {} : { confirm: args.confirm }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'inbox_snooze',
      description:
        'Defer only unfinished Bot Inbox responsibilities until a time, with a note for resumption. Resolve already-read FYI items as done instead of snoozing them; they need no future work. At that time they return and wake you; a new event in the same Channel conversation or Assignment brings them back early. Snoozing again never moves the return earlier. Pass ids, or filter fields with the same count-then-confirm flow as inbox_resolve.',
      parameters: {
        ids: {
          type: 'array',
          items: { type: 'string' },
          description:
            'Source Event ids from [Open Inbox] or inbox_list, or the Message ID shown in a turn header, to snooze; 1–200. Do not combine with filter fields.',
        },
        ...INBOX_FILTER_PARAMETERS,
        until_time: {
          type: 'string',
          required: true,
          description: 'ISO timestamp in the future, within 30 days, when the items return.',
        },
        note: {
          type: 'string',
          description: 'What to do when they return, at most 500 characters.',
        },
        confirm: {
          type: 'string',
          description: 'Token from the previous filter call, to snooze that exact set.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.triage === undefined)
          throw new Error('inbox_snooze: the Orchestrator inbox is unavailable');
        const filter = inboxFilter(args);
        return JSON.stringify(
          active.triage.snooze({
            until: args.until_time,
            ...(args.ids === undefined ? {} : { ids: args.ids }),
            ...(Object.keys(filter).length === 0 ? {} : { filter }),
            ...(args.note === undefined ? {} : { note: args.note }),
            ...(args.confirm === undefined ? {} : { confirm: args.confirm }),
          }),
        );
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'inbox_ignore',
      description:
        'Explicitly dismiss one Channel message already shown to or read by this PersonaBot, by message id. Use only for spam, misdelivery, truly irrelevant content, or an explicit request to dismiss. Resolve FYI context with inbox_resolve outcome done instead. The message remains in Channel history.',
      parameters: {
        message_id: {
          type: 'string',
          required: true,
          description: 'Channel message ID to ignore.',
        },
        channel_id: {
          type: 'string',
          description: 'Channel ID; defaults to the inbound Channel.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined) throw new Error('inbox_ignore: Orchestrator run is unavailable');
        return JSON.stringify(
          active.channels.ignore({
            messageId: args.message_id,
            ...(args.channel_id === undefined ? {} : { channelId: args.channel_id }),
          }),
        );
      },
    }),
  );
}

export function registerSourceAttentionTools(
  currentRun: () => Pick<OrchestratorAgentRun, 'sourcePolicy'> | undefined,
  registerTool: (tool: ToolDefinition) => unknown,
): void {
  registerTool(
    defineTool({
      name: 'source_attention_get',
      description:
        "Read only this PersonaBot's nine effective source rules, revisions, lastActor/changedAt and recentWakeCount (actual wake attempts in the last seven days). Per-Channel overrides beat the group-ordinary default; membership and protected admission gates remain Host-owned.",
      parameters: {},
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async () => {
        const active = currentRun();
        if (active === undefined || active.sourcePolicy === undefined)
          throw new Error('source_attention_get: Orchestrator run is unavailable');
        return JSON.stringify({ policies: active.sourcePolicy.list() });
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'source_attention_set',
      description:
        "Set only this PersonaBot's source default. Matrix: human-dm, bot-dm or group-mention → wake immediate and required delivery steer (inject at the next safe step of an active turn, or start a turn when idle) or turn (queue a separate turn), no digest parameters. Omitted sourceClass or assignment-report → conditional or immediate, no digest parameters; conditional wakes for non-progress reports or expected replies. group-ordinary → immediate, digest, mentions or silent; only digest accepts optional integer digestCount 1–100 and digestIntervalSeconds 1–3600 (omit to preserve effective values; built-in 5/30). Delivery is rejected for assignment-report and group-ordinary. All other combinations fail without a policy write. Per-Channel overrides win, direct addresses still arrive, and delivery is evaluated when the Host dispatches a wake; admitted events retain their original wake/revision. Returns effective rule, revision, last actor/time and seven-day wake count.",
      parameters: {
        sourceClass: {
          type: 'string',
          enum: ['assignment-report', 'group-ordinary', 'human-dm', 'bot-dm', 'group-mention'],
          description:
            'Omit for assignment-report; group-ordinary changes its source default, not a Channel override.',
        },
        wake: {
          type: 'string',
          required: true,
          enum: ['conditional', 'immediate', 'digest', 'mentions', 'silent'],
        },
        delivery: {
          type: 'string',
          enum: ['steer', 'turn'],
          description: 'Required only for human-dm, bot-dm or group-mention with wake immediate.',
        },
        digestCount: {
          type: 'integer',
          description: 'Only group-ordinary + digest: 1–100; omission preserves effective count.',
        },
        digestIntervalSeconds: {
          type: 'integer',
          description:
            'Only group-ordinary + digest: 1–3600 seconds; omission preserves effective interval.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.sourcePolicy === undefined)
          throw new Error('source_attention_set: Orchestrator run is unavailable');
        if (
          args.sourceClass === 'human-dm' ||
          args.sourceClass === 'bot-dm' ||
          args.sourceClass === 'group-mention'
        ) {
          if (args.wake !== 'immediate') throw new Error('Direct sources must wake immediately');
          if (args.delivery !== 'steer' && args.delivery !== 'turn')
            throw new Error('Direct sources require delivery steer or turn');
          if (args.digestCount !== undefined || args.digestIntervalSeconds !== undefined)
            throw new Error('Direct sources have no digest parameters');
          return JSON.stringify(
            active.sourcePolicy.setImmediateDelivery(args.sourceClass, args.delivery),
          );
        }
        if (args.delivery !== undefined) throw new Error('Only direct sources accept delivery');
        if (args.sourceClass === undefined || args.sourceClass === 'assignment-report') {
          if (args.wake !== 'conditional' && args.wake !== 'immediate')
            throw new Error('Assignment report wake must be conditional or immediate');
          if (args.digestCount !== undefined || args.digestIntervalSeconds !== undefined)
            throw new Error('Assignment report has no digest parameters');
          return JSON.stringify(active.sourcePolicy.setAssignmentReport(args.wake));
        }
        if (args.sourceClass !== 'group-ordinary') throw new Error('Source class is not editable');
        if (
          args.wake !== 'immediate' &&
          args.wake !== 'digest' &&
          args.wake !== 'mentions' &&
          args.wake !== 'silent'
        )
          throw new Error('Group ordinary wake mode is invalid');
        if (
          args.wake !== 'digest' &&
          (args.digestCount !== undefined || args.digestIntervalSeconds !== undefined)
        )
          throw new Error('Only Group digest wake accepts digest parameters');
        const current = active.sourcePolicy
          .list()
          .find((policy) => policy.sourceClass === 'group-ordinary');
        const count = args.digestCount ?? current?.digestCount ?? 5;
        const interval = args.digestIntervalSeconds ?? current?.digestIntervalSeconds ?? 30;
        if (
          !Number.isSafeInteger(count) ||
          count! < 1 ||
          count! > 100 ||
          !Number.isSafeInteger(interval) ||
          interval! < 1 ||
          interval! > 3600
        )
          throw new Error('Group digest count or interval is invalid');
        return JSON.stringify(active.sourcePolicy.setGroupOrdinary(args.wake, count!, interval!));
      },
    }),
  );
  registerTool(
    defineTool({
      name: 'source_attention_reset',
      description:
        "Reset only this PersonaBot's source default: human-dm, bot-dm or group-mention → immediate, delivery steer; omitted sourceClass or assignment-report → conditional, no digest; group-ordinary → digest, count 5, interval 30 seconds. Returns the effective rule with a new audited revision, last actor/time and seven-day wake count. Existing Channel overrides and previous Admissions stay intact; other source classes cannot be reset here.",
      parameters: {
        sourceClass: {
          type: 'string',
          enum: ['assignment-report', 'group-ordinary', 'human-dm', 'bot-dm', 'group-mention'],
          description:
            'Omit for assignment-report; group-ordinary changes its source default, not a Channel override.',
        },
      },
      output: {
        schema: { type: 'string' },
        render: (_args, value) => [{ type: 'text', text: value }],
      },
      execute: async (args) => {
        const active = currentRun();
        if (active === undefined || active.sourcePolicy === undefined)
          throw new Error('source_attention_reset: Orchestrator run is unavailable');
        if (
          args.sourceClass !== undefined &&
          args.sourceClass !== 'assignment-report' &&
          args.sourceClass !== 'group-ordinary' &&
          args.sourceClass !== 'human-dm' &&
          args.sourceClass !== 'bot-dm' &&
          args.sourceClass !== 'group-mention'
        )
          throw new Error('Source class is not editable');
        if (
          args.sourceClass === 'human-dm' ||
          args.sourceClass === 'bot-dm' ||
          args.sourceClass === 'group-mention'
        )
          return JSON.stringify(active.sourcePolicy.resetImmediateDelivery(args.sourceClass));
        return JSON.stringify(
          args.sourceClass === 'group-ordinary'
            ? active.sourcePolicy.resetGroupOrdinary()
            : active.sourcePolicy.resetAssignmentReport(),
        );
      },
    }),
  );
}
