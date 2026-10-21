import { createHash, randomBytes } from 'node:crypto';
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
  renameSync,
} from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

export const DATA_RESET_IM_INTEGRATIONS = [
  'dsh-im',
  'dsh-feishu',
  'dsh-dingtalk',
  'dsh-qq',
  'dsh-wecom',
  'dsh-wecom-app',
  'dsh-weixin',
  'dsh-whatsapp',
  'dsh-office',
] as const;

export const DATA_RESET_MARKER = 'botharness-reset.json';
const PREVIEW_TTL_MS = 10 * 60 * 1000;
const MEASURE_LIMIT = 200_000;

export type DataResetTargetKind = 'data' | 'im-settings' | 'local-tools';
export type DataResetKeptKind = 'credentials' | 'memory' | 'exports';

export interface DataResetTarget {
  kind: DataResetTargetKind;
  path: string;
  bytes: number;
  files: number;
  partial?: boolean;
}

export interface DataResetPreview {
  token: string;
  expiresAt: string;
  bots: number;
  targets: DataResetTarget[];
  kept: { kind: DataResetKeptKind; path: string }[];
  restartable: boolean;
}

export type DataResetResult =
  | { status: 'restarting' }
  | { status: 'restart-required'; reason: 'restart-unavailable' };

export class DataResetError extends Error {
  constructor(
    readonly code: 'data-reset-preview-stale' | 'data-reset-pending',
    message: string,
  ) {
    super(message);
    this.name = 'DataResetError';
  }
}

export interface DataResetPlan {
  targets: { kind: DataResetTargetKind; path: string }[];
  keep: string[];
}

interface MarkerBody {
  format: 'botharness-data-reset';
  version: 1;
  acceptedAt: string;
  keep: string[];
}

export function dataResetPlan(options: {
  dshHome: string;
  home: string;
  keep?: readonly string[];
}): DataResetPlan {
  const candidates: { kind: DataResetTargetKind; path: string }[] = [
    { kind: 'data', path: join(options.dshHome, 'botharness') },
    ...DATA_RESET_IM_INTEGRATIONS.map((id) => ({
      kind: 'im-settings' as const,
      path: join(options.dshHome, 'integrations', id),
    })),
    { kind: 'local-tools', path: join(options.home, '.botharness') },
  ];
  return {
    targets: candidates.filter((target) => exists(target.path)),
    keep: [...new Set((options.keep ?? []).map((path) => resolve(path)))].sort(),
  };
}

function exists(path: string): boolean {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}

function inside(child: string, parent: string): boolean {
  const path = relative(resolve(parent), resolve(child));
  return path === '' || (path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path));
}

function measure(
  path: string,
  keep: readonly string[],
): { bytes: number; files: number; partial?: boolean } {
  let bytes = 0;
  let files = 0;
  let seen = 0;
  const stack = [path];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (keep.some((kept) => inside(current, kept))) continue;
    if (++seen > MEASURE_LIMIT) return { bytes, files, partial: true };
    let stat;
    try {
      stat = lstatSync(current);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      try {
        for (const name of readdirSync(current)) stack.push(join(current, name));
      } catch {
        continue;
      }
    } else {
      files += 1;
      bytes += stat.size;
    }
  }
  return { bytes, files };
}

function removeKeeping(path: string, keep: readonly string[], failures: string[]): void {
  if (keep.some((kept) => inside(path, kept))) return;
  const nested = keep.filter((kept) => inside(kept, path));
  try {
    const stat = lstatSync(path);
    if (nested.length === 0 || !stat.isDirectory()) {
      rmSync(path, { recursive: true, force: true, maxRetries: 3 });
      return;
    }
    for (const name of readdirSync(path)) removeKeeping(join(path, name), nested, failures);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') failures.push(path);
  }
}

export function wipeDataResetPlan(plan: DataResetPlan): { removed: string[]; failed: string[] } {
  const failed: string[] = [];
  const removed: string[] = [];
  for (const target of plan.targets) {
    const before = failed.length;
    removeKeeping(target.path, plan.keep, failed);
    if (failed.length === before) removed.push(target.path);
  }
  return { removed, failed };
}

function exportsDir(home: string): string {
  const desktop = join(home, 'Desktop');
  return existsSync(desktop)
    ? join(desktop, 'BotHarness Exports')
    : join(home, 'BotHarness Exports');
}

function markerPath(dshHome: string): string {
  return join(dshHome, DATA_RESET_MARKER);
}

function readMarker(dshHome: string): MarkerBody | undefined {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(markerPath(dshHome), 'utf8'));
  } catch {
    return undefined;
  }
  const body = raw as Partial<MarkerBody> | null;
  if (
    body === null ||
    typeof body !== 'object' ||
    body.format !== 'botharness-data-reset' ||
    body.version !== 1 ||
    !Array.isArray(body.keep) ||
    !body.keep.every((path) => typeof path === 'string' && isAbsolute(path))
  )
    return undefined;
  return body as MarkerBody;
}

