import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { zstdDecompressSync } from 'node:zlib';
import { pathToFileURL } from 'node:url';

const identifier = (value) =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : undefined;
const reference = (value) =>
  typeof value === 'string' && /^private:[0-9a-f-]{36}:[a-z][a-z0-9_]{0,47}$/.test(value)
    ? value
    : undefined;
function refs(values) {
  if (!values || typeof values !== 'object' || Array.isArray(values)) return undefined;
  return Object.fromEntries(
    Object.entries(values).flatMap(([key, value]) =>
      /^[a-z][a-z0-9_]{0,47}$/.test(key) && reference(value) ? [[key, value]] : [],
    ),
  );
}

export function projectPrivateInputEvents(events) {
  const calls = new Map();
  return events.flatMap((event) => {
    const data = event.data ?? {};
    const time =
      typeof event.time === 'number' && Number.isSafeInteger(event.time) && event.time > 0
        ? new Date(event.time).toISOString()
        : event.time;
    if (
      !Number.isSafeInteger(event.seq) ||
      typeof time !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(time)
    )
      return [];
    const base = { seq: event.seq, time, type: event.type };
    if (event.type === 'request/header') return [base];
    if (
      event.type === 'tool/call' &&
      [
        'ask_secret',
        'protected_cli',
        'bash',
        'channel_send',
        'mcp__linux_demo__workspace_probe',
        'mcp__private_status__authenticated_status',
      ].includes(data.name)
    ) {
      const callId = identifier(data.callId);
      if (!callId) return [];
      calls.set(callId, data.name);
      let args = data.arguments ?? {};
      if (typeof args === 'string') {
        try {
          args = JSON.parse(args);
        } catch {
          args = {};
        }
      }
      const declaration =
        data.name === 'ask_secret' && Array.isArray(args.fields)
          ? args.fields.flatMap((field) =>
              /^[a-z][a-z0-9_]{0,47}$/.test(field.id)
                ? [{ id: field.id, required: field.required === true }]
                : [],
            )
          : undefined;
      const references = ['protected_cli', 'mcp__private_status__authenticated_status'].includes(
        data.name,
      )
        ? refs({ endpoint: args.endpoint, api_key: args.api_key, api_secret: args.api_secret })
        : undefined;
      return [
        {
          ...base,
          callId,
          name: data.name,
          ...(declaration ? { fields: declaration } : {}),
          ...(references
            ? {
                consumer:
                  data.name === 'mcp__private_status__authenticated_status'
                    ? 'mcp-http-status-v1'
                    : args.consumer === 'http-status-v1'
                      ? args.consumer
                      : 'unsupported',
                references,
              }
            : {}),
        },
      ];
    }
    if (event.type === 'tool/result') {
      const message = data.message ?? {};
      const callId = identifier(message.toolCallId);
      const name = calls.get(callId);
      if (!name) return [];
      let parsed;
      const text = message.content?.find((block) => block.type === 'text')?.text ?? '';
      try {
        parsed = JSON.parse(text || 'null');
      } catch {
        parsed = undefined;
      }
      let value;
      if (name === 'ask_secret' && ['configured', 'cancelled', 'expired'].includes(parsed?.status))
        value = { status: parsed.status, references: refs(parsed.references) };
      if (
        ((name === 'protected_cli' && parsed?.consumer === 'http-status-v1') ||
          (name === 'mcp__private_status__authenticated_status' &&
            parsed?.consumer === 'mcp-http-status-v1')) &&
        Number.isInteger(parsed.httpStatus) &&
        parsed.httpStatus >= 100 &&
        parsed.httpStatus <= 599
      )
        value = {
          consumer: parsed.consumer,
          successful: parsed.successful === true,
          httpStatus: parsed.httpStatus,
        };
      if (name === 'bash' && parsed?.kind === 'foreground')
        value = {
          kind: parsed.kind,
          exitCode: Number.isInteger(parsed.exitCode) ? parsed.exitCode : null,
          timedOut: parsed.timedOut === true,
          aborted: parsed.aborted === true,
        };
      if (name === 'channel_send' && identifier(parsed?.messageId))
        value = { messageId: parsed.messageId };
      if (name === 'bash' && value === undefined) {
        const exit = text.match(/\[exit code: (-?\d{1,3})\]\s*$/);
        if (exit)
          value = {
            exitCode: Number(exit[1]),
            linuxWorkspaceProof: text.includes('linux-workspace-ok\n/workspace\nuid=65534'),
            stderrProof: text.includes('native-error-stream'),
          };
        if (value === undefined && text.includes('Full formatted result stored at: '))
          value = {
            formattedSpill: true,
            subprocessSpill: text.includes('[output truncated; full output: '),
          };
      }
      if (name === 'mcp__linux_demo__workspace_probe') {
        let probe = parsed;
        const nested = parsed?.content?.find?.((block) => block.type === 'text')?.text;
        if (typeof nested === 'string') {
          try {
            probe = JSON.parse(nested);
          } catch {
            probe = undefined;
          }
        }
        value = {
          called: true,
          linuxWorkspaceProof: probe?.proof === 'linux-workspace-ok\n',
          linuxWorkspace: probe?.cwd === '/workspace',
          unprivileged: probe?.uid === 65534,
          hostCredentialEnvironmentFalse: probe?.hostCredentialEnvironment === false,
        };
      }
      return [
        { ...base, callId, name, isError: message.isError === true, ...(value ? { value } : {}) },
      ];
    }
    if (event.type === 'approval/asked' && identifier(data.callId) && calls.has(data.callId))
      return [
        { ...base, id: identifier(data.id), callId: data.callId, toolName: calls.get(data.callId) },
      ];
    if (event.type === 'approval/decided' && identifier(data.id))
      return [
        {
          ...base,
          id: data.id,
          outcome: [
            'allowed-once',
            'rejected',
            'cancelled',
            'unavailable',
            'denied',
            'allow',
            'deny',
          ].includes(data.outcome)
            ? data.outcome
            : 'decision-recorded',
        },
      ];
    return [];
  });
}

