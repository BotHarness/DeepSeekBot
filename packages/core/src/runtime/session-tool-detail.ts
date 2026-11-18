import { PRIVATE_INPUT_TOOLS } from '../credentials/tool-contract.js';
import type { DshSessionEvent } from '../sessions/source.js';
import { toolTargets } from './session-transcript.js';

export type SessionToolDetail =
  | { card: 'terminal'; command?: string; output: string; exitCode?: number }
  | { card: 'diff'; files: { path: string; oldText: string | null; newText: string }[] }
  | {
      card: 'read';
      path: string;
      offset: number;
      totalLines: number;
      lines: { number: number; text: string }[];
    }
  | {
      card: 'search';
      total: number;
      truncated: boolean;
      files: { path: string; matches: { lineNumber: number; line: string }[] }[];
      paths: string[];
    }
  | {
      card: 'web';
      url?: string;
      statusCode?: number;
      sources: { url: string; title?: string }[];
      output: string;
    }
  | { card: 'text'; input?: string; output: string };

export interface SessionToolResultInput {
  content: unknown[];
  isError: boolean;
  meta?: unknown;
}

export type PresentToolResult = (
  sessionId: string,
  name: string,
  args: unknown,
  result: SessionToolResultInput,
) => unknown;

export const TOOL_DETAIL_CHARS = 12_000;
const LIST_ITEMS = 20;
const READ_LINES = 400;
const LINE_CHARS = 400;

function object(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};
}

function head(value: string, limit = TOOL_DETAIL_CHARS): string {
  return value.length <= limit ? value : `${value.slice(0, limit - 1)}…`;
}

function tail(value: string): string {
  return value.length <= TOOL_DETAIL_CHARS
    ? value
    : `…${value.slice(value.length - TOOL_DETAIL_CHARS + 1)}`;
}

function string(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function count(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) ? value : undefined;
}

function parsed(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function resultText(content: unknown[], data: Record<string, unknown>): string {
  const texts = content
    .map(object)
    .map((part) =>
      part['type'] === 'text' && typeof part['text'] === 'string'
        ? part['text']
        : part['type'] === 'image'
          ? '[image]'
          : '',
    )
    .filter((part) => part !== '');
  return texts.join('\n') || string(object(data['error'])['reason']) || '';
}

function inputText(name: string, raw: unknown): string | undefined {
  if (PRIVATE_INPUT_TOOLS.has(name)) return undefined;
  const args = parsed(raw);
  if (args === undefined) return typeof raw === 'string' && raw !== '' ? head(raw) : undefined;
  const text = JSON.stringify(args, null, 2);
  return text === '{}' || text === undefined ? undefined : head(text);
}

function normalize(
  view: Record<string, unknown>,
  targets: ReturnType<typeof toolTargets>,
  output: string,
): SessionToolDetail | undefined {
  if (view['card'] === 'terminal')
    return {
      card: 'terminal',
      ...(targets.command === undefined ? {} : { command: targets.command }),
      output: tail(string(view['output']) ?? output),
      ...(count(view['exitCode']) === undefined ? {} : { exitCode: count(view['exitCode'])! }),
    };
  if (view['card'] === 'diff' && Array.isArray(view['diffs']))
    return {
      card: 'diff',
      files: view['diffs']
        .map(object)
        .filter((diff) => typeof diff['path'] === 'string' && typeof diff['newText'] === 'string')
        .slice(0, LIST_ITEMS)
        .map((diff) => ({
          path: diff['path'] as string,
          oldText: typeof diff['oldText'] === 'string' ? head(diff['oldText']) : null,
          newText: head(diff['newText'] as string),
        })),
    };
  if (view['card'] === 'read' && typeof view['path'] === 'string' && Array.isArray(view['lines']))
    return {
      card: 'read',
      path: view['path'],
      offset: count(view['offset']) ?? 1,
      totalLines: count(view['totalLines']) ?? view['lines'].length,
      lines: view['lines']
        .map(object)
        .filter((line) => count(line['number']) !== undefined && typeof line['text'] === 'string')
        .slice(0, READ_LINES)
        .map((line) => ({
          number: line['number'] as number,
          text: head(line['text'] as string, LINE_CHARS),
        })),
    };
  if (view['card'] === 'search') {
    const files = Array.isArray(view['files']) ? view['files'].map(object) : [];
    const paths = Array.isArray(view['paths']) ? view['paths'] : [];
    return {
      card: 'search',
      total: count(view['total']) ?? files.length + paths.length,
      truncated: view['truncated'] === true,
      files: files
        .filter((file) => typeof file['path'] === 'string')
        .slice(0, LIST_ITEMS)
        .map((file) => ({
          path: file['path'] as string,
          matches: (Array.isArray(file['matches']) ? file['matches'] : [])
            .map(object)
            .filter((match) => count(match['lineNumber']) !== undefined)
            .slice(0, LIST_ITEMS)
            .map((match) => ({
              lineNumber: match['lineNumber'] as number,
              line: head(string(match['line']) ?? '', LINE_CHARS),
            })),
        })),
      paths: paths
        .filter((path): path is string => typeof path === 'string')
        .slice(0, LIST_ITEMS * 5),
    };
  }
  if (view['card'] === 'web') {
    const url = string(view['url']) ?? targets.url;
    return {
      card: 'web',
      ...(url === undefined ? {} : { url }),
      ...(count(view['statusCode']) === undefined
        ? {}
        : { statusCode: count(view['statusCode'])! }),
      sources: (Array.isArray(view['sources']) ? view['sources'] : [])
        .map(object)
        .filter((source) => typeof source['url'] === 'string')
        .slice(0, LIST_ITEMS)
        .map((source) => ({
          url: source['url'] as string,
          ...(typeof source['title'] === 'string' ? { title: head(source['title'], 200) } : {}),
        })),
      output: head(string(view['answer']) ?? output),
    };
  }
  return undefined;
}

export function summarizeSessionToolDetail(input: {
  sessionId: string;
  callId: string;
  events: readonly DshSessionEvent[];
  present?: PresentToolResult;
}): SessionToolDetail | undefined {
  let call: Record<string, unknown> | undefined;
  let result: Record<string, unknown> | undefined;
  for (const event of input.events) {
    const data = object(event.data);
    if (event.type === 'tool/call' && data['callId'] === input.callId) call = data;
    else if (event.type === 'tool/result' && object(data['message'])['toolCallId'] === input.callId)
      result = data;
  }
  if (call === undefined || typeof call['name'] !== 'string') return undefined;
  const name = call['name'];
  const args = parsed(call['arguments']);
  const targets = toolTargets(name, args);
  const message = object(result?.['message']);
  const content = Array.isArray(message['content']) ? message['content'] : [];
  const output = resultText(content, result ?? {});
  if (result !== undefined && input.present !== undefined && !PRIVATE_INPUT_TOOLS.has(name)) {
    let view: unknown;
    try {
      view = input.present(input.sessionId, name, args, {
        content,
        isError: message['isError'] === true,
        ...(result['meta'] === undefined ? {} : { meta: result['meta'] }),
      });
    } catch {
      view = undefined;
    }
    const detail = normalize(object(view), targets, output);
    if (detail !== undefined) return detail;
  }
  if (targets.command !== undefined)
    return { card: 'terminal', command: targets.command, output: tail(output) };
  const shown = inputText(name, call['arguments']);
  return { card: 'text', ...(shown === undefined ? {} : { input: shown }), output: head(output) };
}
