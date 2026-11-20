import { realpathSync } from 'node:fs';
import { basename, isAbsolute, join, resolve } from 'node:path';

export const CREDENTIAL_STORE_FILE = '.credentials.yaml';
const FILE_TOOLS = new Set(['read', 'write', 'edit', 'glob', 'grep', 'read_image']);
const PATH_KEYS = ['path', 'file_path', 'filePath', 'pattern', 'cwd', 'directory'];

function canonical(path: string): string {
  try {
    return realpathSync(path);
  } catch {
    return resolve(path);
  }
}

function strings(value: unknown): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return PATH_KEYS.flatMap((key) => {
    const entry = (value as Record<string, unknown>)[key];
    return typeof entry === 'string' ? [entry] : [];
  });
}

export function credentialStoreDenial(
  name: string,
  args: unknown,
  dshHome: string,
  cwd?: string,
): string | undefined {
  const home = canonical(dshHome);
  const store = join(home, CREDENTIAL_STORE_FILE);
  if (name === 'bash' || name === 'pwsh') {
    const command =
      typeof args === 'object' && args !== null && 'command' in args ? args.command : undefined;
    if (typeof command !== 'string') return undefined;
    return command.includes('.credentials') ||
      /\.cred[\w-]*[*?[]/.test(command) ||
      command.includes(store) ||
      (basename(dshHome).length > 0 &&
        new RegExp(`${escape(home)}/?(\\s|$|["'*])`).test(command) &&
        !literalOutputCommand(name, command))
      ? 'The native credential store is not available to Agent commands; ask for a secret with ask_secret and use it through a protected consumer'
      : undefined;
  }
  if (!FILE_TOOLS.has(name)) return undefined;
  for (const value of strings(args)) {
    const target = canonical(isAbsolute(value) ? value : resolve(cwd ?? home, value));
    if (
      target === store ||
      target === home ||
      value.includes(CREDENTIAL_STORE_FILE) ||
      basename(target) === CREDENTIAL_STORE_FILE
    )
      return 'The native credential store is not available to Agent file tools; ask for a secret with ask_secret and use it through a protected consumer';
  }
  return undefined;
}

function literalOutputCommand(shell: string, command: string): boolean {
  if (/[\r\n\u2018\u2019\u201c\u201d]/.test(command)) return false;
  const output = shell === 'bash' ? '(?:echo|printf)' : '(?:echo|Write-Output)';
  const argument = String.raw`(?:'[^'\r\n]*'|"[^"\x60$\\\r\n]*"|[a-zA-Z0-9_./:=+%,-]+)`;
  return new RegExp(
    `^[ \\t]*${output}(?:[ \\t]+${argument})*[ \\t]*$`,
    shell === 'pwsh' ? 'i' : '',
  ).test(command);
}

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function credentialStorePath(dshHome: string): string {
  return join(canonical(dshHome), CREDENTIAL_STORE_FILE);
}

export function denyStoreRead<T extends { argv: string[] }>(confined: T, store: string): T {
  const argv = confined.argv;
  const runner = basename(argv[0] ?? '');
  if (runner === 'sandbox-exec' && argv[1] === '-p' && typeof argv[2] === 'string') {
    const rule = `(deny file-read* (literal ${JSON.stringify(store)}))`;
    if (argv[2].includes(rule)) return confined;
    return { ...confined, argv: [argv[0]!, '-p', `${argv[2]} ${rule}`, ...argv.slice(3)] };
  }
  if (runner === 'bwrap') {
    const separator = argv.indexOf('--');
    if (separator < 0) return confined;
    return {
      ...confined,
      argv: [
        ...argv.slice(0, separator),
        '--ro-bind-try',
        '/dev/null',
        store,
        ...argv.slice(separator),
      ],
    };
  }
  return confined;
}
