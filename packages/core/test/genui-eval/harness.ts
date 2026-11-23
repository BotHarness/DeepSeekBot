import type { ToolDefinition, ToolRunContext } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { GENUI_AUTHORING_SECTION } from '../../src/features/genui/prompt.js';
import { createGenuiDiagramTool, createGenuiPreviewTool } from '../../src/features/genui/tools.js';
import { createBotMessageTool } from '../../src/runtime/bot-message-tool.js';
import { parseGenuiContent } from '../../src/channels/genui.js';
import { previewGenuiDocument } from '../../src/runtime/genui-preview.js';
import type { GenuiEvalScenario } from './scenarios.js';

export interface ModelEndpoint {
  baseUrl: string;
  apiKey: string;
  model: string;
  headers?: Record<string, string>;
}

export interface GenuiEvalRun {
  arm: string;
  scenario: string;
  index: number;
  usage: { input: number; cacheRead: number; output: number; steps: number };
  durationMs: number;
  tools: string[];
  errors: string[];
  published: boolean;
  renders: boolean;
  checks: { passed: number; total: number; missing: string[] };
  correct: boolean;
  document?: unknown;
}

type Message = Record<string, unknown>;
const DM = 'dm-human';
const SEND_FIELDS = ['channel_id', 'body', 'genui_json', 'genui_preview_id'];

let browserQueue: Promise<unknown> = Promise.resolve();
export function serialBrowser<T>(task: () => Promise<T>): Promise<T> {
  const next = browserQueue.then(task, task);
  browserQueue = next.catch(() => undefined);
  return next;
}

interface Authoring {
  expandGenuiContent?: (value: unknown, options?: { signal?: AbortSignal }) => Promise<unknown>;
  genuiPreviews?: { read(scope: string, id: string): unknown };
}

async function authoring(): Promise<Authoring> {
  try {
    return (await import('../../src/runtime/genui-authoring.js')) as Authoring;
  } catch {
    return {};
  }
}

function schema(tool: ToolDefinition, only?: string[]) {
  const properties: Record<string, unknown> = {};
  const required: string[] = [];
  for (const [name, raw] of Object.entries(tool.parameters as Record<string, unknown>)) {
    if (only !== undefined && !only.includes(name)) continue;
    const { required: isRequired, ...rest } = raw as Record<string, unknown> & {
      required?: boolean;
    };
    properties[name] = rest;
    if (isRequired) required.push(name);
  }
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: { type: 'object', properties, required },
    },
  };
}

function normalize(value: string) {
  return value
    .replace(/&lt;/gu, '<')
    .replace(/&gt;/gu, '>')
    .replace(/&amp;/gu, '&')
    .replace(/&#36;|&dollar;/gu, '$')
    .replace(/[,，\s]/gu, '');
}

export function score(scenario: GenuiEvalScenario, document: unknown) {
  const html =
    typeof document === 'object' && document !== null && 'html' in document
      ? String((document as { html: unknown }).html)
      : JSON.stringify(document ?? '');
  const text = normalize(html);
  const missing = scenario.required.filter((needle) => !text.includes(normalize(needle)));
  const svgs = (html.match(/<svg\b/giu) ?? []).length;
  const total = scenario.required.length + (scenario.diagrams > 0 ? 1 : 0);
  const diagramOk = scenario.diagrams === 0 || svgs >= scenario.diagrams;
  if (!diagramOk) missing.push(`svg>=${scenario.diagrams} (got ${svgs})`);
  return { passed: total - missing.length, total, missing };
}

async function complete(endpoint: ModelEndpoint, messages: Message[], tools: unknown[]) {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(`${endpoint.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${endpoint.apiKey}`,
        'content-type': 'application/json',
        ...endpoint.headers,
      },
      body: JSON.stringify({ model: endpoint.model, messages, tools, max_tokens: 48_000 }),
      signal: AbortSignal.timeout(600_000),
    }).catch((error: unknown) => ({ ok: false, status: 599, json: async () => String(error) }));
    const body = (await response.json().catch(() => ({}))) as {
      choices?: {
        message: {
          content?: string;
          reasoning_content?: string;
          tool_calls?: { id: string; function: { name: string; arguments: string } }[];
        };
      }[];
      usage?: {
        prompt_tokens: number;
        completion_tokens: number;
        prompt_cache_hit_tokens?: number;
        prompt_tokens_details?: { cached_tokens?: number };
      };
    };
    if (response.ok && body.choices?.[0])
      return { message: body.choices[0].message, usage: body.usage };
    if (attempt >= 4 || ![408, 429, 500, 502, 503, 504, 599].includes(response.status))
      throw new Error(`model ${response.status}: ${JSON.stringify(body).slice(0, 300)}`);
    await new Promise((resolve) => setTimeout(resolve, 3_000 * (attempt + 1)));
  }
}

function context(name: string): ToolRunContext {
  return {
    callId: ToolCallId(`genui-eval-${name}`),
    rootCallId: ToolCallId(`genui-eval-${name}`),
    token: Symbol('genui-eval') as ToolRunContext['token'],
    name,
    arguments: {},
    signal: AbortSignal.timeout(120_000),
    deferContext: () => undefined,
    concludeTurn: () => undefined,
  };
}

