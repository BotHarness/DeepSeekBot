import {
  defineTool,
  type DefineToolOptions,
  type InferArgs,
  type ParameterSchemaSpec,
  type ToolRunContext,
  type ToolDefinition,
} from '@deepseek-ai/dsh-tools';
import type { Context } from '@deepseek-ai/cordis';

import type { ChannelToolApproval } from '../../workspaces/tool-approval.js';
import {
  createEvent,
  findMail,
  listEvents,
  readMail,
  searchContacts,
  writeMail,
  type GoogleRequest,
} from '../../connectors/google-api.js';
import type { BotConnector, ConnectorService } from '../../connectors/service.js';

type Account = Pick<BotConnector, 'accountId' | 'label' | 'access'>;
type RequestBatch = readonly [GoogleRequest, ...GoogleRequest[]];
type Execute = (input: {
  call: ToolRunContext;
  write: boolean;
  account: Account;
  requests: RequestBatch;
}) => Promise<unknown>;

const range = {
  start: { type: 'string', required: true, description: 'Start in RFC 3339, with time zone.' },
  end: { type: 'string', required: true, description: 'End in RFC 3339, with time zone.' },
} as const;
const page = {
  page_token: { type: 'string', description: 'nextPageToken from the previous call.' },
} as const;
const message = {
  to: { type: 'string', required: true, description: 'One recipient email address.' },
  subject: { type: 'string', required: true, description: 'Message subject.' },
  body: { type: 'string', required: true, description: 'Plain-text message body.' },
} as const;

type AccountParameter = {
  type: 'string';
  required?: true;
  enum?: string[];
  description: string;
};

function tools(accounts: readonly Account[] | undefined, execute: Execute) {
  function mode(readOnlyHint: boolean, destructiveHint = false) {
    const annotations = { readOnlyHint, destructiveHint };
    const allowed = accounts?.filter((account) => readOnlyHint || account.access === 'write');
    const selection: AccountParameter = {
      type: 'string',
      ...(allowed?.length
        ? {
            ...(allowed.length > 1 ? { required: true } : {}),
            enum: allowed.map((account) => account.label),
          }
        : {}),
      description:
        'Google Workspace account label when the Bot has more than one eligible account.',
    };
    function options<const S extends ParameterSchemaSpec>(
      parameters: S,
      request: (args: InferArgs<S>) => RequestBatch,
    ): Omit<DefineToolOptions<S, { type: 'string' }>, 'name' | 'description'> {
      return {
        parameters,
        deferLoading: true,
        isConcurrencySafe: () => readOnlyHint,
        output: {
          schema: { type: 'string' },
          render: (_args, value) => [{ type: 'text', text: value }],
        },
        execute: async (args, call) => {
          const label = 'account' in args ? args.account : undefined;
          const account =
            label === undefined && allowed?.length === 1
              ? allowed[0]
              : allowed?.find((candidate) => candidate.label === label);
          if (account === undefined)
            throw new Error('Choose one of the Google Workspace account labels.');
          return JSON.stringify(
            await execute({
              call,
              write: !readOnlyHint,
              account,
              requests: request(args),
            }),
          );
        },
      };
    }
    return {
      account: selection,
      options,
      bind: (tool: ToolDefinition) => ({ ...tool, annotations, available: allowed?.length !== 0 }),
    };
  }

  const read = mode(true);
  const write = mode(false);
  const send = mode(false, true);
  return [
    read.bind(
      defineTool({
        name: 'google_calendar_list_events',
        description:
          'List events on the selected Google account’s primary calendar in a time range.',
        ...read.options({ account: read.account, ...range, ...page }, (args) => [
          listEvents(args.start, args.end, args.page_token),
        ]),
      }),
    ),
    write.bind(
      defineTool({
        name: 'google_calendar_create_event',
        description:
          'Create an event on the selected Google account’s primary calendar. Requires approval.',
        ...write.options(
          {
            account: write.account,
            ...range,
            summary: { type: 'string', required: true, description: 'Event title.' },
          },
          (args) => [createEvent(args.summary, args.start, args.end)],
        ),
      }),
    ),
    read.bind(
      defineTool({
        name: 'google_gmail_search',
        description: 'Search Gmail and return message IDs for google_gmail_read.',
        ...read.options(
          {
            account: read.account,
            query: { type: 'string', required: true, description: 'Gmail search query.' },
            ...page,
          },
          (args) => [findMail(args.query, args.page_token)],
        ),
      }),
    ),
    read.bind(
      defineTool({
        name: 'google_gmail_read',
        description: 'Read a Gmail message, including its plain-text body when available.',
        ...read.options(
          {
            account: read.account,
            message_id: {
              type: 'string',
              required: true,
              description: 'Message ID from Gmail search.',
            },
          },
          (args) => [readMail(args.message_id)],
        ),
      }),
    ),
    write.bind(
      defineTool({
        name: 'google_gmail_draft',
        description: 'Save a Gmail draft. Requires approval.',
        ...write.options({ account: write.account, ...message }, (args) => [
          writeMail('draft', args.to, args.subject, args.body),
        ]),
      }),
    ),
    send.bind(
      defineTool({
        name: 'google_gmail_send',
        description: 'Send a plain-text Gmail message. Requires approval.',
        ...send.options({ account: send.account, ...message }, (args) => [
          writeMail('send', args.to, args.subject, args.body),
        ]),
      }),
    ),
    read.bind(
      defineTool({
        name: 'google_contacts_search',
        description: 'Search the selected Google account’s saved contacts by name, email or phone.',
        ...read.options(
          {
            account: read.account,
            query: {
              type: 'string',
              required: true,
              description: 'Text to match against saved contacts.',
            },
          },
          (args) => [searchContacts(''), searchContacts(args.query)],
        ),
      }),
    ),
  ].filter((tool) => tool.available);
}

