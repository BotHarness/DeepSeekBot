import { randomUUID } from 'node:crypto';

import { DEFAULT_PROMPT_TEXT } from '../../src/prompts/prompt-parts.js';
import {
  orchestratorPromptSections,
  replyReminderText,
} from '../../src/runtime/dsh-bot-agent-adapter.js';
import { renderInbox } from '../../src/runtime/inbox-render.js';
import { withoutOpenStatus, type Scenario, type ToolCall } from './scenarios.js';
import type { EvalReport, ScenarioRun } from './score.js';

export interface ModelEndpoint {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
  readonly headers?: Readonly<Record<string, string>>;
}

type Message = Record<string, unknown>;

const tool = (
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: string[] = [],
) => ({
  type: 'function',
  function: { name, description, parameters: { type: 'object', properties, required } },
});
const S = { type: 'string' };

export const TOOLS = [
  tool(
    'bot_send_message',
    'Send a message as this PersonaBot. Reply with the trusted source_event_id from your Inbox, or proactively specify channel_id. Returns a delivery receipt.',
    { source_event_id: S, channel_id: S, body: S, resolve_inbox_ids: { type: 'array', items: S } },
    ['body'],
  ),
  tool(
    'send_assignment_request',
    'Send a request or an answer to one of your Assignments. Use answer_to for an item marked WAITING.',
    { session_id: S, message: S, answer_to: S },
    ['session_id', 'message'],
  ),
  tool(
    'create_assignment',
    'Dispatch long-running work to a new Assignment Session.',
    { title: S, description: S, instructions: S, grant_id: S, continuity_key: S },
    ['title', 'description', 'instructions'],
  ),
  tool(
    'channel_read',
    'Read recent messages of an accessible Channel.',
    { channel_id: S, limit: { type: 'number' } },
    ['channel_id'],
  ),
  tool(
    'inbox_resolve',
    'Resolve Bot Inbox items you have seen, with outcome done or ignored.',
    {
      ids: { type: 'array', items: S },
      outcome: { type: 'string', enum: ['done', 'ignored'] },
      note: S,
    },
    ['outcome'],
  ),
  tool('list_assignments', 'List your Assignments with their current activity.', {}),
  tool(
    'bridge_read',
    'Read one canonical external source from your own Bot Inbox.',
    { source_event_id: S },
    ['source_event_id'],
  ),
];

export function systemPrompt(): string {
  const sections = orchestratorPromptSections(DEFAULT_PROMPT_TEXT);
  return `${sections.role}\n\n${sections.replyDelivery}\n\n## Identity\nYou are Ada, a PersonaBot that helps the Human (Vain) ship the Export feature. Your DM Channel with Vain is dm-vain. Team Group Channel: Team (c-team). Time zone Asia/Shanghai.`;
}

function history(): Message[] {
  const call = (id: string, name: string, args: unknown) => ({
    id,
    type: 'function',
    function: { name, arguments: JSON.stringify(args) },
  });
  return [
    {
      role: 'user',
      content: `Current Channel Human: {"humanId":"h-vain","displayName":"Vain"}\nThe export button does nothing on Safari. Please get it fixed. Keep CSV as the only export format for now, we are not doing Excel this quarter.\n\n${replyReminderText(DEFAULT_PROMPT_TEXT)}`,
    },
    {
      role: 'assistant',
      content: '',
      reasoning_content: 'Dispatch an Assignment for the Safari export bug; CSV only.',
      tool_calls: [
        call('call_h1', 'create_assignment', {
          title: 'Fix Safari export button',
          description: 'Fix the export button on Safari; CSV stays the only format.',
          instructions: 'Reproduce and fix the Safari export bug. CSV only, no Excel.',
          continuity_key: 'fix-export',
        }),
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call_h1',
      content: JSON.stringify({ ok: true, sessionId: 'a-export' }),
    },
    {
      role: 'assistant',
      content: '',
      reasoning_content: 'Tell Vain it is dispatched.',
      tool_calls: [
        call('call_h2', 'bot_send_message', {
          channel_id: 'dm-vain',
          body: 'On it: I dispatched an Assignment to fix the Safari export. CSV stays the only format.',
        }),
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call_h2',
      content: JSON.stringify({ ok: true, delivered: true }),
    },
    { role: 'assistant', content: 'Dispatched and confirmed to Vain.', reasoning_content: 'Done.' },
  ];
}

function fakeResult(name: string, args: Record<string, unknown>): unknown {
  switch (name) {
    case 'bot_send_message':
      return { ok: true, delivered: true, messageId: `msg-${randomUUID().slice(0, 6)}` };
    case 'send_assignment_request':
      return { ok: true, acceptance: 'pending', sessionId: args['session_id'] };
    case 'create_assignment':
      return { ok: true, sessionId: `a-${randomUUID().slice(0, 6)}` };
    case 'inbox_resolve':
      return { resolved: Array.isArray(args['ids']) ? args['ids'].length : 0 };
    case 'list_assignments':
      return {
        assignments: [
          { sessionId: 'a-export', title: 'Fix Safari export button', activity: 'working' },
        ],
      };
    default:
      return { ok: true, messages: [] };
  }
}

interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
}

async function complete(endpoint: ModelEndpoint, messages: Message[], maxTokens = 4000) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${endpoint.apiKey}`,
        'content-type': 'application/json',
        ...endpoint.headers,
      },
      body: JSON.stringify({
        model: endpoint.model,
        messages,
        tools: TOOLS,
        max_tokens: maxTokens,
      }),
    });
    const body = (await response.json()) as {
      choices?: {
        message: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
      usage?: Usage;
    };
    if (response.ok && body.choices?.[0])
      return { message: body.choices[0].message, usage: body.usage };
    if (attempt >= 3 || ![429, 500, 502, 503].includes(response.status))
      throw new Error(`model ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    await new Promise((resolve) => setTimeout(resolve, 2_000 * (attempt + 1)));
  }
}

