import {
  LOCAL_VIDEO_PATH,
  type LocalVideoBinding,
  type LocalVideoCommand,
  type LocalVideoResult,
} from '../../computer/src/local-video-contract';
import type { BrowserInput } from './browser-viewer';
import { deviceRefusal, type HostClient } from './client';
import type { ComputerViewer, ComputerViewerState } from './computer-viewer';
import { waylandIssue, type DesktopAccessIssue } from '../../computer/src/desktop-availability';

type Client = Pick<HostClient, 'api'>;

function willRecover(issue: DesktopAccessIssue | undefined): issue is DesktopAccessIssue & {
  readonly code: 'desktop-locked' | 'desktop-screen-inactive' | 'desktop-restoring';
} {
  return (
    issue?.code === 'desktop-locked' ||
    issue?.code === 'desktop-screen-inactive' ||
    issue?.code === 'desktop-restoring'
  );
}

function waitForHost(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, 2_500);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

async function command(client: Client, input: LocalVideoCommand, signal?: AbortSignal) {
  const answer = await client.api(LOCAL_VIDEO_PATH, {
    body: input,
    ...(signal === undefined ? {} : { signal }),
  });
  if (answer.body === null || typeof answer.body !== 'object' || !('ok' in answer.body))
    throw new Error(`The Host answered ${answer.status}.`);
  return answer.body as LocalVideoResult;
}

export async function currentDesktopAvailable(
  client: Client,
  signal: AbortSignal,
): Promise<boolean> {
  const result = await command(client, { kind: 'status' }, signal);
  return result.ok && result.state.transport === 'frames';
}

