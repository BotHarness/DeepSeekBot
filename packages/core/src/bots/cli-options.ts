import { BOT_CLI_OPTIONS } from './cli-option-spec.js';
import { parseArgs } from 'node:util';

export const PAIRING_RECEIPT = /^[A-Za-z0-9_-]{12}$/u;
export const DEVICE_PUBLIC_KEY_BASE64URL = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/u;
const DEVICE_ID = /^[A-Za-z0-9_-]{21}[AQgw]$/u;
const PAIRING_HOST_ID = /^[A-Za-z0-9_-]{16}$/u;
const DEVICE_POSITIONALS = new Map<string, readonly (RegExp | undefined)[]>([
  ['device-approve-key', [PAIRING_RECEIPT, DEVICE_PUBLIC_KEY_BASE64URL]],
  ['device-offer-status', [PAIRING_RECEIPT]],
  ['device-revoke', [DEVICE_ID]],
  ['bot-lan', [undefined, PAIRING_HOST_ID]],
  ['connection-host', [PAIRING_HOST_ID, undefined, DEVICE_ID]],
]);

export function parseBotCliArgs(argv: readonly string[]) {
  const args = [...argv];
  const config = {
    args,
    options: BOT_CLI_OPTIONS,
    allowPositionals: true,
    strict: true,
  } as const;
  if (!argv.some((arg) => DEVICE_POSITIONALS.has(arg))) return parseArgs(config);

  const { tokens } = parseArgs({ ...config, strict: false, tokens: true });
  const command = tokens.find((token) => token.kind === 'positional');
  const shapes = command && DEVICE_POSITIONALS.get(command.value);
  if (!command || !shapes) return parseArgs(config);

  let slot = 0;
  for (const token of tokens) {
    if (token.index <= command.index) continue;
    if (token.kind === 'positional') {
      slot++;
    } else if (token.kind === 'option') {
      const arg = args[token.index];
      if (
        arg !== undefined &&
        arg.startsWith('-') &&
        shapes[slot]?.test(arg) &&
        !(token.rawName === arg && Object.hasOwn(BOT_CLI_OPTIONS, token.name))
      ) {
        args[token.index] = `_${arg}`;
        slot++;
      }
    }
  }

  const parsed = parseArgs({ ...config, tokens: true });
  return {
    values: parsed.values,
    positionals: parsed.tokens.flatMap((token) =>
      token.kind === 'positional' ? [argv[token.index] ?? token.value] : [],
    ),
  };
}
