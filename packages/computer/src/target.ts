import type { ComputerProvider } from './provider.js';
import type { CuaDriver } from './tool/driver.js';

export type ComputerTarget = 'local' | 'container';

export function computerTarget(value: unknown): ComputerTarget {
  return value === 'local' ? 'local' : 'container';
}

export interface ComputerTargetRuntime {
  readonly provider: ComputerProvider;
  readonly driver: CuaDriver;
  isRunning(): boolean;
  sync(): Promise<void>;
  dispose(): Promise<void>;
}

export function createComputerTargetRuntime(options: {
  target: () => ComputerTarget;
  create: (target: ComputerTarget) => { provider: ComputerProvider; driver: CuaDriver };
  onChange: () => void;
  onEvent?: ((detail: string) => void) | undefined;
}): ComputerTargetRuntime {
  let target = options.target();
  let active = options.create(target);
  let revision = 0;
  let running = false;
  let changing: Promise<void> | undefined;
  let disposed = false;
  const sync = (): Promise<void> => {
    if (disposed) return Promise.reject(new Error('Computer runtime is disposed'));
    if (changing !== undefined) return changing.then(sync);
    const next = options.target();
    if (next === target) return Promise.resolve();
    running = false;
    revision += 1;
    options.onChange();
    options.onEvent?.(`phase=target-switch from=${target} to=${next}`);
    changing = (async () => {
      await active.driver.close();
      await active.provider.stop();
      if (disposed) return;
      target = next;
      active = options.create(next);
    })().finally(() => {
      changing = undefined;
    });
    return changing.then(sync);
  };
  const requireCurrent = (): void => {
    if (disposed || changing !== undefined || target !== options.target())
      throw new Error(
        'Computer Target changed; ask the Human to check the selected Computer and authorize a new action.',
      );
  };
  const provider: ComputerProvider = {
    get name() {
      return active.provider.name;
    },
    probe: async () => {
      await sync();
      return active.provider.probe();
    },
    status: async () => {
      await sync();
      const status = await active.provider.status();
      running = status.state === 'running';
      return status;
    },
    start: async () => {
      await sync();
      await active.provider.start();
      requireCurrent();
      running = (await active.provider.status()).state === 'running';
    },
    stop: async () => {
      await sync();
      running = false;
      await active.provider.stop();
    },
    upstream: () =>
      target === options.target() && changing === undefined
        ? active.provider.upstream()
        : undefined,
    webrtc: {
      media: async () =>
        target === options.target() && changing === undefined
          ? active.provider.webrtc?.media()
          : undefined,
      prepare: async () => {
        await sync();
        if (active.provider.webrtc === undefined)
          throw new Error('WebRTC is only available for Container Computer');
        await active.provider.webrtc.prepare();
      },
    },
    exportTo: async (dir) => {
      await sync();
      if (target !== 'container' || active.provider.exportTo === undefined)
        throw new Error('Archive transfer is only available for Container Computer');
      return active.provider.exportTo(dir);
    },
    importFrom: async (archive) => {
      await sync();
      if (target !== 'container' || active.provider.importFrom === undefined)
        throw new Error('Archive transfer is only available for Container Computer');
      await active.provider.importFrom(archive);
    },
  };
  const driver: CuaDriver = {
    ensure: async (signal) => {
      requireCurrent();
      return active.driver.ensure(signal);
    },
    tools: async (signal) => {
      requireCurrent();
      return active.driver.tools(signal);
    },
    call: async (name, args, signal) => {
      requireCurrent();
      const startedRevision = revision;
      const result = await active.driver.call(name, args, signal);
      if (revision !== startedRevision)
        throw new Error('Computer Target changed during the action; re-observe before retrying.');
      requireCurrent();
      return result;
    },
    close: async () => {
      await active.driver.close();
    },
  };
  return {
    provider,
    driver,
    sync,
    isRunning: () =>
      !disposed &&
      changing === undefined &&
      target === options.target() &&
      (target === 'local' ? running : active.provider.upstream() !== undefined),
    async dispose() {
      disposed = true;
      await changing?.catch(() => undefined);
      await active.driver.close();
    },
  };
}
