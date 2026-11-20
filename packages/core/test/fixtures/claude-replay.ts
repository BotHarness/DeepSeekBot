import { readFileSync } from 'node:fs';

import type {
  ClaudePermission,
  ClaudeQuery,
  ClaudeQueryFactory,
  ClaudeQueryOptions,
  ClaudeUserMessage,
} from '../../src/engines/claude-engine.js';

export type ClaudeRecordedLine =
  | { kind: 'account'; info: Record<string, unknown> }
  | { kind: 'models'; list: unknown[] }
  | { kind: 'await-input' }
  | { kind: 'await-interrupt' }
  | { kind: 'message'; msg: Record<string, unknown> }
  | {
      kind: 'permission';
      tool: string;
      input: Record<string, unknown>;
      toolUseID: string;
      title?: string;
    }
  | { kind: 'exit'; detail: string };

export function readClaudeRecording(path: string): ClaudeRecordedLine[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as ClaudeRecordedLine);
}

export interface ClaudeReplay {
  factory: ClaudeQueryFactory;
  options: ClaudeQueryOptions[];
  prompts: string[];
  permissions: Array<{ tool: string; decision: ClaudePermission }>;
  gatewayCalls: Array<{ tool: string; status: number; result: unknown }>;
  interrupts: number;
  closed: number;
}

async function callGateway(
  options: ClaudeQueryOptions,
  tool: string,
  args: unknown,
): Promise<{ status: number; result: unknown }> {
  const server = options.mcpServers['deepseekbot']!;
  const response = await fetch(server.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      ...server.headers,
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: { name: tool, arguments: args },
    }),
  });
  const body = (await response.json()) as Record<string, unknown>;
  return { status: response.status, result: body['result'] ?? body['error'] };
}

type Block = Record<string, unknown>;

export function claudeReplay(recordings: readonly ClaudeRecordedLine[][]): ClaudeReplay {
  const replay: ClaudeReplay = {
    factory: undefined as unknown as ClaudeQueryFactory,
    options: [],
    prompts: [],
    permissions: [],
    gatewayCalls: [],
    interrupts: 0,
    closed: 0,
  };
  replay.factory = ({ prompt, options }) => {
    const lines = recordings[Math.min(replay.options.length, recordings.length - 1)]!;
    replay.options.push(options);
    const input = prompt[Symbol.asyncIterator]();
    const account = lines.find((line) => line.kind === 'account');
    const models = lines.find((line) => line.kind === 'models');
    const exit = lines.find((line) => line.kind === 'exit');
    let closed = false;
    let wake: (() => void) | undefined;
    let interrupted: (() => void) | undefined;
    const results = new Map<string, { text: string; isError: boolean }>();
    const denials = new Map<string, string>();
    async function* messages(): AsyncGenerator<unknown> {
      for (const line of lines) {
        if (closed) return;
        switch (line.kind) {
          case 'account':
          case 'models':
            break;
          case 'exit':
            throw new Error(line.detail);
          case 'await-input': {
            const next = await Promise.race([
              input.next(),
              new Promise<IteratorResult<ClaudeUserMessage>>((resolve) => {
                wake = () => resolve({ value: undefined, done: true });
              }),
            ]);
            if (next.done === true) return;
            replay.prompts.push(next.value.message.content);
            break;
          }
          case 'await-interrupt':
            await new Promise<void>((resolve) => {
              interrupted = resolve;
              wake = resolve;
            });
            break;
          case 'permission': {
            const decision = await options.canUseTool(line.tool, line.input, {
              signal: new AbortController().signal,
              toolUseID: line.toolUseID,
              ...(line.title === undefined ? {} : { title: line.title }),
            });
            replay.permissions.push({ tool: line.tool, decision });
            if (decision.behavior === 'deny') denials.set(line.toolUseID, decision.message);
            break;
          }
          case 'message': {
            const message = structuredClone(line.msg);
            const content = (message['message'] as Block | undefined)?.['content'];
            for (const block of (Array.isArray(content) ? content : []) as Block[]) {
              const name = String(block['name'] ?? '');
              if (block['type'] === 'tool_use' && name.startsWith('mcp__deepseekbot__')) {
                const tool = name.slice('mcp__deepseekbot__'.length);
                const called = await callGateway(options, tool, block['input']);
                replay.gatewayCalls.push({ tool, ...called });
                const result = called.result as {
                  content?: Array<{ text?: string }>;
                  isError?: boolean;
                };
                results.set(String(block['id']), {
                  text: result.content?.[0]?.text ?? JSON.stringify(called.result),
                  isError: called.status !== 200 || result.isError === true,
                });
              }
              if (block['type'] === 'tool_result') {
                const id = String(block['tool_use_id']);
                const outcome = results.get(id);
                if (outcome !== undefined) {
                  block['content'] = [{ type: 'text', text: outcome.text }];
                  block['is_error'] = outcome.isError;
                }
                const denial = denials.get(id);
                if (denial !== undefined) block['content'] = denial;
              }
            }
            yield message;
            break;
          }
        }
      }
      if (exit === undefined)
        await new Promise<void>((resolve) => {
          wake = resolve;
          if (closed) resolve();
        });
    }
    const iterator = messages();
    const query: ClaudeQuery = {
      [Symbol.asyncIterator]: () => iterator,
      accountInfo: async () => {
        if (account === undefined) throw new Error(exit?.detail ?? 'no account');
        return account.info;
      },
      supportedModels: async () => {
        if (models === undefined) throw new Error(exit?.detail ?? 'no models');
        return models.list;
      },
      interrupt: async () => {
        replay.interrupts += 1;
        interrupted?.();
        return undefined;
      },
      close: () => {
        closed = true;
        replay.closed += 1;
        wake?.();
      },
    };
    return query;
  };
  return replay;
}