export async function runScenario(
  endpoint: ModelEndpoint,
  scenario: GenuiEvalScenario,
  options: { arm: string; index: number; browserPath: string },
): Promise<GenuiEvalRun> {
  const started = performance.now();
  const helpers = await authoring();
  const scope = `genui-eval-${options.arm}-${scenario.id}-${options.index}`;
  const diagram = createGenuiDiagramTool();
  const preview = createGenuiPreviewTool({
    browserPath: options.browserPath,
    scope,
    saveImage: async () => ({ type: 'image', id: 'preview' }) as never,
  } as Parameters<typeof createGenuiPreviewTool>[0]);
  const send = createBotMessageTool(() => {
    throw new Error('not used');
  });
  const tools = [schema(diagram), schema(preview), schema(send, SEND_FIELDS)];
  const messages: Message[] = [
    {
      role: 'system',
      content: `You are a Bot in a chat product. The authorized Human DM is channel_id "${DM}". Ordinary assistant text is private; the Human only sees what you send with bot_send_message.\n\n${GENUI_AUTHORING_SECTION.text}`,
    },
    { role: 'user', content: scenario.prompt },
  ];
  const run: GenuiEvalRun = {
    arm: options.arm,
    scenario: scenario.id,
    index: options.index,
    usage: { input: 0, cacheRead: 0, output: 0, steps: 0 },
    durationMs: 0,
    tools: [],
    errors: [],
    published: false,
    renders: false,
    checks: { passed: 0, total: 0, missing: [] },
    correct: false,
  };
  for (let step = 0; step < 10 && !run.published; step++) {
    const { message, usage } = await complete(endpoint, messages, tools);
    run.usage.steps += 1;
    const cached =
      usage?.prompt_cache_hit_tokens ?? usage?.prompt_tokens_details?.cached_tokens ?? 0;
    run.usage.cacheRead += cached;
    run.usage.input += (usage?.prompt_tokens ?? 0) - cached;
    run.usage.output += usage?.completion_tokens ?? 0;
    const calls = message.tool_calls ?? [];
    messages.push({
      role: 'assistant',
      content: message.content ?? '',
      reasoning_content: message.reasoning_content ?? '',
      ...(calls.length > 0 ? { tool_calls: calls } : {}),
    });
    if (calls.length === 0) break;
    for (const call of calls) {
      run.tools.push(call.function.name);
      let result: string;
      try {
        const args = JSON.parse(call.function.arguments || '{}') as Record<string, string>;
        if (call.function.name === 'genui_diagram') {
          result = String(
            await serialBrowser(() => diagram.execute(args as never, context('diagram'))),
          );
        } else if (call.function.name === 'genui_preview') {
          const value = String(
            await serialBrowser(() => preview.execute(args as never, context('preview'))),
          );
          const parts = preview.output?.render?.(args as never, value) ?? [];
          result = parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])).join('\n');
        } else if (call.function.name === 'bot_send_message') {
          await send.execute(args as never, context('send')).catch((error: unknown) => {
            if ((error as Error).message !== 'not used') throw error;
          });
          if (args['channel_id'] !== DM)
            throw Object.assign(new Error('The authorized Channel is unavailable.'), {
              code: 'unavailable-destination',
            });
          if (!args['body']?.trim())
            throw Object.assign(new Error('Text or an attachment is required.'), {
              code: 'empty-message',
            });
          if (args['genui_json'] !== undefined && args['genui_preview_id'] !== undefined)
            throw new Error('Use either genui_preview_id or genui_json, not both.');
          let document: unknown;
          if (args['genui_preview_id'] !== undefined) {
            if (helpers.genuiPreviews === undefined) throw new Error('unknown genui_preview_id');
            document = helpers.genuiPreviews.read(scope, args['genui_preview_id']);
          } else if (args['genui_json'] !== undefined) {
            const raw: unknown = JSON.parse(args['genui_json']);
            const expand = helpers.expandGenuiContent;
            document = expand ? await serialBrowser(() => expand(raw)) : raw;
          }
          if (document !== undefined) run.document = parseGenuiContent(document);
          run.published = run.document !== undefined;
          result = JSON.stringify({ status: 'committed', messageId: 'message-1' });
        } else throw new Error(`unknown tool ${call.function.name}`);
      } catch (error) {
        const code = (error as { code?: string }).code;
        result = `Error${code ? ` ${code}` : ''}: ${(error as Error).message}`;
        if (process.env['GENUI_EVAL_DEBUG'])
          run.errors.push(`args: ${(call.function.arguments ?? '').slice(0, 1500)}`);
        const width = /"width"\s*:\s*("?[^,}]*)/u.exec(call.function.arguments ?? '')?.[1];
        run.errors.push(
          `${call.function.name}: ${result.slice(0, 200)}${width === undefined ? '' : ` width=${width}`}`,
        );
      }
      messages.push({ role: 'tool', tool_call_id: call.id, content: result });
    }
  }
  run.durationMs = Math.round(performance.now() - started);
  if (run.document !== undefined) {
    run.checks = score(scenario, run.document);
    try {
      await serialBrowser(() =>
        previewGenuiDocument(run.document, { browserPath: options.browserPath, theme: 'light' }),
      );
      run.renders = true;
    } catch (error) {
      run.errors.push(`final-render: ${(error as Error).message}`);
    }
  } else
    run.checks = { passed: 0, total: score(scenario, undefined).total, missing: ['unpublished'] };
  run.correct = run.published && run.renders && run.checks.passed === run.checks.total;
  return run;
}
