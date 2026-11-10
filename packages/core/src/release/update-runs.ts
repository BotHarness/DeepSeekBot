export type UpdateRunKind = 'release' | 'plugin';

export type UpdateRunPhase =
  | 'checking'
  | 'installing'
  | 'cancelling'
  | 'applying'
  | 'installed'
  | 'failed'
  | 'cancelled';

export interface UpdateRunTarget {
  kind: UpdateRunKind;
  name: string;
  version: string;
}

export interface UpdateRunCommand {
  id: string;
  command: string;
  output: string;
  truncated: boolean;
  exitCode?: number | null;
}

export interface UpdateRunFailure {
  reason: string;
  diagnostic?: string;
  logPath?: string;
}

export interface UpdateRun extends UpdateRunTarget {
  id: string;
  phase: UpdateRunPhase;
  startedAt: string;
  endedAt?: string;
  attempt?: { registry: string; index: number; total: number };
  commands: UpdateRunCommand[];
  cancellable: boolean;
  installed?: { applied: boolean };
  failure?: UpdateRunFailure;
}

export type UpdateCancel =
  | { status: 'cancelling' | 'cancelled' }
  | { status: 'too-late' | 'not-running' | 'unsupported' };

export interface UpdateRunHandle {
  readonly id: string;
  readonly cancelled: boolean;
  installing(): void;
}

export interface UpdateCanceller {
  cancelInstall?(requestId: string): Promise<{ status: string }>;
}

type Outcome =
  | { status: 'installed'; applied: boolean }
  | { status: 'failed'; reason: string; diagnostic?: string; logPath?: string };

export interface UpdateRuns {
  run<T extends Outcome>(
    target: UpdateRunTarget,
    options: { requestId?: string | undefined; joinable: boolean },
    work: (handle: UpdateRunHandle) => Promise<T>,
  ): Promise<T> | undefined;
  get(id?: string): UpdateRun | undefined;
  cancel(id: string): Promise<UpdateCancel>;
  log(chunk: unknown): void;
  state(progress: unknown): void;
}

export const UPDATE_RUN_OUTPUT_CHARS = 32_000;
export const UPDATE_RUN_COMMANDS = 24;
const RETAINED_RUNS = 4;
const REQUEST_ID = /^[A-Za-z0-9_-]{8,64}$/u;
const ESC = String.fromCharCode(27);
const BEL = String.fromCharCode(7);
const ANSI = new RegExp(`${ESC}\\[[0-?]*[ -/]*[@-~]|${ESC}\\][^${BEL}]*${BEL}`, 'gu');

