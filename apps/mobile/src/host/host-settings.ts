import { MethodRefused } from '@botharness/host-client/client';

export type SettingsNamespace = {
  ns: string;
  schema?: unknown;
  value: Record<string, unknown>;
  user?: Record<string, unknown>;
  revision: number;
  secrets?: { path: string[]; set: boolean }[];
  writable?: boolean;
  base?: unknown;
  applies?: unknown;
  autoGenerate?: unknown;
};

export type SettingsDescribe = {
  writable: boolean;
  hasDocument: boolean;
  namespaces: SettingsNamespace[];
};

export type HostClient = {
  call: <T>(
    method: string,
    args?: Record<string, unknown>,
    via?: string,
    opts?: { raw?: boolean },
  ) => Promise<T>;
};

export function describeSettings(client: HostClient): Promise<SettingsDescribe> {
  return client.call<SettingsDescribe>('settings/describe', {});
}

export type SettingsWriteFailure =
  | { kind: 'conflict'; expected: number; actual: number }
  | { kind: 'rejected'; message: string }
  | { kind: 'refused' };

export function settingsFailure(error: unknown): SettingsWriteFailure | undefined {
  if (!(error instanceof MethodRefused)) return undefined;
  if (error.code === 'settings/conflict') {
    const d = (error.details ?? {}) as { expected?: unknown; actual?: unknown };
    return { kind: 'conflict', expected: Number(d.expected), actual: Number(d.actual) };
  }
  if (error.code === 'settings/rejected') return { kind: 'rejected', message: error.message };
  if (error.code === 'secret-route-refused') return { kind: 'refused' };
  return undefined;
}

export async function updateSettings(
  client: HostClient,
  ns: string,
  patch: Record<string, unknown>,
  expectedRevision: number,
): Promise<SettingsNamespace> {
  return client.call<SettingsNamespace>('settings/update', { ns, patch, expectedRevision });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clone);
  if (isRecord(value)) {
    const copy: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) copy[key] = clone(entry);
    return copy;
  }
  return value;
}

function removePath(root: Record<string, unknown>, path: readonly string[]): void {
  if (path.length === 0) return;
  let cursor: Record<string, unknown> | undefined = root;
  for (let index = 0; index < path.length - 1; index += 1) {
    const key = path[index];
    if (key === undefined) return;
    const next: unknown = cursor?.[key];
    cursor = isRecord(next) ? next : undefined;
    if (cursor === undefined) return;
  }
  const last = path[path.length - 1];
  if (cursor === undefined || last === undefined) return;
  delete cursor[last];
}

export function omitSecretPaths(
  value: Record<string, unknown>,
  secrets: readonly { path: readonly string[]; set: boolean }[] | undefined,
): Record<string, unknown> {
  if (secrets === undefined || secrets.length === 0) return value;
  const copy = clone(value);
  if (!isRecord(copy)) return {};
  for (const secret of secrets) removePath(copy, [...secret.path]);
  return copy;
}

export type SettingsSaveResult =
  | { kind: 'saved'; namespace: SettingsNamespace }
  | { kind: 'conflict'; expected: number; actual: number }
  | { kind: 'rejected'; message: string }
  | { kind: 'refused' }
  | { kind: 'error' };

export async function saveSettingsValue(
  client: HostClient,
  ns: string,
  patch: Record<string, unknown>,
  expectedRevision: number,
): Promise<SettingsSaveResult> {
  try {
    const namespace = await updateSettings(client, ns, patch, expectedRevision);
    return { kind: 'saved', namespace };
  } catch (error) {
    const failure = settingsFailure(error);
    return failure ?? { kind: 'error' };
  }
}