function writeMarker(dshHome: string, keep: readonly string[], at: Date): void {
  const body: MarkerBody = {
    format: 'botharness-data-reset',
    version: 1,
    acceptedAt: at.toISOString(),
    keep: [...keep],
  };
  const path = markerPath(dshHome);
  const staging = `${path}.${randomBytes(4).toString('hex')}.tmp`;
  writeFileSync(staging, JSON.stringify(body, null, 2), { mode: 0o600 });
  renameSync(staging, path);
}

export function applyPendingDataReset(options: {
  dshHome: string;
  home: string;
  log?: (message: string) => void;
}): { applied: boolean; failed: string[] } {
  if (!existsSync(markerPath(options.dshHome))) return { applied: false, failed: [] };
  const marker = readMarker(options.dshHome);
  if (marker === undefined) {
    options.log?.('data-reset phase=skipped reason=invalid-marker');
    return { applied: false, failed: [] };
  }
  const plan = dataResetPlan({ dshHome: options.dshHome, home: options.home, keep: marker.keep });
  const result = wipeDataResetPlan(plan);
  if (result.failed.length === 0) rmSync(markerPath(options.dshHome), { force: true });
  options.log?.(
    `data-reset phase=${result.failed.length === 0 ? 'applied' : 'incomplete'} initiator=host-start removed=${String(result.removed.length)} failed=${String(result.failed.length)}`,
  );
  return { applied: true, failed: result.failed };
}

export interface DataResetDependencies {
  dshHome: string;
  home: string;
  bots(): { count: number; chosenMemoryDirs: string[] };
  restarter(): { restart(): void } | undefined;
  stopWriting(): void;
  onExit?(listener: () => void): void;
  now?: () => Date;
  log?: (message: string) => void;
}

export interface DataReset {
  preview(): DataResetPreview;
  confirm(token: string): DataResetResult;
}

function fingerprint(plan: DataResetPlan, bots: number): string {
  return createHash('sha256')
    .update(JSON.stringify({ targets: plan.targets, keep: plan.keep, bots }))
    .digest('hex');
}

export function createDataReset(deps: DataResetDependencies): DataReset {
  const now = deps.now ?? (() => new Date());
  const onExit =
    deps.onExit ??
    ((listener: () => void) => {
      process.once('beforeExit', listener);
      process.once('exit', listener);
    });
  let issued: { token: string; expiresAt: number; fingerprint: string } | undefined;
  let accepted = false;
  const current = () => {
    const bots = deps.bots();
    const plan = dataResetPlan({
      dshHome: deps.dshHome,
      home: deps.home,
      keep: bots.chosenMemoryDirs,
    });
    return { bots, plan };
  };
  return {
    preview() {
      if (accepted)
        throw new DataResetError('data-reset-pending', 'BotHarness data is already being cleared');
      const { bots, plan } = current();
      const token = randomBytes(24).toString('base64url');
      const expiresAt = now().getTime() + PREVIEW_TTL_MS;
      issued = { token, expiresAt, fingerprint: fingerprint(plan, bots.count) };
      return {
        token,
        expiresAt: new Date(expiresAt).toISOString(),
        bots: bots.count,
        targets: plan.targets.map((target) => ({ ...target, ...measure(target.path, plan.keep) })),
        kept: [
          { kind: 'credentials', path: join(deps.dshHome, '.credentials.yaml') },
          ...plan.keep.map((path) => ({ kind: 'memory' as const, path })),
          { kind: 'exports', path: exportsDir(deps.home) },
        ],
        restartable: deps.restarter() !== undefined,
      };
    },
    confirm(token) {
      if (accepted)
        throw new DataResetError('data-reset-pending', 'BotHarness data is already being cleared');
      const { bots, plan } = current();
      if (
        issued === undefined ||
        issued.token !== token ||
        issued.expiresAt < now().getTime() ||
        issued.fingerprint !== fingerprint(plan, bots.count)
      )
        throw new DataResetError(
          'data-reset-preview-stale',
          'The preview changed or expired; review it again',
        );
      issued = undefined;
      accepted = true;
      writeMarker(deps.dshHome, plan.keep, now());
      deps.log?.(
        `data-reset phase=accepted initiator=human targets=${String(plan.targets.length)} kept=${String(plan.keep.length)}`,
      );
      deps.stopWriting();
      let finished = false;
      onExit(() => {
        if (finished) return;
        finished = true;
        applyPendingDataReset({
          dshHome: deps.dshHome,
          home: deps.home,
          log: (message) => {
            try {
              deps.log?.(message);
            } catch {
              return;
            }
          },
        });
      });
      const restarter = deps.restarter();
      if (restarter === undefined)
        return { status: 'restart-required', reason: 'restart-unavailable' };
      restarter.restart();
      return { status: 'restarting' };
    },
  };
}
