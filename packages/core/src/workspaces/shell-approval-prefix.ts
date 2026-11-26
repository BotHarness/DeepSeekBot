import { isAbsolute, sep } from 'node:path';
import type { WireShellApprovalSuggestions } from '@botharness/host-protocol/wire';

const OPAQUE_RUNNERS = new Set([
  'sh',
  'bash',
  'zsh',
  'env',
  'sudo',
  'xargs',
  'eval',
  'exec',
  'ssh',
  'command',
  'builtin',
  'source',
  '.',
  'timeout',
  'nice',
  'nohup',
  'time',
  'stdbuf',
]);
const INTERPRETER_RUNNERS = new Set([
  'npx',
  'bunx',
  'uvx',
  'docker',
  'python',
  'python3',
  'node',
  'deno',
  'perl',
  'ruby',
  'php',
]);
const INTERPRETER_SUBCOMMANDS = new Set(['docker exec', 'docker run']);
const PACKAGE_RUNNERS = new Set([
  'pnpm dlx',
  'pnpm exec',
  'npm exec',
  'npm x',
  'yarn dlx',
  'yarn exec',
  'bun x',
  'uv run',
  'pipx run',
]);
const SHELL_SYNTAX = new Set([
  '!',
  'if',
  'then',
  'else',
  'elif',
  'fi',
  'for',
  'while',
  'until',
  'do',
  'done',
  'case',
  'esac',
  'in',
  'select',
  'function',
  'coproc',
]);
const SHELL_STATE = new Set([
  '.',
  'source',
  'alias',
  'unalias',
  'set',
  'shopt',
  'unset',
  'export',
  'declare',
  'typeset',
  'readonly',
  'local',
  'cd',
  'pushd',
  'popd',
  'hash',
  'enable',
  'trap',
  'read',
  'readarray',
  'mapfile',
  'eval',
  'let',
  'getopts',
  'builtin',
  'command',
]);
const FIND_ACTIONS = new Set(['-exec', '-execdir', '-ok', '-okdir', '-delete']);
export const MAX_SHELL_PREFIX_PATTERNS = 5;

type Word = { value: string; plain: boolean };
export type ShellSubcommand = { text: string; words: Word[] };

const executableName = (word: string) => word.slice(word.lastIndexOf('/') + 1).toLowerCase();
const horizontalSpace = (char: string) => char === ' ' || char === '\t';
const separator = (char: string) => char === '\n' || ';&|'.includes(char);
const assignment = (word: Word) => /^[A-Za-z_][A-Za-z0-9_]*\+?=/u.test(word.value);

function readWord(command: string, start: number): { word: Word; end: number } | undefined {
  let value = '';
  let quote = '';
  let plain = true;
  let end = start;
  for (; end < command.length; end++) {
    const char = command.charAt(end);
    if (!quote && (horizontalSpace(char) || separator(char))) break;
    if (quote === "'") {
      if (char === quote) quote = '';
      else value += char;
    } else if (char === quote) {
      quote = '';
    } else if (!quote && (char === '"' || char === "'")) {
      quote = char;
      plain = false;
    } else if ('`$\\'.includes(char) || (!quote && '(){}<>*?[]~#'.includes(char))) {
      return undefined;
    } else {
      value += char;
    }
  }
  if (quote) return undefined;
  return { word: { value, plain }, end };
}