export function readSessionEvents(file) {
  const data = readFileSync(file);
  const frames = [];
  for (let offset = 0; offset < data.length;) {
    const frame = zstdDecompressSync(data.subarray(offset), { info: true });
    if (frame.engine.bytesWritten === 0) throw new Error('Native Session frame did not advance');
    offset += frame.engine.bytesWritten;
    frames.push(frame.buffer);
  }
  return Buffer.concat(frames)
    .toString('utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [home, sessionId, destination] = process.argv.slice(2);
  if (!home || !identifier(sessionId) || !destination)
    throw new Error(
      'Usage: node scripts/export-private-input-evidence.mjs <isolated-DSH_HOME> <session-id> <output.json>',
    );
  const files = readdirSync(join(home, 'sessions'), {
    recursive: true,
    withFileTypes: true,
  }).filter(
    (entry) =>
      entry.isFile() &&
      entry.name === 'session.v4.jsonl.zstd' &&
      entry.parentPath.endsWith(sessionId),
  );
  if (files.length !== 1) throw new Error('Exactly one native Session artifact is required');
  const entry = files[0];
  const events = readSessionEvents(join(entry.parentPath, entry.name));
  const result = {
    source: 'DSH 0.2.0-rc.1 native Session Persistence',
    sessionId,
    nativeEventsRead: events.length - 1,
    omitted: [
      'Human/assistant text',
      'reasoning',
      'commands',
      'HTTP headers/bodies',
      'approval reasons',
      'paths',
      'raw values',
    ],
    events: projectPrivateInputEvents(events),
  };
  writeFileSync(destination, JSON.stringify(result, null, 2) + '\n');
  process.stdout.write(
    JSON.stringify({ exported: result.events.length, nativeEventsRead: result.nativeEventsRead }) +
      '\n',
  );
}