export function createCurrentDesktopViewer(client: Client): ComputerViewer {
  const listeners = new Set<() => void>();
  const idle: ComputerViewerState = { status: 'loading', control: false, explicit: true };
  let state = idle;
  let run: AbortController | undefined;
  let binding: LocalVideoBinding | undefined;
  let generation: number | undefined;
  let sequence = 0;
  let revision = 0;
  let pending = 0;
  let inputs = Promise.resolve();
  let stopping = Promise.resolve();

  function update(next: Partial<ComputerViewerState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  function loseControl() {
    generation = undefined;
    revision += 1;
    update({ control: false });
  }

  async function close(bound: LocalVideoBinding) {
    await command(client, { kind: 'close', binding: bound }).catch(() => undefined);
  }

  async function recover(owner: AbortController, issue: DesktopAccessIssue) {
    const { signal } = owner;
    if (signal.aborted) return false;
    const bound = binding;
    binding = undefined;
    loseControl();
    update({
      status: 'unreachable',
      paused: true,
      frame: undefined,
      notice: issue.detail,
      noticeCode: issue.code,
    });
    if (bound !== undefined) await close(bound);
    while (!signal.aborted) {
      await waitForHost(signal);
      if (signal.aborted) return false;
      const status = await command(client, { kind: 'status' }, signal);
      if (signal.aborted || !status.ok || status.state.transport !== 'frames') return false;
      const unavailable = status.state.unavailable;
      if (unavailable === undefined) return true;
      update({
        paused: status.state.paused,
        notice: unavailable.detail,
        noticeCode: unavailable.code,
      });
      if (!willRecover(unavailable)) return false;
    }
    return false;
  }

  async function followAttempt(owner: AbortController): Promise<boolean> {
    const { signal } = owner;
    try {
      const opened = await command(client, { kind: 'open' }, signal);
      if (!opened.ok) {
        const issue = waylandIssue(opened.code);
        if (willRecover(issue)) return await recover(owner, issue);
        if (!signal.aborted)
          update({
            status: opened.code === 'not-running' ? 'not-running' : 'unreachable',
            notice: opened.error,
            noticeCode: issue?.code,
          });
        return false;
      }
      const bound = opened.state.binding;
      if (bound === undefined) throw new Error('The Host did not open a desktop viewer.');
      if (signal.aborted) {
        await close(bound);
        return false;
      }
      binding = bound;
      update({ paused: opened.state.paused });
      let after: number | undefined;
      while (!signal.aborted) {
        const started = revision;
        const result = await command(
          client,
          {
            kind: 'frame',
            binding: bound,
            ...(after === undefined ? {} : { after }),
          },
          signal,
        );
        if (signal.aborted) return false;
        if (!result.ok) {
          const issue = waylandIssue(result.code);
          if (willRecover(issue)) return await recover(owner, issue);
          if (issue !== undefined) {
            loseControl();
            update({
              status: 'unreachable',
              frame: undefined,
              notice: issue.detail,
              noticeCode: issue.code,
            });
            return false;
          }
          throw new Error(result.error);
        }
        const { frame, paused, controller } = result.state;
        if (started === revision) {
          if (generation !== undefined && !controller) loseControl();
          update({ paused });
        }
        if (frame === undefined) continue;
        after = frame.seq;
        update({
          status: 'live',
          frame: {
            seq: frame.seq,
            width: frame.width,
            height: frame.height,
            uri: `data:${frame.mimeType};base64,${frame.data}`,
          },
        });
      }
    } catch (error) {
      if (!signal.aborted) {
        loseControl();
        update({
          status: deviceRefusal(error) === undefined ? 'unreachable' : 'refused',
          frame: undefined,
          notice: error instanceof Error ? error.message : String(error),
          noticeCode: undefined,
        });
      }
    }
    return false;
  }

  async function follow(owner: AbortController) {
    while (await followAttempt(owner)) {
      if (owner.signal.aborted) return;
      update({ status: 'loading', notice: undefined, noticeCode: undefined });
    }
  }

  async function control(kind: 'takeover' | 'release' | 'resume') {
    const bound = binding;
    const owner = run;
    if (bound === undefined || owner === undefined || state.busy) return;
    if (kind === 'takeover' && state.status !== 'live') return;
    const previous = generation;
    if (kind !== 'takeover') loseControl();
    const started = ++revision;
    update({ busy: true, notice: undefined });
    try {
      const grant = previous === undefined ? {} : { generation: previous };
      const result = await command(
        client,
        kind === 'resume'
          ? { kind, runtimeId: bound.runtimeId, binding: bound, ...grant }
          : kind === 'release'
            ? { kind, binding: bound, ...grant }
            : { kind, binding: bound },
        owner.signal,
      );
      if (owner.signal.aborted || started !== revision || binding !== bound) return;
      if (result.ok) {
        generation = result.state.controller ? result.state.grant?.generation : undefined;
        sequence = result.state.lastInputSequence;
        update({ control: generation !== undefined, paused: result.state.paused });
      } else {
        update({ notice: result.error });
      }
    } catch (error) {
      if (!owner.signal.aborted)
        update({ notice: error instanceof Error ? error.message : String(error) });
    } finally {
      if (!owner.signal.aborted) {
        if (revision === started) revision += 1;
        update({ busy: false });
      }
    }
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      if (run !== undefined) return;
      const owner = new AbortController();
      run = owner;
      update(idle);
      void stopping.then(() => {
        if (!owner.signal.aborted) return follow(owner);
      });
    },
    stop() {
      run?.abort();
      run = undefined;
      const bound = binding;
      binding = undefined;
      loseControl();
      update({
        ...idle,
        frame: undefined,
        paused: undefined,
        busy: false,
        notice: undefined,
        noticeCode: undefined,
      });
      if (bound !== undefined) stopping = close(bound);
    },
    setControl: (active) => control(active ? 'takeover' : 'release'),
    resume: () => control('resume'),
    hold: async () => {},
    send(input: BrowserInput) {
      const bound = binding;
      const owner = run;
      const grant = generation;
      if (grant === undefined || bound === undefined || owner === undefined || pending >= 8)
        return Promise.resolve();
      pending += 1;
      const next = inputs
        .then(async () => {
          if (owner.signal.aborted || generation !== grant || state.status !== 'live') return;
          const result = await command(
            client,
            {
              kind: 'input',
              binding: bound,
              generation: grant,
              sequence: ++sequence,
              input:
                input.kind === 'click'
                  ? { ...input, button: input.button ?? 'left', count: input.count === 2 ? 2 : 1 }
                  : input.kind === 'key'
                    ? { ...input, modifiers: input.modifiers ?? [] }
                    : input,
            },
            owner.signal,
          );
          if (!result.ok) throw new Error(result.error);
        })
        .catch((error: unknown) => {
          if (owner.signal.aborted || generation !== grant) return;
          loseControl();
          update({ notice: error instanceof Error ? error.message : String(error) });
        })
        .finally(() => {
          pending -= 1;
        });
      inputs = next;
      return next;
    },
  };
}