export function parseShellApprovalCommand(command: string): ShellSubcommand[] | undefined {
  if (/\$\(|`|[<>]\(/u.test(command)) return undefined;
  if (command.length > 65_536 || /[\u0000-\u0008\u000b-\u001f\u007f]/u.test(command))
    return undefined;
  const parts: ShellSubcommand[] = [];
  let i = 0;
  let needsCommand = false;
  while (i < command.length) {
    const char = command.charAt(i);
    if (horizontalSpace(char) || char === '\n') {
      i++;
      continue;
    }
    if (separator(char)) return undefined;
    const start = i;
    let end = start;
    const words: Word[] = [];
    while (i < command.length && !separator(command.charAt(i))) {
      if (horizontalSpace(command.charAt(i))) {
        i++;
        continue;
      }
      const parsed = readWord(command, i);
      if (!parsed) return undefined;
      words.push(parsed.word);
      end = i = parsed.end;
    }
    const first = words[0];
    if (!first || (first.plain && SHELL_SYNTAX.has(first.value))) return undefined;
    parts.push({ text: command.slice(start, end), words });
    const operator = command.charAt(i);
    const next = command.charAt(i + 1);
    needsCommand = operator === '|' || (operator === '&' && next === '&');
    i +=
      (operator === '|' && (next === '|' || next === '&')) || (operator === '&' && next === '&')
        ? 2
        : 1;
  }
  if (needsCommand || parts.length === 0) return undefined;
  if (
    parts.length > 1 &&
    parts.some(({ words }) => {
      const program = words.find((word) => !assignment(word));
      return (
        !program ||
        SHELL_STATE.has(program.value) ||
        (program.value === 'printf' && words[1]?.value === '-v') ||
        (program.plain &&
          program.value === 'time' &&
          words.some((word) => SHELL_STATE.has(word.value) || word.value === 'printf'))
      );
    })
  )
    return undefined;
  return parts;
}

function stdbufOptions(words: Word[], start: number): number | undefined {
  let i = start;
  while (words[i]?.value.startsWith('-')) {
    const option = words[i]?.value ?? '';
    const mode = /^(?:-[ioe](.*)|--(?:input|output|error)(?:=(.*))?)$/u.exec(option);
    if (!mode) return undefined;
    i++;
    const value = mode[1] || mode[2] || words[i++]?.value;
    if (!value || !/^(?:[LU]|\d+(?:[KMGTPEZY](?:B)?)?)$/u.test(value)) return undefined;
  }
  return i === start ? undefined : i;
}

function prefixWords(part: ShellSubcommand): Word[] | undefined {
  const { words } = part;
  let i = 0;
  while (i < words.length) {
    const word = words[i];
    if (!word || assignment(word)) return undefined;
    if (!word.plain) break;
    switch (word.value) {
      case 'timeout':
        if (!/^\d+(?:\.\d+)?[smhd]?$/u.test(words[i + 1]?.value ?? '')) return undefined;
        i += 2;
        continue;
      case 'nice':
        if (words[i + 1]?.value === '-n') {
          if (!/^-?\d+$/u.test(words[i + 2]?.value ?? '')) return undefined;
          i += 3;
        } else {
          i++;
        }
        continue;
      case 'stdbuf': {
        const next = stdbufOptions(words, i + 1);
        if (next === undefined) return undefined;
        i = next;
        continue;
      }
      case 'time':
      case 'nohup':
        i++;
        continue;
      default:
        break;
    }
    break;
  }
  const program = words[i];
  if (
    !program ||
    !program.value ||
    program.value.startsWith('-') ||
    SHELL_SYNTAX.has(program.value)
  )
    return undefined;
  const unwrapped = words.slice(i);
  if (
    executableName(program.value) === 'find' &&
    unwrapped.some((word) => FIND_ACTIONS.has(word.value))
  )
    return undefined;
  return unwrapped;
}

export type ShellPrefixError = {
  code: 'invalid-shell-prefix' | 'unsafe-shell-prefix-runner' | 'shell-prefix-mismatch';
  message: string;
};

type Pattern = { ok: true; words: string[] } | { ok: false; error: ShellPrefixError };

export function parseShellPrefix(pattern: string): Pattern {
  const invalid: Pattern = {
    ok: false,
    error: {
      code: 'invalid-shell-prefix',
      message: 'Use a Shell command prefix followed by a single space and *.',
    },
  };
  if (!pattern.endsWith(' *') || pattern.indexOf('*') !== pattern.length - 1) return invalid;
  const head = pattern.slice(0, -2);
  if (head.trim() !== head) return invalid;
  const parts = parseShellApprovalCommand(head);
  const part = parts?.[0];
  if (
    !part ||
    parts?.length !== 1 ||
    part.text !== head ||
    prefixWords(part)?.length !== part.words.length
  )
    return invalid;
  const words = part.words.map((word) => word.value);
  const runner = executableName(words[0] ?? '');
  const second = words[1]?.toLowerCase() ?? '';
  if (
    OPAQUE_RUNNERS.has(runner) ||
    (INTERPRETER_RUNNERS.has(runner) &&
      (words.length === 1 ||
        second.startsWith('-') ||
        second.includes('=') ||
        INTERPRETER_SUBCOMMANDS.has(runner + ' ' + second))) ||
    (words.length === 2 && PACKAGE_RUNNERS.has(runner + ' ' + second))
  ) {
    return {
      ok: false,
      error: {
        code: 'unsafe-shell-prefix-runner',
        message: 'This prefix would allow arbitrary code through a command runner.',
      },
    };
  }
  return { ok: true, words };
}

function matchesPrefixWords(words: Word[], pattern: string[]): boolean {
  const runner = executableName(words[0]?.value ?? '') + ' ' + words[1]?.value.toLowerCase();
  return (
    (pattern.length > 2 || !PACKAGE_RUNNERS.has(runner)) &&
    pattern.every((word, index) => words[index]?.value === word)
  );
}

export function matchesShellPrefix(part: ShellSubcommand, pattern: Pattern): boolean {
  if (!pattern.ok) return false;
  const words = prefixWords(part);
  return words !== undefined && matchesPrefixWords(words, pattern.words);
}

export function shellApprovalSuggestions(command: string): WireShellApprovalSuggestions {
  const parts = parseShellApprovalCommand(command);
  return {
    exact: command,
    compound: (parts?.length ?? 0) > 1,
    unparseable: parts === undefined,
    subcommands: (parts ?? []).slice(0, MAX_SHELL_PREFIX_PATTERNS).map((part) => {
      const words = prefixWords(part);
      const first = words?.[0];
      const second = words?.[1];
      const one = first?.plain ? first.value + ' *' : undefined;
      const two =
        first?.plain && second?.plain && /^[\p{L}\p{N}_][\p{L}\p{N}_:-]*$/u.test(second.value)
          ? first.value + ' ' + second.value + ' *'
          : undefined;
      return {
        exact: part.text,
        ...(one && matchesShellPrefix(part, parseShellPrefix(one)) ? { oneWordPrefix: one } : {}),
        ...(two && matchesShellPrefix(part, parseShellPrefix(two)) ? { twoWordPrefix: two } : {}),
      };
    }),
  };
}

export function checkShellPrefixPatterns(
  command: string,
  patterns: string[],
): ShellPrefixError | undefined {
  const parts = parseShellApprovalCommand(command);
  let next = 0;
  for (const text of patterns) {
    const pattern = parseShellPrefix(text);
    if (!pattern.ok) return pattern.error;
    let part = parts?.[next];
    while (part && !matchesShellPrefix(part, pattern)) part = parts?.[++next];
    if (!part) {
      return {
        code: 'shell-prefix-mismatch',
        message: 'Each prefix must match a distinct pending Shell subcommand in command order.',
      };
    }
    next++;
  }
  return undefined;
}

export function shellApprovalInput(
  toolName: string,
  input: string,
): ({ command: string } & Record<string, unknown>) | undefined {
  if (toolName !== 'bash' && (toolName !== 'shell' || process.platform === 'win32'))
    return undefined;
  try {
    const args: unknown = JSON.parse(input);
    if (
      typeof args === 'object' &&
      args !== null &&
      'command' in args &&
      typeof args.command === 'string'
    )
      return { ...args, command: args.command };
  } catch {
    return undefined;
  }
}

export function shellPrefixScope(
  scopeKey: string,
  cwd: string,
  args: ReturnType<typeof shellApprovalInput>,
): string | undefined {
  if (!args) return undefined;
  if (args['workdir'] !== undefined && args['cwd'] !== undefined) return undefined;
  const override = args['workdir'] === undefined ? args['cwd'] : args['workdir'];
  if (override !== undefined && (typeof override !== 'string' || override.length === 0))
    return undefined;
  const directory =
    override === undefined ? cwd : isAbsolute(override) ? override : cwd + sep + override;
  return JSON.stringify([scopeKey, directory]);
}

export function shellExactOptions(
  args: NonNullable<ReturnType<typeof shellApprovalInput>>,
): string {
  return JSON.stringify(
    Object.keys(args)
      .filter((key) => !['command', 'description', 'justification', 'reason'].includes(key))
      .sort()
      .map((key) => [key, args[key]]),
  );
}
