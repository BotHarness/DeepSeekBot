export interface BotCreationDraft {
  hostId: string;
  displayName: string;
  persona: string;
  description: string;
  tags: string;
}

export interface BlankBotInput {
  displayName: string;
  persona?: string;
  description?: string;
  roles?: string[];
}

export interface BotCreationOperation {
  hostId: string;
  deviceId: string;
  operationKey: string;
  input: BlankBotInput;
}

export type CreationReceipt =
  | { operationKey: string; botSlug: string; status: 'reserved' }
  | { operationKey: string; botSlug: string; status: 'created'; channelId: string };

export type CreationRecord =
  | { kind: 'draft'; draft: BotCreationDraft }
  | {
      kind: 'submitted';
      operation: BotCreationOperation;
      mutationStarted: boolean;
      acknowledged?: boolean;
    };

export interface CreationSnapshot {
  loaded: boolean;
  record: CreationRecord;
  busy: boolean;
  receipt?: CreationReceipt | undefined;
  error?: string | undefined;
}

export class BotCreationFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const emptyDraft = (): BotCreationDraft => ({
  hostId: '',
  displayName: '',
  persona: '',
  description: '',
  tags: '',
});

export function normalizedBlankInput(draft: BotCreationDraft): BlankBotInput {
  const persona = draft.persona.trim();
  const description = draft.description.trim();
  const roles = [
    ...new Set(
      draft.tags
        .split(/[,，]/u)
        .map((tag) => tag.trim())
        .filter(Boolean),
    ),
  ];
  return {
    displayName: draft.displayName.trim(),
    ...(persona ? { persona } : {}),
    ...(description ? { description } : {}),
    ...(roles.length ? { roles } : {}),
  };
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseCreationRecord(value: unknown): CreationRecord {
  if (!object(value)) throw new BotCreationFailure('storage-invalid');
  if (value.kind === 'draft' && object(value.draft)) {
    const d = value.draft;
    if (
      typeof d.hostId === 'string' &&
      typeof d.displayName === 'string' &&
      typeof d.persona === 'string' &&
      typeof d.description === 'string' &&
      typeof d.tags === 'string'
    )
      return {
        kind: 'draft',
        draft: {
          hostId: d.hostId,
          displayName: d.displayName,
          persona: d.persona,
          description: d.description,
          tags: d.tags,
        },
      };
  }
  if (
    value.kind === 'submitted' &&
    typeof value.mutationStarted === 'boolean' &&
    object(value.operation)
  ) {
    const o = value.operation;
    const input = o.input;
    if (
      typeof o.hostId === 'string' &&
      o.hostId !== '' &&
      typeof o.deviceId === 'string' &&
      o.deviceId !== '' &&
      typeof o.operationKey === 'string' &&
      /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/u.test(o.operationKey) &&
      object(input) &&
      typeof input.displayName === 'string' &&
      input.displayName.trim() !== '' &&
      (input.persona === undefined || typeof input.persona === 'string') &&
      (input.description === undefined || typeof input.description === 'string') &&
      (input.roles === undefined ||
        (Array.isArray(input.roles) &&
          input.roles.every((role): role is string => typeof role === 'string')))
    )
      return {
        kind: 'submitted',
        mutationStarted: value.mutationStarted,
        ...(value.acknowledged === true ? { acknowledged: true } : {}),
        operation: {
          hostId: o.hostId,
          deviceId: o.deviceId,
          operationKey: o.operationKey,
          input: {
            displayName: input.displayName,
            ...(input.persona === undefined ? {} : { persona: input.persona }),
            ...(input.description === undefined ? {} : { description: input.description }),
            ...(input.roles === undefined ? {} : { roles: input.roles }),
          },
        },
      };
  }
  throw new BotCreationFailure('storage-invalid');
}

export function creationReceipt(value: unknown, key: string): CreationReceipt | null {
  if (value === null) return null;
  if (
    !object(value) ||
    value.operationKey !== key ||
    typeof value.botSlug !== 'string' ||
    !value.botSlug
  )
    throw new BotCreationFailure('invalid-receipt');
  if (value.status === 'reserved')
    return { operationKey: key, botSlug: value.botSlug, status: 'reserved' };
  if (value.status === 'created' && typeof value.channelId === 'string' && value.channelId)
    return {
      operationKey: key,
      botSlug: value.botSlug,
      status: 'created',
      channelId: value.channelId,
    };
  throw new BotCreationFailure('invalid-receipt');
}

export interface BotCreationPort {
  lookup(operation: BotCreationOperation): Promise<CreationReceipt | null>;
  create(operation: BotCreationOperation): Promise<CreationReceipt>;
  deviceId(hostId: string): string | undefined;
}

export function createBotCreationController(options: {
  storage: { read(): Promise<unknown>; write(record: CreationRecord): Promise<void> };
  port: BotCreationPort;
  key(): string;
}) {
  let snapshot: CreationSnapshot = {
    loaded: false,
    record: { kind: 'draft', draft: emptyDraft() },
    busy: false,
  };
  const listeners = new Set<() => void>();
  let storageFailed = false;
  let writing = Promise.resolve();
  let active: Promise<void> | undefined;
  const publish = (patch: Partial<CreationSnapshot>) => {
    snapshot = { ...snapshot, ...patch };
    for (const listener of listeners) listener();
  };
  const save = (record: CreationRecord) => {
    const task = writing.then(() => options.storage.write(record));
    writing = task.catch(() => {});
    return task;
  };
  const fail = (error: unknown) =>
    publish({
      error: error instanceof BotCreationFailure ? error.code : 'unreachable',
    });
  const ready = options.storage
    .read()
    .then((raw) => {
      publish({
        loaded: true,
        record: raw === undefined ? snapshot.record : parseCreationRecord(raw),
      });
    })
    .catch(() => {
      storageFailed = true;
      publish({ loaded: true, error: 'storage-invalid' });
    });
  const reconcile = async (operation: BotCreationOperation, allowCreate: boolean) => {
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    const receipt = await options.port.lookup(operation);
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    publish({ receipt: receipt ?? undefined });
    if (receipt?.status === 'created') return;
    if (!allowCreate && receipt === null) return;
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    const record: CreationRecord = { kind: 'submitted', operation, mutationStarted: true };
    try {
      await save(record);
    } catch {
      throw new BotCreationFailure('storage-write');
    }
    publish({ record });
    const created = await options.port.create(operation);
    if (options.port.deviceId(operation.hostId) !== operation.deviceId)
      throw new BotCreationFailure('target-unpaired');
    publish({ receipt: created });
  };
  const run = (work: () => Promise<void>): Promise<void> => {
    if (active) return active;
    publish({ busy: true, error: undefined });
    active = Promise.resolve()
      .then(work)
      .catch(fail)
      .finally(() => {
        active = undefined;
        publish({ busy: false });
      });
    return active;
  };
  return {
    ready,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async edit(draft: BotCreationDraft) {
      await ready;
      if (storageFailed || snapshot.busy || snapshot.record.kind !== 'draft') return;
      const record: CreationRecord = { kind: 'draft', draft: { ...draft } };
      publish({ record, error: undefined });
      try {
        await save(record);
      } catch {
        publish({ error: 'storage-write' });
      }
    },
    submit() {
      return run(async () => {
        await ready;
        if (storageFailed) throw new BotCreationFailure('storage-invalid');
        if (snapshot.record.kind === 'submitted') return reconcile(snapshot.record.operation, true);
        const draft = snapshot.record.draft;
        if (!draft.displayName.trim()) throw new BotCreationFailure('name-required');
        const deviceId = options.port.deviceId(draft.hostId);
        if (!deviceId) throw new BotCreationFailure('target-unpaired');
        const operation: BotCreationOperation = {
          hostId: draft.hostId,
          deviceId,
          operationKey: options.key(),
          input: normalizedBlankInput(draft),
        };
        const record: CreationRecord = { kind: 'submitted', operation, mutationStarted: false };
        try {
          await save(record);
        } catch {
          throw new BotCreationFailure('storage-write');
        }
        publish({ record });
        await reconcile(operation, true);
      });
    },
    resume() {
      return run(async () => {
        await ready;
        if (storageFailed) throw new BotCreationFailure('storage-invalid');
        if (snapshot.record.kind === 'submitted')
          await reconcile(snapshot.record.operation, snapshot.record.mutationStarted);
      });
    },
    editBeforeSend() {
      return run(async () => {
        await ready;
        const previous = snapshot.record;
        if (
          storageFailed ||
          previous.kind !== 'submitted' ||
          previous.mutationStarted ||
          snapshot.receipt
        )
          return;
        const { hostId, input } = previous.operation;
        const record: CreationRecord = {
          kind: 'draft',
          draft: {
            hostId,
            displayName: input.displayName,
            persona: input.persona ?? '',
            description: input.description ?? '',
            tags: input.roles?.join(', ') ?? '',
          },
        };
        try {
          await save(record);
          publish({ record, error: undefined });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    async acknowledge(operationKey: string) {
      if (
        snapshot.record.kind !== 'submitted' ||
        snapshot.record.operation.operationKey !== operationKey ||
        snapshot.receipt?.status !== 'created' ||
        snapshot.error ||
        snapshot.busy
      )
        return;
      const record: CreationRecord = { ...snapshot.record, acknowledged: true };
      return run(async () => {
        try {
          await save(record);
          publish({ record });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
    another(hostId = '') {
      return run(async () => {
        await ready;
        if (
          storageFailed ||
          (snapshot.record.kind === 'submitted' &&
            !snapshot.record.acknowledged &&
            snapshot.receipt?.status !== 'created')
        )
          return;
        const record: CreationRecord = { kind: 'draft', draft: { ...emptyDraft(), hostId } };
        try {
          await save(record);
          publish({ record, receipt: undefined, error: undefined });
        } catch {
          publish({ error: 'storage-write' });
        }
      });
    },
  };
}
