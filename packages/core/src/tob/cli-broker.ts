import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage } from 'node:http';
import { TOB_AGENT_COMMAND_USAGE } from '../bots/cli-agent-management.js';
import { TobError, type TobSetting } from './service.js';
import type {
  PrepareTobOperation,
  TobCliCapability,
  TobManagementProposal,
} from './cli-operations.js';

const NAMESPACE = 'botharness-client';
const FIELD = 'assignmentConcurrencyLimit';
const MAX_BODY_BYTES = 3 * 1024 * 1024;
const SMALL_BODY_BYTES = 16 * 1024;
const GROUP_AVATAR_BODY_BYTES = 256 * 1024;
const IMAGE_COMMANDS = new Set([
  'create',
  'bot-avatar-set',
  'bot-banner-set',
  'bot-appearance-set',
  'group-avatar-set',
]);
const CODES = new Set([
  'tob-authority-required',
  'human-dm-required',
  'stale-setting',
  'invalid-setting',
  'settings-unavailable',
  'setting-outcome-uncertain',
  'setting-readback-mismatch',
  'approval-denied',
  'approval-unavailable',
  'approval-cancelled',
  'approval-authority-changed',
  'agent-context-expired',
  'operation-cancelled',
  'operation-failed',
  'operation-in-progress',
  'unsupported-command',
  'invalid-request',
  'invalid-input',
  'unsupported-setting',
  'stale-revision',
  'request-too-large',
  'unauthorized',
  'stale-model',
  'model-unavailable',
  'unknown-bot',
  'unknown-preset',
  'model-plan-required',
  'preset-name-conflict',
  'legacy-model-repair-required',
  'telemetry-locked',
  'maintenance-unavailable',
  'confirmation-required',
  'restart-not-pending',
  'operation-outcome-uncertain',
  'readback-mismatch',
  'protected-bot',
  'stale-profile',
  'archived-bot',
  'unknown-channel',
  'not-group-channel',
  'not-group-member',
  'channel-access-denied',
  'operation-key-conflict',
  'channel-operation-unavailable',
  'stale-channel',
  'group-invite-unavailable',
  'invitation-not-pending',
  'join-request-not-pending',
  'unknown-invitation',
  'unknown-join-request',
  'channel-outcome-uncertain',
  'creation-key-conflict',
  'invalid-operation-key',
  'creation-identity-unavailable',
  'creation-dm-unavailable',
  'creation-memory-conflict',
  'invalid-create-scope',
  'creation-outcome-uncertain',
  'creation-recovery-required',
  'creation-target-unavailable',
  'git-not-found',
  'memory-unavailable',
  'invalid-memory-dir',
]);

export interface TobCliProposal {
  readonly ns: typeof NAMESPACE;
  readonly patch: Readonly<{ assignmentConcurrencyLimit: number }>;
  readonly expectedRevision: number;
  readonly previousValue: Readonly<{ assignmentConcurrencyLimit: number }>;
}
export type TobCliWriteProposal = TobCliProposal | TobManagementProposal;

export interface TobCliBrokerOptions {
  signal: AbortSignal;
  log?(phase: string, details: Record<string, string | number>): void;
  authorize(): void;
  readSetting(): TobSetting;
  writeSetting(value: number, expectedRevision: number, authorize: () => void): Promise<TobSetting>;
  approve(input: TobCliWriteProposal, signal: AbortSignal): Promise<void | (() => void)>;
  prepareOperation?: PrepareTobOperation;
  capabilities?: readonly TobCliCapability[];
  beforeWrite?(): void;
}
export interface TobCliBroker {
  endpoint: string;
  token: string;
  close(): Promise<void>;
}

