import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const DEFAULT_URL = 'https://go.tobs.app';

export interface StoredConfig {
  token?: string;
  url?: string;
}

export interface ResolvedConfig {
  url: string;
  token: string | undefined;
  tokenSource: 'env' | 'file' | undefined;
  file: string;
}

export function configPath(env: NodeJS.ProcessEnv = process.env): string {
  const base = env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config');
  return join(base, 'botharness', 'links.json');
}

export async function readStoredConfig(file: string): Promise<StoredConfig> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
  const parsed = JSON.parse(text) as unknown;
  if (typeof parsed !== 'object' || parsed === null) return {};
  const { token, url } = parsed as Record<string, unknown>;
  return {
    ...(typeof token === 'string' && token ? { token } : {}),
    ...(typeof url === 'string' && url ? { url } : {}),
  };
}

export async function resolveConfig(
  env: NodeJS.ProcessEnv = process.env,
  file: string = configPath(env),
): Promise<ResolvedConfig> {
  const stored = await readStoredConfig(file);
  const envToken = env.BH_LINKS_TOKEN?.trim();
  const token = envToken || stored.token;
  return {
    url: env.BH_LINKS_URL?.trim() || stored.url || DEFAULT_URL,
    token,
    tokenSource: envToken ? 'env' : stored.token ? 'file' : undefined,
    file,
  };
}

export async function writeStoredConfig(file: string, config: StoredConfig): Promise<void> {
  await mkdir(dirname(file), { recursive: true, mode: 0o700 });
  await writeFile(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  await chmod(file, 0o600);
}

export function maskToken(token: string): string {
  return `${token.slice(0, 12)}…`;
}
