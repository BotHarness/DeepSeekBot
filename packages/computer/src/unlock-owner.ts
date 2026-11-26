import { readFile, stat } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COMPUTER_UNLOCK_BODY_LIMIT,
  COMPUTER_UNLOCK_TIMEOUT_MS,
  opaqueUnlockPacket,
  parseComputerUnlockReply,
  type ComputerUnlockCaller,
  type ComputerUnlockCommand,
  type ComputerUnlockOwner,
  type ComputerUnlockReply,
} from './unlock-contract.js';

export const macComputerUnlockConfigured =
  process.platform === 'darwin' && process.env.BOTHARNESS_COMPUTER_UNLOCK === '1';

function parseCommand(value: unknown): ComputerUnlockCommand | undefined {
  if (!value || typeof value !== 'object' || !('kind' in value)) return;
  const fields = Object.keys(value).length;
  if (value.kind === 'status' && fields === 1) return { kind: 'status' };
  if (!('operation' in value) || (value.operation !== 'verify' && value.operation !== 'unlock'))
    return;
  if (value.kind === 'begin' && fields === 2) return { kind: 'begin', operation: value.operation };
  if (
    value.kind === 'finish' &&
    fields === 3 &&
    'packet' in value &&
    opaqueUnlockPacket(value.packet, 5464)
  )
    return { kind: 'finish', operation: value.operation, packet: value.packet };
}

export function createComputerUnlockOwner(options: {
  enabled(): boolean;
  runUnlock(
    operation: (signal: AbortSignal) => Promise<ComputerUnlockReply>,
    signal: AbortSignal,
  ): Promise<ComputerUnlockReply>;
  audit(device: string, result: ComputerUnlockReply['code']): void;
  native?: (
    command: ComputerUnlockCommand,
    caller?: ComputerUnlockCaller,
    signal?: AbortSignal,
  ) => Promise<ComputerUnlockReply>;
}): ComputerUnlockOwner {
  const native = options.native ?? sendToAgent;
  const status = async () => {
    if (!options.enabled()) return { code: 'unavailable' } as const;
    const { code, locked } = await native({ kind: 'status' });
    return { code, ...(locked === undefined ? {} : { locked }) };
  };
  return {
    status,
    async handle(caller, value, signal) {
      if (!options.enabled()) return { code: 'unavailable' };
      if (signal.aborted) return { code: 'cancelled' };
      const command = parseCommand(value);
      if (!command) return { code: 'invalid' };
      if (command.kind === 'status') return status();
      const submit = command.kind === 'finish' && command.operation === 'unlock';
      const forward = (attempt: AbortSignal) => native(command, caller, attempt);
      try {
        const result = submit ? await options.runUnlock(forward, signal) : await forward(signal);
        if (submit) options.audit(caller.device, result.code);
        return result;
      } catch {
        const code = signal.aborted ? 'cancelled' : 'unavailable';
        if (submit) options.audit(caller.device, code);
        return { code };
      }
    },
  };
}

async function sendToAgent(
  command: ComputerUnlockCommand,
  caller?: ComputerUnlockCaller,
  signal?: AbortSignal,
): Promise<ComputerUnlockReply> {
  const directory = join(
    homedir(),
    'Library',
    'Application Support',
    'BotHarness',
    'ComputerUnlock',
  );
  const tokenPath = join(directory, 'ipc-token');
  try {
    const info = await stat(tokenPath);
    if (
      !info.isFile() ||
      info.size !== 32 ||
      info.uid !== process.getuid?.() ||
      (info.mode & 0o077) !== 0
    )
      return { code: 'unavailable' };
    const token = await readFile(tokenPath);
    if (signal?.aborted) return { code: 'cancelled' };
    return await new Promise<ComputerUnlockReply>((resolve) => {
      const socket = createConnection(join(tmpdir(), 'botharness-computer-unlock.sock'));
      let result = '';
      const finish = (reply: ComputerUnlockReply) => {
        socket.destroy();
        clearTimeout(timer);
        signal?.removeEventListener('abort', cancel);
        resolve(reply);
      };
      const cancel = () => finish({ code: 'cancelled' });
      const unavailable = () => finish({ code: 'unavailable' });
      const timer = setTimeout(
        unavailable,
        command.kind === 'finish' ? COMPUTER_UNLOCK_TIMEOUT_MS - 500 : 1500,
      );
      signal?.addEventListener('abort', cancel, { once: true });
      socket.once('connect', () => {
        socket.write(
          JSON.stringify({ ...command, ...caller, token: token.toString('base64') }) + '\n',
        );
      });
      socket.once('error', unavailable);
      socket.once('close', unavailable);
      socket.setEncoding('utf8').on('data', (part: string) => {
        result += part;
        if (result.length > COMPUTER_UNLOCK_BODY_LIMIT) return unavailable();
        if (!result.endsWith('\n')) return;
        try {
          finish(parseComputerUnlockReply(JSON.parse(result) as unknown));
        } catch {
          unavailable();
        }
      });
    });
  } catch {
    return { code: 'unavailable' };
  }
}
