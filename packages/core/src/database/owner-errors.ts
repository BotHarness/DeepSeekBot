import type {
  OperationalDatabaseErrorCode,
  OperationalDatabaseFaultStage,
  OperationalDatabaseOwner,
  OperationalDatabaseOwnerOptions,
} from './owner.js';

interface FaultTarget extends Pick<OperationalDatabaseOwnerOptions, 'faultInjector'> {
  owner: OperationalDatabaseOwner;
}

export class OperationalDatabaseError extends Error {
  readonly code: OperationalDatabaseErrorCode;

  constructor(code: OperationalDatabaseErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'OperationalDatabaseError';
    this.code = code;
  }
}

export function isThenable(value: unknown): value is PromiseLike<unknown> {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return false;
  return typeof (value as { then?: unknown }).then === 'function';
}

export function toOperationalError(
  code: OperationalDatabaseErrorCode,
  message: string,
  cause: unknown,
): OperationalDatabaseError {
  if (cause instanceof OperationalDatabaseError && cause.code === code) return cause;
  return new OperationalDatabaseError(code, message, { cause });
}

export function injectFault(
  internal: FaultTarget,
  stage: OperationalDatabaseFaultStage,
  stagingPath?: string,
): void {
  internal.faultInjector?.({
    stage,
    activePath: internal.owner.databasePath,
    ...(stagingPath === undefined ? {} : { stagingPath }),
  });
}
