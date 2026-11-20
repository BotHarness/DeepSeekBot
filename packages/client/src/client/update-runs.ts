import { createSnapshotStore, type SnapshotStore } from '@deepseek-ai/dsh-client-store';

import type {
  UpdateCancel,
  UpdateRun,
  UpdateRunCommand,
  UpdateRunKind,
  UpdateRunPhase,
  UpdateRunTarget,
} from '../../../core/src/release/update-runs.js';
import type { BridgeCall } from './bridge.js';

const POLL_MS = 600;

const PHASES: readonly UpdateRunPhase[] = [
  'checking',
  'installing',
  'cancelling',
  'applying',
  'installed',
  'failed',
  'cancelled',
];

export type UpdateCancelState = 'idle' | 'requesting' | 'too-late' | 'unsupported';

export interface UpdateRunsSnapshot {
  run: UpdateRun | undefined;
  cancel: UpdateCancelState;
}

export interface UpdateRunsWatch {
  wait(ms: number): Promise<void>;
}

const DEFAULT_WATCH: UpdateRunsWatch = {
  wait: (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    }),
};

type InstallOutcome =
  | { status: 'installed'; applied?: boolean }
  | { status: 'failed'; reason: string; diagnostic?: string; logPath?: string };

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function text(value: unknown): value is string {
  return typeof value === 'string';
}

export function updateRunActive(run: UpdateRun | undefined): boolean {
  return (
    run !== undefined &&
    run.phase !== 'installed' &&
    run.phase !== 'failed' &&
    run.phase !== 'cancelled'
  );
}

function parseCommand(value: unknown): UpdateRunCommand | undefined {
  const source = record(value);
  if (!text(source?.['id']) || !text(source['command']) || !text(source['output']))
    return undefined;
  const exitCode = source['exitCode'];
  return {
    id: source['id'],
    command: source['command'],
    output: source['output'],
    truncated: source['truncated'] === true,
    ...(exitCode === null || typeof exitCode === 'number' ? { exitCode } : {}),
  };
}

export function parseUpdateRun(value: unknown): UpdateRun | undefined {
  const source = record(value);
  const kind = source?.['kind'];
  const phase = PHASES.find((candidate) => candidate === source?.['phase']);
  if (
    source === undefined ||
    (kind !== 'release' && kind !== 'plugin') ||
    phase === undefined ||
    !text(source['id']) ||
    !text(source['name']) ||
    !text(source['version']) ||
    !text(source['startedAt']) ||
    !Array.isArray(source['commands'])
  )
    return undefined;
  const commands = source['commands'].map(parseCommand);
  if (commands.some((command) => command === undefined)) return undefined;
  const attempt = record(source['attempt']);
  const installed = record(source['installed']);
  const failure = record(source['failure']);
  return {
    id: source['id'],
    kind,
    name: source['name'],
    version: source['version'],
    phase,
    startedAt: source['startedAt'],
    ...(text(source['endedAt']) ? { endedAt: source['endedAt'] } : {}),
    ...(attempt !== undefined &&
    typeof attempt['index'] === 'number' &&
    typeof attempt['total'] === 'number'
      ? {
          attempt: {
            registry: text(attempt['registry']) ? attempt['registry'] : '',
            index: attempt['index'],
            total: attempt['total'],
          },
        }
      : {}),
    commands: commands as UpdateRunCommand[],
    cancellable: source['cancellable'] === true,
    ...(installed === undefined ? {} : { installed: { applied: installed['applied'] === true } }),
    ...(failure !== undefined && text(failure['reason'])
      ? {
          failure: {
            reason: failure['reason'],
            ...(text(failure['diagnostic']) ? { diagnostic: failure['diagnostic'] } : {}),
            ...(text(failure['logPath']) ? { logPath: failure['logPath'] } : {}),
          },
        }
      : {}),
  };
}

