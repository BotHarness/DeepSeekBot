import { withRemoteHostCredentialWrite } from '../../remote-host-storage-lock.js';
import type { HostClient } from '@botharness/host-client/client';
import type { SavedHost } from '@botharness/host-client/hosts';
import type { RemoteHosts } from '../../remote-hosts.js';
import type { HostEntry, HostStorage, ManagedSavedHost } from './remote-host-types.js';

function operationKey(host: SavedHost): string {
  return `botharness.remoteHosts.operation.v1:${JSON.stringify([host.hostId, host.encryption?.hostKey, host.deviceId])}`;
}

const CONNECTION_OPERATIONS_INDEX = 'botharness.remoteHosts.operations.v1';

type PendingConnection = NonNullable<Parameters<RemoteHosts['setPendingConnection']>[2]>;
type OperationIndexEntry = {
  key: string;
  hostId: string;
  record?: PendingConnection | null | undefined;
};

export function createRemoteHostOperations(
  parseIndex: (value: unknown) => OperationIndexEntry[],
  parsePending: (value: unknown) => PendingConnection,
) {
  function operationIndex(storage: HostStorage | undefined) {
    if (!storage) throw new Error('storage-unavailable');
    const raw = storage.getItem(CONNECTION_OPERATIONS_INDEX);
    const value: unknown = raw === null ? [] : JSON.parse(raw);
    let entries: unknown = value;
    if (!Array.isArray(value)) {
      if (
        typeof value !== 'object' ||
        value === null ||
        !('version' in value) ||
        (value.version !== 2 && value.version !== 3) ||
        !('entries' in value)
      )
        throw new Error('connection-operation-storage-unavailable');
      entries = value.entries;
    }
    const index = parseIndex(entries);
    const keys = new Set<string>();
    const prefix = 'botharness.remoteHosts.operation.v1:';
    for (const item of index) {
      if (!item.key.startsWith(prefix)) throw new Error('connection-operation-storage-unavailable');
      const identity: unknown = JSON.parse(item.key.slice(prefix.length));
      if (
        !Array.isArray(identity) ||
        identity.length !== 3 ||
        !identity.every((part) => typeof part === 'string' && part.length > 0) ||
        identity[0] !== item.hostId ||
        item.key !== prefix + JSON.stringify(identity) ||
        keys.has(item.key)
      )
        throw new Error('connection-operation-storage-unavailable');
      keys.add(item.key);
      if (
        item.record &&
        item.key !==
          `botharness.remoteHosts.operation.v1:${JSON.stringify([item.hostId, item.record.hostKey, item.record.deviceId])}`
      )
        throw new Error('connection-operation-storage-unavailable');
    }
    return index;
  }

  function writeOperationIndex(
    storage: HostStorage,
    index: ReturnType<typeof operationIndex>,
  ): void {
    storage.setItem(
      CONNECTION_OPERATIONS_INDEX,
      JSON.stringify(index.length ? { version: 3, entries: index } : []),
    );
  }

  function pruneCompletedOperations(
    storage: HostStorage,
    index: ReturnType<typeof operationIndex>,
  ) {
    return index.filter((item) => {
      if (item.record !== null) return true;
      try {
        storage.removeItem(item.key);
        return storage.getItem(item.key) !== null;
      } catch {
        return true;
      }
    });
  }

  function oldConnectionOwner(storage: HostStorage | undefined, host: SavedHost): boolean {
    const previous = operationIndex(storage).filter(
      (entry) =>
        entry.record !== null && entry.hostId === host.hostId && entry.key !== operationKey(host),
    );
    for (const entry of previous) indexedPending(storage, entry);
    return previous.length > 0;
  }

  function indexedPending(
    storage: HostStorage | undefined,
    entry: {
      key: string;
      record?: PendingConnection | null | undefined;
    },
  ): PendingConnection | undefined {
    if (entry.record !== undefined) return entry.record ?? undefined;
    const raw = storage?.getItem(entry.key);
    if (raw == null) throw new Error('connection-operation-storage-unavailable');
    return parsePending(JSON.parse(raw));
  }

  function readPendingConnection(
    storage: HostStorage | undefined,
    host: SavedHost,
  ): PendingConnection | undefined {
    if (!storage) throw new Error('storage-unavailable');
    const indexed = operationIndex(storage).find((entry) => entry.key === operationKey(host));
    if (indexed) return indexedPending(storage, indexed);
    const value = storage.getItem(operationKey(host));
    return value === null ? undefined : parsePending(JSON.parse(value));
  }

  function readExecutionHost(storage: HostStorage | undefined, host: SavedHost): ManagedSavedHost {
    const saved = hostConfiguration(host);
    try {
      const pendingConnection = readPendingConnection(storage, saved);
      return {
        ...saved,
        ...(pendingConnection ? { pendingConnection } : {}),
        ...(oldConnectionOwner(storage, saved) ? { connectionOwnerChanged: true } : {}),
      };
    } catch {
      return { ...saved, connectionOperationUnavailable: true };
    }
  }

  function hostConfiguration(host: ManagedSavedHost): SavedHost {
    const {
      pendingConnection: _execution,
      connectionOwnerChanged: _previousOwner,
      connectionOperationUnavailable: _executionUnavailable,
      ...saved
    } = host;
    return saved;
  }

  function connectionOperations(
    options: { connectionOperationLock?: <T>(name: string, run: () => Promise<T>) => Promise<T> },
    state: {
      storage: HostStorage | undefined;
      clients: ReadonlyMap<string, HostEntry>;
      requireOwner: () => void;
      publish: () => void;
      persistentOwner: (
        hostId: string,
        client: HostClient,
      ) => { entry: HostEntry; current: SavedHost };
    },
  ): Pick<
    RemoteHosts,
    | 'withConnectionOperation'
    | 'dispatchConnectionOperation'
    | 'previousConnectionOperations'
    | 'setPendingConnection'
  > {
    const { storage, clients, requireOwner, publish, persistentOwner } = state;
    const setPendingConnection = (
      hostId: string,
      client: HostClient,
      pending: PendingConnection | undefined,
      expectedGeneration?: string,
      previousDeviceId?: string,
      notify = true,
    ): void => {
      requireOwner();
      const entry = clients.get(hostId);
      if (!entry || entry.client !== client) throw new Error('connection-host-changed');
      if (!storage) throw new Error('storage-unavailable');
      if (previousDeviceId !== undefined && pending !== undefined)
        throw new Error('connection-operation-owner-changed');
      const owner =
        previousDeviceId === undefined ? entry.host : { ...entry.host, deviceId: previousDeviceId };
      const current = readPendingConnection(storage, owner);
      if (
        expectedGeneration !== undefined
          ? current?.generation !== expectedGeneration
          : current !== undefined
      )
        throw new Error('connection-operation-changed');
      const executionKey = operationKey(owner);
      let index = pruneCompletedOperations(storage, operationIndex(storage));
      if (pending) {
        if (pending.deviceId !== owner.deviceId || pending.hostKey !== owner.encryption?.hostKey)
          throw new Error('connection-operation-owner-changed');
        if (!index.some((item) => item.key === executionKey)) {
          if (index.length >= 32) throw new Error('connection-operation-limit');
        }
        index = [
          ...index.filter((item) => item.key !== executionKey),
          { hostId, key: executionKey, record: pending },
        ];
      } else {
        index = index.filter((item) => item.key !== executionKey);
        if (storage.getItem(executionKey) !== null)
          index.push({ hostId, key: executionKey, record: null });
      }
      const currentPending =
        previousDeviceId === undefined ? pending : readPendingConnection(storage, entry.host);
      const {
        pendingConnection: _previous,
        connectionOwnerChanged: _previousOwner,
        connectionOperationUnavailable: _executionUnavailable,
        ...rest
      } = entry.host;
      const nextHost = {
        ...rest,
        ...(currentPending ? { pendingConnection: currentPending } : {}),
        ...(index.some(
          (item) =>
            item.record !== null && item.hostId === hostId && item.key !== operationKey(entry.host),
        )
          ? { connectionOwnerChanged: true }
          : {}),
      };
      writeOperationIndex(storage, index);
      entry.host = nextHost;
      if (notify) publish();
      if (!pending && index.some((item) => item.key === executionKey && item.record === null)) {
        try {
          storage.removeItem(executionKey);
          if (storage.getItem(executionKey) === null)
            writeOperationIndex(
              storage,
              index.filter((item) => item.key !== executionKey),
            );
        } catch {}
      }
    };
    return {
      async withConnectionOperation(hostId, client, run, signal) {
        requireOwner();
        const entry = clients.get(hostId);
        if (!entry || entry.client !== client) throw new Error('connection-host-changed');
        let entered = false;
        const locked = async () => {
          entered = true;
          if (clients.get(hostId) !== entry || entry.client !== client)
            throw new Error('connection-host-changed');
          if (!storage) throw new Error('storage-unavailable');
          await withRemoteHostCredentialWrite({
            storage,
            run: () => {
              signal?.throwIfAborted();
              const { current } = persistentOwner(hostId, client);
              const index = operationIndex(storage);
              const pruned = pruneCompletedOperations(storage, index);
              if (pruned.length !== index.length) writeOperationIndex(storage, pruned);
              const pending = readPendingConnection(storage, current);
              entry.host = {
                ...current,
                ...(pending ? { pendingConnection: pending } : {}),
                ...(oldConnectionOwner(storage, current) ? { connectionOwnerChanged: true } : {}),
              };
              publish();
            },
          });
          return run();
        };
        const name = CONNECTION_OPERATIONS_INDEX;
        if (options.connectionOperationLock) return options.connectionOperationLock(name, locked);
        if (typeof navigator === 'undefined' || !navigator.locks)
          throw new Error('connection-operation-lock-unavailable');
        try {
          return await navigator.locks.request(name, signal ? { signal } : {}, locked);
        } catch (error) {
          if (!entered && !signal?.aborted)
            throw new Error('connection-operation-lock-unavailable', { cause: error });
          throw error;
        }
      },
      async dispatchConnectionOperation(hostId, client, pending, dispatch) {
        requireOwner();
        if (!storage) throw new Error('storage-unavailable');
        return withRemoteHostCredentialWrite({
          storage,
          run: () => {
            const { entry, current } = persistentOwner(hostId, client);
            entry.host = readExecutionHost(storage, current);
            if (entry.host.connectionOperationUnavailable)
              throw new Error('connection-operation-storage-unavailable');
            if (entry.host.pendingConnection || entry.host.connectionOwnerChanged)
              throw new Error('connection-management-unconfirmed');
            if (
              pending.deviceId !== current.deviceId ||
              pending.hostKey !== current.encryption?.hostKey
            )
              throw new Error('connection-operation-owner-changed');
            dispatch.check();
            setPendingConnection(hostId, client, pending, undefined, undefined, false);
            const response = dispatch.send();
            void response.catch(() => {});
            publish();
            return { response };
          },
        });
      },
      previousConnectionOperations(hostId, client) {
        requireOwner();
        const entry = clients.get(hostId);
        if (!entry || entry.client !== client) throw new Error('connection-host-changed');
        const records: PendingConnection[] = [];
        for (const item of operationIndex(storage)) {
          if (
            item.record === null ||
            item.hostId !== hostId ||
            item.key === operationKey(entry.host)
          )
            continue;
          const record = indexedPending(storage, item);
          if (!record) throw new Error('connection-operation-storage-unavailable');
          if (record.hostKey !== entry.host.encryption?.hostKey)
            throw new Error('connection-operation-owner-changed');
          records.push(record);
        }
        return records;
      },
      setPendingConnection,
    };
  }

  return { readExecutionHost, connectionOperations };
}
