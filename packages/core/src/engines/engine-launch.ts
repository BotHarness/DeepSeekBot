import { accessSync, constants, existsSync, statSync } from 'node:fs';
import { posix, win32 } from 'node:path';

export interface EngineLaunch {
  file: string;
  args: string[];
  windowsVerbatimArguments?: boolean;
}

export interface EngineLaunchOptions {
  platform?: NodeJS.Platform;
  env?: Readonly<Record<string, string | undefined>>;
  exists?(path: string): boolean;
  executable?(path: string): boolean;
}

function isExecutableFile(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false;
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function variable(env: Readonly<Record<string, string | undefined>>, name: string) {
  const key = Object.keys(env).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : env[key];
}

function resolveWindows(
  command: string,
  env: Readonly<Record<string, string | undefined>>,
  exists: (path: string) => boolean,
): string | undefined {
  const extensions = (variable(env, 'PATHEXT') ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean);
  const candidates = (base: string) =>
    win32.extname(base) === '' ? extensions.map((extension) => `${base}${extension}`) : [base];
  if (win32.isAbsolute(command) || command.includes('\\') || command.includes('/'))
    return candidates(command).find(exists);
  for (const directory of (variable(env, 'PATH') ?? '').split(';')) {
    if (directory === '') continue;
    const found = candidates(win32.join(directory, command)).find(exists);
    if (found !== undefined) return found;
  }
  return undefined;
}

export function resolveEngineCommand(
  command: string,
  options: EngineLaunchOptions = {},
): string | undefined {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const exists = options.exists ?? existsSync;
  const executable = options.executable ?? isExecutableFile;
  if (platform === 'win32') return resolveWindows(command, env, exists);
  if (command.includes('/'))
    return exists(command) && executable(command) ? posix.resolve(command) : undefined;
  for (const directory of (variable(env, 'PATH') ?? '').split(':')) {
    if (directory === '') continue;
    const candidate = posix.join(directory, command);
    if (exists(candidate) && executable(candidate)) return posix.resolve(candidate);
  }
  return undefined;
}

function quoteForCmd(value: string): string {
  if (value === '') return '""';
  if (!/[\s"&|<>^()%!,;=]/u.test(value)) return value;
  return `"${value.replaceAll('"', '\\"')}"`;
}

export function engineLaunch(
  command: string,
  args: readonly string[],
  options: EngineLaunchOptions = {},
): EngineLaunch {
  const platform = options.platform ?? process.platform;
  if (platform !== 'win32') return { file: command, args: [...args] };
  const env = options.env ?? process.env;
  const resolved = resolveWindows(command, env, options.exists ?? existsSync);
  if (resolved === undefined) return { file: command, args: [...args] };
  if (!/\.(cmd|bat)$/iu.test(resolved)) return { file: resolved, args: [...args] };
  const line = [resolved, ...args].map(quoteForCmd).join(' ');
  return {
    file:
      variable(env, 'ComSpec') ??
      win32.join(variable(env, 'SystemRoot') ?? 'C:\\Windows', 'System32', 'cmd.exe'),
    args: ['/d', '/s', '/c', `"${line}"`],
    windowsVerbatimArguments: true,
  };
}