export function isUpdateRequestId(value: unknown): value is string {
  return typeof value === 'string' && REQUEST_ID.test(value);
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function copy(run: UpdateRun): UpdateRun {
  return {
    ...run,
    ...(run.attempt === undefined ? {} : { attempt: { ...run.attempt } }),
    commands: run.commands.map((command) => ({ ...command })),
    ...(run.installed === undefined ? {} : { installed: { ...run.installed } }),
    ...(run.failure === undefined ? {} : { failure: { ...run.failure } }),
  };
}

export function createUpdateRuns(
  options: {
    canceller?: () => UpdateCanceller | undefined;
    now?: () => number;
    newId?: () => string;
  } = {},
): UpdateRuns {
  const now = options.now ?? Date.now;
  const newId = options.newId ?? (() => globalThis.crypto.randomUUID());
  const runs: UpdateRun[] = [];
  const aliases = new Map<string, string>();
  let active:
    | { run: UpdateRun; promise: Promise<Outcome>; cancelled: boolean; installing: boolean }
    | undefined;

  const stamp = () => new Date(now()).toISOString();
  const find = (id: string): UpdateRun | undefined => {
    const primary = aliases.get(id) ?? id;
    return runs.find((run) => run.id === primary);
  };

  const remember = (run: UpdateRun) => {
    runs.push(run);
    while (runs.length > RETAINED_RUNS) {
      const dropped = runs.shift()!;
      for (const [alias, primary] of aliases) if (primary === dropped.id) aliases.delete(alias);
    }
  };

  const settle = (run: UpdateRun, outcome: Outcome) => {
    run.endedAt = stamp();
    run.cancellable = false;
    delete run.attempt;
    for (const command of run.commands) if (command.exitCode === undefined) command.exitCode = null;
    if (outcome.status === 'installed') {
      run.phase = 'installed';
      run.installed = { applied: outcome.applied };
      return;
    }
    run.phase = outcome.reason === 'cancelled' ? 'cancelled' : 'failed';
    run.failure = {
      reason: outcome.reason,
      ...(outcome.diagnostic === undefined ? {} : { diagnostic: outcome.diagnostic }),
      ...(outcome.logPath === undefined ? {} : { logPath: outcome.logPath }),
    };
  };

  return {
    run(target, { requestId, joinable }, work) {
      if (active !== undefined) {
        const same =
          active.run.kind === target.kind &&
          active.run.name === target.name &&
          active.run.version === target.version;
        if (!same || !joinable) return undefined;
        if (requestId !== undefined && requestId !== active.run.id)
          aliases.set(requestId, active.run.id);
        return active.promise as unknown as Promise<never>;
      }
      const run: UpdateRun = {
        id: requestId !== undefined && find(requestId) === undefined ? requestId : newId(),
        ...target,
        phase: 'checking',
        startedAt: stamp(),
        commands: [],
        cancellable: true,
      };
      remember(run);
      const entry = {
        run,
        cancelled: false,
        installing: false,
        promise: undefined as unknown as Promise<Outcome>,
      };
      const handle: UpdateRunHandle = {
        id: run.id,
        get cancelled() {
          return entry.cancelled;
        },
        installing() {
          entry.installing = true;
          if (run.phase === 'checking') run.phase = 'installing';
        },
      };
      const promise = Promise.resolve()
        .then(() => work(handle))
        .then(
          (outcome) => {
            settle(run, outcome);
            return outcome;
          },
          (error: unknown) => {
            settle(run, { status: 'failed', reason: 'failed', diagnostic: String(error) });
            throw error;
          },
        )
        .finally(() => {
          if (active?.run === run) active = undefined;
        });
      entry.promise = promise;
      active = entry;
      return promise as unknown as Promise<never>;
    },

    get(id) {
      const run = id === undefined ? (active?.run ?? runs.at(-1)) : find(id);
      return run === undefined ? undefined : copy(run);
    },

    async cancel(id) {
      const run = find(id);
      if (run === undefined || active?.run !== run) return { status: 'not-running' };
      const entry = active;
      if (run.phase === 'applying' || !run.cancellable) return { status: 'too-late' };
      if (entry.cancelled) return { status: 'cancelling' };
      if (!entry.installing) {
        entry.cancelled = true;
        run.phase = 'cancelling';
        return { status: 'cancelling' };
      }
      const canceller = options.canceller?.();
      if (canceller?.cancelInstall === undefined) return { status: 'unsupported' };
      entry.cancelled = true;
      run.phase = 'cancelling';
      let answer: string;
      try {
        answer = (await canceller.cancelInstall(run.id)).status;
      } catch {
        answer = 'not-running';
      }
      if (answer === 'too-late') {
        entry.cancelled = false;
        if (run.phase === 'cancelling') run.phase = 'applying';
        run.cancellable = false;
        return { status: 'too-late' };
      }
      return { status: answer === 'cancelled' ? 'cancelled' : 'cancelling' };
    },

    log(value) {
      const chunk = record(value);
      const run = active?.run;
      if (chunk === undefined || run === undefined || chunk['requestId'] !== run.id) return;
      const jobId = chunk['jobId'];
      if (typeof jobId !== 'string') return;
      const argv = Array.isArray(chunk['argv'])
        ? chunk['argv'].filter((part): part is string => typeof part === 'string')
        : [];
      const text = typeof chunk['text'] === 'string' ? chunk['text'].replace(ANSI, '') : '';
      let command = run.commands.find((entry) => entry.id === jobId);
      if (command === undefined) {
        command = { id: jobId, command: argv.join(' '), output: '', truncated: false };
        run.commands.push(command);
        if (run.commands.length > UPDATE_RUN_COMMANDS) run.commands.shift();
      }
      command.output += text;
      if (command.output.length > UPDATE_RUN_OUTPUT_CHARS) {
        command.output = command.output.slice(-UPDATE_RUN_OUTPUT_CHARS);
        command.truncated = true;
      }
      const exitCode = chunk['exitCode'];
      if (exitCode === null || typeof exitCode === 'number') command.exitCode = exitCode;
      if (run.phase === 'checking') run.phase = 'installing';
    },

    state(value) {
      const progress = record(value);
      const run = active?.run;
      if (progress === undefined || run === undefined || progress['requestId'] !== run.id) return;
      const phase = progress['phase'];
      if (phase === 'installing') {
        if (run.phase !== 'cancelling') run.phase = 'installing';
        const attempt = record(progress['attempt']);
        if (typeof attempt?.['index'] === 'number' && typeof attempt['total'] === 'number')
          run.attempt = {
            registry: typeof attempt['registry'] === 'string' ? attempt['registry'] : '',
            index: attempt['index'],
            total: attempt['total'],
          };
      } else if (phase === 'cancelling') {
        run.phase = 'cancelling';
      } else if (phase === 'applying') {
        run.phase = 'applying';
        run.cancellable = false;
      }
    },
  };
}