export async function runScenario(
  endpoint: ModelEndpoint,
  scenario: Scenario,
  system: string,
  options: { openStatus?: boolean } = {},
): Promise<ScenarioRun & { calls: ToolCall[]; inbox: string }> {
  const open =
    scenario.openInbox === undefined || options.openStatus !== false
      ? scenario.openInbox
      : withoutOpenStatus(scenario.openInbox);
  const inbox = [renderInbox([...scenario.units], DEFAULT_PROMPT_TEXT), open]
    .filter((part) => part !== undefined)
    .join('\n\n');
  const messages: Message[] = [
    { role: 'system', content: system },
    ...history(),
    { role: 'user', content: `${inbox}\n\n${replyReminderText(DEFAULT_PROMPT_TEXT)}` },
  ];
  const calls: ToolCall[] = [];
  const usage = { uncachedInput: 0, cacheRead: 0, output: 0, steps: 0 };
  for (let step = 0; step < 6; step++) {
    const { message, usage: used } = await complete(endpoint, messages);
    usage.steps += 1;
    usage.cacheRead += used?.prompt_cache_hit_tokens ?? 0;
    usage.uncachedInput +=
      used?.prompt_cache_miss_tokens ??
      (used?.prompt_tokens ?? 0) - (used?.prompt_cache_hit_tokens ?? 0);
    usage.output += used?.completion_tokens ?? 0;
    const toolCalls = message.tool_calls ?? [];
    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      reasoning_content: message.reasoning_content ?? '',
      ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
    });
    if (toolCalls.length === 0) break;
    for (const call of toolCalls) {
      let args: Record<string, unknown> = {};
      try {
        const parsed: unknown = JSON.parse(call.function.arguments || '{}');
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
          args = parsed as Record<string, unknown>;
      } catch {}
      calls.push({ name: call.function.name, args });
      messages.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(fakeResult(call.function.name, args)),
      });
    }
  }
  return {
    scenario: scenario.id,
    usage,
    behavior: scenario.behavior(calls),
    safety: scenario.safety(calls),
    calls,
    inbox,
  };
}

export async function runSuite(
  endpoint: ModelEndpoint,
  scenarios: readonly Scenario[],
  options: {
    runs: number;
    label: string;
    concurrency?: number;
    openStatus?: boolean;
    log?: (line: string) => void;
  },
): Promise<EvalReport & { runs: (ScenarioRun & { calls: ToolCall[]; inbox: string })[] }> {
  const system = systemPrompt();
  await complete(
    endpoint,
    [{ role: 'system', content: system }, ...history(), { role: 'user', content: 'Reply ok.' }],
    16,
  ).catch(() => undefined);
  const jobs = Array.from({ length: options.runs }, () => scenarios).flat();
  const results: (ScenarioRun & { calls: ToolCall[]; inbox: string })[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const scenario = jobs[next++]!;
      const result = await runScenario(endpoint, scenario, system, options);
      options.log?.(
        `${scenario.id} cost-in=${result.usage.uncachedInput} hit=${result.usage.cacheRead} out=${result.usage.output} steps=${result.usage.steps} ${JSON.stringify({ ...result.behavior, ...result.safety })}`,
      );
      results.push(result);
    }
  };
  await Promise.all(Array.from({ length: options.concurrency ?? 4 }, worker));
  return { label: options.label, model: endpoint.model, runs: results };
}