export function newUpdateRequestId(): string {
  const crypto = globalThis.crypto as Crypto | undefined;
  if (typeof crypto?.randomUUID === 'function') return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto?.getRandomValues === 'function') crypto.getRandomValues(bytes);
  else
    for (let index = 0; index < bytes.length; index += 1)
      bytes[index] = Math.floor(Math.random() * 256);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export class UpdateRunsController {
  readonly source: SnapshotStore<UpdateRunsSnapshot>;

  private readonly call: BridgeCall;
  private readonly watch: UpdateRunsWatch;
  private readonly newId: () => string;
  private following = false;

  constructor(
    call: BridgeCall,
    watch: UpdateRunsWatch = DEFAULT_WATCH,
    newId: () => string = newUpdateRequestId,
  ) {
    this.call = call;
    this.watch = watch;
    this.newId = newId;
    this.source = createSnapshotStore<UpdateRunsSnapshot>({ run: undefined, cancel: 'idle' });
  }

  busy(): boolean {
    return updateRunActive(this.source.getSnapshot().run);
  }

  async run<T extends InstallOutcome>(
    target: UpdateRunTarget,
    invoke: (requestId: string) => Promise<T | undefined>,
  ): Promise<T | undefined> {
    const id = this.newId();
    this.source.update((draft) => {
      draft.cancel = 'idle';
      draft.run = {
        id,
        ...target,
        phase: 'checking',
        startedAt: new Date().toISOString(),
        commands: [],
        cancellable: true,
      };
    });
    let settled = false;
    void (async () => {
      while (!settled) {
        await this.watch.wait(POLL_MS);
        if (settled) return;
        await this.refresh(id, () => !settled);
      }
    })();
    let outcome: T | undefined;
    try {
      outcome = await invoke(id);
    } finally {
      settled = true;
    }
    const known = await this.refresh(id);
    if (!known || updateRunActive(this.source.getSnapshot().run)) this.settleLocally(id, outcome);
    return outcome;
  }

  async follow(): Promise<void> {
    if (this.following || this.busy()) return;
    this.following = true;
    try {
      let run = await this.read(undefined);
      if (run === undefined) return;
      const current = this.source.getSnapshot().run;
      if (!updateRunActive(run) && current?.id !== run.id) return;
      this.publish(run);
      while (updateRunActive(run)) {
        await this.watch.wait(POLL_MS);
        const next = await this.read(run!.id);
        if (next === undefined) return;
        run = next;
        this.publish(run);
      }
    } finally {
      this.following = false;
    }
  }

  async cancel(): Promise<void> {
    const run = this.source.getSnapshot().run;
    if (!updateRunActive(run) || this.source.getSnapshot().cancel === 'requesting') return;
    this.source.update((draft) => {
      draft.cancel = 'requesting';
      if (draft.run !== undefined && draft.run.phase !== 'applying') draft.run.phase = 'cancelling';
    });
    let answer: UpdateCancel['status'] | undefined;
    try {
      const result = await this.call('updateCancel', { id: run!.id });
      const status = result.ok ? record(result.value)?.['status'] : undefined;
      answer = text(status) ? (status as UpdateCancel['status']) : undefined;
    } catch {
      answer = undefined;
    }
    this.source.update((draft) => {
      draft.cancel =
        answer === 'too-late'
          ? 'too-late'
          : answer === undefined || answer === 'unsupported'
            ? 'unsupported'
            : 'idle';
    });
    await this.refresh(run!.id);
  }

  dismiss(): void {
    if (this.busy()) return;
    this.source.update((draft) => {
      draft.run = undefined;
      draft.cancel = 'idle';
    });
  }

  private async read(id: string | undefined): Promise<UpdateRun | undefined> {
    try {
      const result = await this.call('updateRun', id === undefined ? {} : { id });
      return result.ok ? parseUpdateRun(result.value) : undefined;
    } catch {
      return undefined;
    }
  }

  private async refresh(id: string, current: () => boolean = () => true): Promise<boolean> {
    const run = await this.read(id);
    if (run === undefined || run.id !== id) return false;
    if (!current() || this.source.getSnapshot().run?.id !== id) return true;
    this.publish(run);
    return true;
  }

  private publish(run: UpdateRun): void {
    this.source.update((draft) => {
      const cancelling =
        draft.cancel === 'requesting' && updateRunActive(run) && run.phase !== 'applying';
      draft.run = cancelling ? { ...run, phase: 'cancelling' } : run;
      if (!updateRunActive(run) && draft.cancel === 'requesting') draft.cancel = 'idle';
    });
  }

  private settleLocally(id: string, outcome: InstallOutcome | undefined): void {
    this.source.update((draft) => {
      const run = draft.run;
      if (run?.id !== id) return;
      run.endedAt = new Date().toISOString();
      run.cancellable = false;
      if (outcome?.status === 'installed') {
        run.phase = 'installed';
        run.installed = { applied: outcome.applied === true };
        return;
      }
      const reason = outcome?.reason ?? 'failed';
      run.phase = reason === 'cancelled' ? 'cancelled' : 'failed';
      run.failure = {
        reason,
        ...(outcome?.diagnostic === undefined ? {} : { diagnostic: outcome.diagnostic }),
        ...(outcome?.logPath === undefined ? {} : { logPath: outcome.logPath }),
      };
      if (draft.cancel === 'requesting') draft.cancel = 'idle';
    });
  }
}

export type { UpdateRun, UpdateRunKind, UpdateRunTarget };
