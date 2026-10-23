import { createHostClient, deviceRefusal, MethodRefused } from './client';
import type { HostCarrier } from './carrier';
import type { SavedHost } from './hosts';
import type { ZipFilePort } from './zip-import-file';
import { uploadZip, zipUploadIdentity } from './zip-import-upload';
import {
  BotCreationFailure,
  creationReceipt,
  gitImportSource,
  type BotCreationOperation,
  type BotCreationPort,
} from './bot-creation';

export function botCreationTransport(
  hosts: () => readonly SavedHost[],
  carrier: HostCarrier,
  files?: ZipFilePort,
): BotCreationPort {
  const request = async (
    operation: { hostId: string; deviceId: string },
    method: string,
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const host = hosts().find(
      (host) => host.hostId === operation.hostId && host.deviceId === operation.deviceId,
    );
    if (!host) throw new BotCreationFailure('target-unpaired');
    const stillPaired = () =>
      hosts().some(
        (current) =>
          current.hostId === host.hostId &&
          current.deviceId === host.deviceId &&
          current.credential === host.credential,
      );
    for (const route of host.routes) {
      if (!stillPaired()) throw new BotCreationFailure('target-unpaired');
      const client = createHostClient({ ...host, routes: [route], carrier });
      try {
        const result = await client.call<unknown>(method, args);
        if (!stillPaired()) throw new BotCreationFailure('target-unpaired');
        return result;
      } catch (error) {
        if (error instanceof BotCreationFailure) throw error;
        const refusal = deviceRefusal(error);
        if (refusal) throw new BotCreationFailure(refusal);
        if (error instanceof MethodRefused)
          throw new BotCreationFailure(
            (method === 'createLookup' ||
              method === 'botImportLookup' ||
              method === 'botImportPreview' ||
              method.startsWith('zip')) &&
              /not.?found|unknown.?method|method.?unknown|unsupported/u.test(
                error.code.toLowerCase(),
              )
              ? 'host-update-required'
              : error.code,
          );
      } finally {
        client.stop();
      }
    }
    throw new BotCreationFailure('unreachable');
  };
  const call = async (operation: BotCreationOperation, lookup: boolean) => {
    const method =
      operation.source?.kind === 'zip'
        ? lookup
          ? 'zipImportLookup'
          : 'zipImport'
        : operation.source
          ? lookup
            ? 'botImportLookup'
            : 'createFromGit'
          : lookup
            ? 'createLookup'
            : 'create';
    const result = await request(operation, method, {
      ...operation.input,
      operationKey: operation.operationKey,
      ...(operation.source?.kind === 'zip'
        ? {
            sha256: operation.source.sha256,
            ...(!lookup
              ? { uploadKey: operation.source.uploadKey, sizeBytes: operation.source.sizeBytes }
              : {}),
          }
        : operation.source
          ? {
              gitUrl: operation.source.gitUrl,
              expectedCommit: operation.source.commit,
              ...(operation.source.origin ? { origin: operation.source.origin } : {}),
            }
          : {}),
    });
    if (typeof result !== 'object' || result === null || !('receipt' in result))
      throw new BotCreationFailure(lookup ? 'host-update-required' : 'invalid-receipt');
    return creationReceipt(result.receipt, operation.operationKey);
  };
  return {
    ...(files
      ? {
          pickZip: () => files.pick(),
          discardZip: (file: import('./zip-import-file').ZipImportFile) => files.discard?.(file),
        }
      : {}),
    async previewZip(target, source, progress) {
      if (!files) throw new BotCreationFailure('zip-file-unavailable');
      const send = (method: string, args: Record<string, unknown>) => request(target, method, args);
      await uploadZip(source, files, send, progress);
      const result = await send('zipUploadPreview', zipUploadIdentity(source));
      if (
        typeof result !== 'object' ||
        result === null ||
        !('source' in result) ||
        typeof result.source !== 'object' ||
        result.source === null ||
        !('sha256' in result.source) ||
        result.source.sha256 !== source.sha256 ||
        !('descriptor' in result) ||
        typeof result.descriptor !== 'object' ||
        result.descriptor === null ||
        !('displayName' in result.descriptor) ||
        typeof result.descriptor.displayName !== 'string'
      )
        throw new BotCreationFailure('zip-preview-invalid');
      const descriptor = result.descriptor;
      return {
        source,
        displayName: result.descriptor.displayName,
        ...('description' in descriptor && typeof descriptor.description === 'string'
          ? { description: descriptor.description }
          : {}),
        ...('roles' in descriptor &&
        Array.isArray(descriptor.roles) &&
        descriptor.roles.every((role): role is string => typeof role === 'string')
          ? { roles: descriptor.roles }
          : {}),
      };
    },
    deviceId: (id) => hosts().find((host) => host.hostId === id)?.deviceId,
    async preview(target, gitUrl) {
      const result = await request(target, 'botImportPreview', { gitUrl });
      if (typeof result !== 'object' || result === null || !('source' in result))
        throw new BotCreationFailure('host-update-required');
      return gitImportSource(result.source);
    },
    lookup: (operation) => call(operation, true),
    async create(operation, progress) {
      if (operation.source?.kind === 'zip') {
        const existing = await call(operation, true);
        if (existing?.status === 'created') return existing;
        if (!files) throw new BotCreationFailure('zip-file-unavailable');
        await uploadZip(
          operation.source,
          files,
          (method, args) => request(operation, method, args),
          progress,
        );
      }
      const receipt = await call(operation, false);
      if (receipt === null) throw new BotCreationFailure('invalid-receipt');
      return receipt;
    },
  };
}