const toolCatalog = tools(undefined, async () => {
  throw new Error('Google Workspace tools require a live Bot Agent.');
});

export function googleToolNames(access: BotConnector['access']): string[] {
  return toolCatalog
    .filter(({ annotations }) => access === 'write' || annotations.readOnlyHint)
    .map(({ name }) => name);
}

export function googleDirectToolDefinitions() {
  return toolCatalog.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.parameters,
  }));
}

export function mountGoogleTools(options: {
  agentCtx: { tools: Pick<Context['tools'], 'register'> };
  service: ConnectorService;
  botSlug: string;
  live(call: ToolRunContext): boolean;
  approval(): Pick<ChannelToolApproval, 'ask' | 'track' | 'executionGuard'> | undefined;
}) {
  const { agentCtx, botSlug, live, service } = options;
  let bindings = '';
  let registrations: Array<() => void> = [];
  const clear = () => {
    for (const remove of registrations) remove();
    registrations = [];
  };
  const execute: Execute = async ({ call, write, account, requests }) => {
    const { name } = call;
    const revision = service.account(account.accountId)?.revision;
    const allowed = () =>
      live(call) &&
      service.account(account.accountId)?.revision === revision &&
      service
        .googleForBot(botSlug)
        .some(
          (grant) => grant.accountId === account.accountId && (!write || grant.access === 'write'),
        );
    const requireGrant = () => {
      call.signal.throwIfAborted();
      if (!allowed())
        throw new Error('This Bot no longer has the required Google Workspace account access.');
    };
    requireGrant();
    if (!write)
      return service.google.call({
        accountId: account.accountId,
        requests,
        signal: call.signal,
        authorize: requireGrant,
      });

    const approval = options.approval();
    const agent = call.agent;
    if (approval === undefined || agent === undefined)
      throw new Error('Human Tool Approval is unavailable.');
    const approvalArgs = Object.freeze({
      ...(typeof call.arguments === 'object' && call.arguments !== null ? call.arguments : {}),
      account: account.label,
    });
    const untrack = approval.track(
      { ...call, arguments: approvalArgs },
      'each-use',
      false,
      undefined,
      undefined,
      {
        requireExplicitApproval: true,
        authorizationScope: () => (allowed() ? account.accountId : ''),
      },
    );
    if (untrack === undefined) throw new Error('Human Tool Approval is unavailable.');
    try {
      const outcome = await approval.ask({
        agent,
        toolName: name,
        callId: call.callId,
        signal: call.signal,
      });
      if (outcome !== 'allowed-once')
        throw new Error(`Human Tool Approval was ${outcome ?? 'unavailable'}.`);
      const guard = approval.executionGuard(agent, call.callId);
      return await service.google.call({
        accountId: account.accountId,
        requests,
        signal: call.signal,
        authorize() {
          requireGrant();
          if (guard?.(name, approvalArgs) !== true)
            throw new Error('Tool Approval changed before execution.');
        },
      });
    } finally {
      untrack();
    }
  };
  const sync = () => {
    const accounts = service.googleForBot(botSlug);
    const current = JSON.stringify(accounts);
    if (current === bindings) return;
    bindings = current;
    clear();
    registrations = tools(accounts, execute).map((tool) => agentCtx.tools.register(tool));
  };
  sync();
  const stop = service.onChange(sync);
  return () => {
    stop();
    clear();
  };
}