function refuse(code: string): never {
  throw new TobError(code);
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse('invalid-request');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, expected: string[]): void {
  if (
    Object.keys(value).length !== expected.length ||
    expected.some((key) => !Object.hasOwn(value, key))
  )
    refuse('invalid-request');
}
function setting(value: unknown): number {
  const input = object(value);
  keys(input, [FIELD]);
  const n = input[FIELD];
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > 32) refuse('invalid-setting');
  return n;
}
function proposal(args: Record<string, unknown>): TobCliProposal {
  keys(args, ['ns', 'patch', 'expectedRevision', 'previousValue']);
  if (args.ns !== NAMESPACE) refuse('unsupported-command');
  const value = setting(args.patch),
    previous = setting(args.previousValue);
  if (
    typeof args.expectedRevision !== 'number' ||
    !Number.isSafeInteger(args.expectedRevision) ||
    args.expectedRevision < 0
  )
    refuse('invalid-setting');
  return Object.freeze({
    ns: NAMESPACE,
    patch: Object.freeze({ assignmentConcurrencyLimit: value }),
    expectedRevision: args.expectedRevision,
    previousValue: Object.freeze({ assignmentConcurrencyLimit: previous }),
  });
}
function view(setting: TobSetting) {
  return {
    scope: 'global' as const,
    ns: NAMESPACE,
    revision: setting.revision,
    value: { assignmentConcurrencyLimit: setting.value },
  };
}
async function body(request: IncomingMessage): Promise<{ value: unknown; bytes: number }> {
  let length = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > MAX_BODY_BYTES) refuse('request-too-large');
    chunks.push(bytes);
  }
  try {
    return { value: JSON.parse(Buffer.concat(chunks).toString('utf8')), bytes: length };
  } catch {
    return refuse('invalid-request');
  }
}
function codeOf(error: unknown, fallback = 'operation-failed'): string {
  if (error instanceof TobError && CODES.has(error.code)) return error.code;
  return fallback;
}
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new TobError('operation-cancelled'));
    if (signal.aborted) {
      abort();
      return;
    }
    signal.addEventListener('abort', abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

export async function startTobCliBroker(options: TobCliBrokerOptions): Promise<TobCliBroker> {
  if (options.signal.aborted) refuse('operation-cancelled');
  const log = (phase: string, details: Record<string, string | number> = {}) => {
    try {
      options.log?.(phase, details);
    } catch {}
  };
  const token = randomBytes(32).toString('base64url');
  const expectedAuth = Buffer.from('Bearer ' + token);
  const lifetime = new AbortController();
  let writing = false;
  const server = createServer(async (request, response) => {
    const cancellation = new AbortController();
    const signal = AbortSignal.any([options.signal, lifetime.signal, cancellation.signal]);
    const abortRequest = () => cancellation.abort();
    request.once('aborted', abortRequest);
    response.once('close', abortRequest);
    const authorize = () => {
      if (signal.aborted) refuse('operation-cancelled');
      options.authorize();
    };
    try {
      const actualAuth = Buffer.from(request.headers.authorization ?? '');
      if (actualAuth.length !== expectedAuth.length || !timingSafeEqual(actualAuth, expectedAuth))
        refuse('unauthorized');
      if (request.method !== 'POST' || request.url !== '/invoke') refuse('invalid-request');
      if (request.headers['content-type']?.split(';')[0]?.trim() !== 'application/json')
        refuse('invalid-request');
      authorize();
      const received = await body(request);
      const input = object(received.value);
      keys(input, ['command', 'args']);
      const commandBodyLimit =
        input.command === 'group-avatar-set'
          ? GROUP_AVATAR_BODY_BYTES
          : IMAGE_COMMANDS.has(String(input.command))
            ? MAX_BODY_BYTES
            : SMALL_BODY_BYTES;
      if (received.bytes > commandBodyLimit) refuse('request-too-large');
      const args = object(input.args);
      authorize();
      let value: unknown;
      if (input.command === 'capabilities') {
        keys(args, []);
        value = {
          scope: 'global',
          ns: NAMESPACE,
          fields: {
            assignmentConcurrencyLimit: { type: 'integer', minimum: 1, maximum: 32 },
            ...(options.capabilities
              ? {
                  developerMode: { type: 'boolean' },
                  showBotSessions: { type: 'boolean' },
                  showApprovalReviewSessions: { type: 'boolean' },
                }
              : {}),
          },
          commands: options.capabilities
            ? ['capabilities', ...options.capabilities.map((entry) => entry.command)]
            : ['capabilities', 'settings', 'settings-set'],
          ...(options.capabilities
            ? {
                operations: options.capabilities.map((entry) => ({
                  ...entry,
                  usage:
                    TOB_AGENT_COMMAND_USAGE[entry.command] ??
                    (entry.command === 'settings'
                      ? 'deepseekbot settings [botharness-client|agent-default-model]'
                      : 'deepseekbot settings-set <namespace> --patch-stdin --expected-revision <observed revision> --previous-value <JSON of previous values for patched fields>'),
                })),
              }
            : {}),
          examples: [
            'deepseekbot settings botharness-client',
            'printf \'%s\' "$PATCH_JSON" | deepseekbot settings-set botharness-client --patch-stdin --expected-revision "$REVISION" --previous-value "$PREVIOUS_JSON"',
          ],
          write: {
            ...(options.capabilities
              ? {
                  rule: 'Read the current target and pass its observed revision; follow each command usage. Settings patches also require exact previous values for patched fields.',
                  maintenance:
                    'Installation and restart require --confirm plus a fresh Human decision. Never retry an uncertain maintenance write automatically.',
                }
              : { required: ['ns', 'patch', 'expectedRevision', 'previousValue'] }),
            approval: 'existing-host-policy',
            scope: 'current-human-dm-shell',
          },
          errors: [...CODES],
        };
      } else if (options.prepareOperation) {
        if (typeof input.command !== 'string') refuse('invalid-request');
        const prepared = await options.prepareOperation(input.command, args);
        authorize();
        if (!prepared) refuse('unsupported-command');
        if (prepared.proposal) {
          if (writing) refuse('operation-in-progress');
          writing = true;
          try {
            const reviewGuard = await abortable(options.approve(prepared.proposal, signal), signal);
            const guard = () => {
              authorize();
              reviewGuard?.();
            };
            guard();
            value = await prepared.run(guard, options.beforeWrite);
          } finally {
            writing = false;
          }
        } else {
          value = await prepared.run(authorize);
        }
      } else if (input.command === 'settings') {
        keys(args, ['ns']);
        if (args.ns !== NAMESPACE) refuse('unsupported-command');
        value = view(options.readSetting());
      } else if (input.command === 'settings-set') {
        const operation = proposal(args);
        if (writing) refuse('operation-in-progress');
        writing = true;
        let reviewGuard: void | (() => void);
        const validate = () => {
          authorize();
          reviewGuard?.();
          const current = options.readSetting();
          if (
            current.revision !== operation.expectedRevision ||
            current.value !== operation.previousValue.assignmentConcurrencyLimit
          )
            refuse('stale-setting');
        };
        try {
          validate();
          try {
            reviewGuard = await abortable(options.approve(operation, signal), signal);
          } catch (error) {
            throw new TobError(
              codeOf(error, signal.aborted ? 'operation-cancelled' : 'approval-denied'),
            );
          }
          validate();
          log('approved', {
            namespace: NAMESPACE,
            previousValue: operation.previousValue.assignmentConcurrencyLimit,
            value: operation.patch.assignmentConcurrencyLimit,
            revision: operation.expectedRevision,
          });
          value = view(
            await options.writeSetting(
              operation.patch.assignmentConcurrencyLimit,
              operation.expectedRevision,
              validate,
            ),
          );
        } finally {
          writing = false;
        }
      } else refuse('unsupported-command');
      log('completed', { command: String(input.command) });
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: true, value }));
    } catch (error) {
      if (!response.destroyed) {
        const code = codeOf(error);
        log('refused', { code });
        response.writeHead(
          code === 'unauthorized' ? 401 : code === 'request-too-large' ? 413 : 400,
          { 'content-type': 'application/json', 'cache-control': 'no-store' },
        );
        response.end(JSON.stringify({ ok: false, error: { code, message: code } }));
      }
    } finally {
      request.off('aborted', abortRequest);
      response.off('close', abortRequest);
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  let closed: Promise<void> | undefined;
  const close = (): Promise<void> => {
    if (!closed) {
      lifetime.abort();
      log('closed');
      options.signal.removeEventListener('abort', onAbort);
      closed = new Promise((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
    return closed;
  };
  const onAbort = () => {
    void close();
  };
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  options.signal.addEventListener('abort', onAbort, { once: true });
  if (options.signal.aborted) {
    await close();
    refuse('operation-cancelled');
  }
  const address = server.address();
  if (!address || typeof address === 'string') {
    await close();
    refuse('operation-failed');
  }
  log('started');
  return { endpoint: `http://127.0.0.1:${address.port}`, token, close };
}
