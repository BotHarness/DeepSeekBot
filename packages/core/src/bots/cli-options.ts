import { BOT_CLI_OPTIONS } from './cli-option-spec.js';
import { parseArgs } from 'node:util';

export function parseBotCliArgs(argv: readonly string[]) {
  return parseArgs({
    args: [...argv],
    options: BOT_CLI_OPTIONS,
    allowPositionals: true,
    strict: true,
  });
}
