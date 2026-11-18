import { readFileSync } from 'node:fs';

import type { CodexProcessOptions, CodexTransport } from '../../src/engines/codex-engine.js';

interface RecordedLine {
  dir: 'in' | 'out';
  msg: Record<string, unknown>;
}

export function readCodexRecording(path: string): RecordedLine[] {
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => JSON.parse(line) as RecordedLine)
    .filter((line) => line.dir === 'in' || line.dir === 'out');
}

export interface CodexReplay {
  transport: CodexTransport;
  sent: Array<Record<string, unknown>>;
  gatewayCalls: Array<{ tool: string; status: number; result: unknown }>;
  mismatches: string[];
  closed: boolean;
}

async function callGateway(
  options: CodexProcessOptions,
  tool: string,
  args: unknown,
): Promise<{ status: number; result: unknown }> {
  const response = await fetch(options.gateway.url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${options.gateway.token}`,
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

export function codexReplay(
  recording: readonly RecordedLine[],
  options: CodexProcessOptions,
): CodexReplay {
  const listeners: Array<(message: unknown) => void> = [];
  const exits: Array<(detail: string) => void> = [];
  const lines = [...recording];
  let cursor = 0;
  const ids = new Map<unknown, unknown>();
  const gatewayResults = new Map<string, { text: string; isError: boolean }>();
  let pumping = Promise.resolve();
  const replay: CodexReplay = {
    sent: [],
    gatewayCalls: [],
    mismatches: [],
    closed: false,
    transport: {
      send: (message) => {
        const sent = message as Record<string, unknown>;
        replay.sent.push(sent);
        const expected = lines[cursor];
        if (expected?.dir !== 'out') {
          replay.mismatches.push(`unexpected ${JSON.stringify(sent).slice(0, 120)}`);
          return;
        }
        cursor += 1;
        const method = expected.msg['method'];
        if (method !== undefined && method !== sent['method'])
          replay.mismatches.push(`expected ${String(method)}, got ${String(sent['method'])}`);
        if (method === undefined) {
          const want = JSON.stringify(expected.msg['result']);
          const got = JSON.stringify(sent['result']);
          if (want !== got) replay.mismatches.push(`expected answer ${want}, got ${got}`);
        }
        if (expected.msg['id'] !== undefined && method !== undefined)
          ids.set(expected.msg['id'], sent['id']);
        pumping = pumping.then(pump).catch((error: unknown) => {
          const detail = `replay gateway call failed: ${error instanceof Error ? error.message : String(error)}`;
          replay.mismatches.push(detail);
          for (const listener of exits.splice(0)) listener(detail);
        });
      },
      onMessage: (listener) => void listeners.push(listener),
      onExit: (listener) => void exits.push(listener),
      close: async () => {
        replay.closed = true;
      },
    },
  };
  async function pump(): Promise<void> {
    while (cursor < lines.length && lines[cursor]!.dir === 'in') {
      const line = lines[cursor]!;
      cursor += 1;
      let message = structuredClone(line.msg);
      if (message['method'] === undefined && ids.has(message['id']))
        message = { ...message, id: ids.get(message['id']) };
      const params = (message['params'] ?? {}) as Record<string, unknown>;
      const item = (params['item'] ?? {}) as Record<string, unknown>;
      if (item['type'] === 'mcpToolCall' && item['server'] === 'deepseekbot') {
        const id = String(item['id']);
        if (message['method'] === 'item/started') {
          const called = await callGateway(options, String(item['tool']), item['arguments']);
          replay.gatewayCalls.push({ tool: String(item['tool']), ...called });
          const result = called.result as {
            content?: Array<{ text?: string }>;
            isError?: boolean;
          };
          gatewayResults.set(id, {
            text: result.content?.[0]?.text ?? JSON.stringify(called.result),
            isError: called.status !== 200 || result.isError === true,
          });
        } else {
          const outcome = gatewayResults.get(id);
          if (outcome !== undefined) {
            item['status'] = outcome.isError ? 'failed' : 'completed';
            item['result'] = outcome.isError
              ? null
              : {
                  content: [{ type: 'text', text: outcome.text }],
                  structuredContent: null,
                  _meta: null,
                };
            item['error'] = outcome.isError ? { message: outcome.text } : null;
          }
        }
      }
      for (const listener of listeners) listener(message);
      await Promise.resolve();
    }
  }
  return replay;
}
