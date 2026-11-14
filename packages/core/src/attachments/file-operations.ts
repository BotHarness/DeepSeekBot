import { randomUUID } from 'node:crypto';
import { constants, lstatSync, realpathSync } from 'node:fs';
import { open, link, unlink } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { WorkspaceGrantStore } from '../workspaces/grants.js';
import type { AttachmentStore } from './store.js';
import { attachmentIdentity, type ChannelAttachmentRef } from './ref.js';

function within(root: string, target: string): boolean {
  const tail = relative(root, target);
  return tail !== '..' && !tail.startsWith('..' + sep) && !isAbsolute(tail);
}

export interface AttachmentSaveInput {
  channelId?: string;
  messageId: string;
  fileId: string;
  grantId: string;
  destinationPath: string;
  signal?: AbortSignal;
}

export async function saveAttachmentFile(
  input: Pick<AttachmentSaveInput, 'grantId' | 'destinationPath' | 'signal'>,
  deps: {
    botSlug: string;
    grants: WorkspaceGrantStore;
    attachments: AttachmentStore;
    source(): ChannelAttachmentRef;
  },
): Promise<{ path: string; source: ChannelAttachmentRef; size: number }> {
  const initial = deps.grants.requireActive(deps.botSlug, input.grantId);
  if (isAbsolute(input.destinationPath) || !input.destinationPath.trim())
    throw new Error('Attachment destination must be a relative file path in the selected Grant');
  const target = resolve(initial.workspacePath, input.destinationPath);
  const parent = dirname(target);
  const validate = () => {
    input.signal?.throwIfAborted();
    const grant = deps.grants.requireActive(deps.botSlug, input.grantId);
    deps.grants.validatePath?.(deps.botSlug, target);
    if (
      grant.orchestratorWrite !== true ||
      grant.writeRevision !== initial.writeRevision ||
      grant.workspacePath !== initial.workspacePath ||
      !within(grant.workspacePath, target) ||
      target === grant.workspacePath ||
      realpathSync(parent) !== parent
    )
      throw new Error('Attachment destination requires current Orchestrator write authorization');
    return deps.source();
  };
  const source = validate();
  if (source.size > deps.attachments.maxBytes) throw new Error('Attachment exceeds transfer limit');
  const downloaded = await deps.attachments.download(
    attachmentIdentity(source),
    source.name,
    input.signal,
  );
  const temp = join(parent, `.botharness-${randomUUID()}.part`);
  let handle: Awaited<ReturnType<typeof open>> | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  let size = 0;
  try {
    validate();
    handle = await open(
      temp,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o600,
    );
    reader = downloaded.body.getReader();
    while (true) {
      validate();
      const chunk = await reader.read();
      if (chunk.done) break;
      validate();
      size += chunk.value.byteLength;
      if (size > deps.attachments.maxBytes) throw new Error('Attachment exceeds transfer limit');
      let offset = 0;
      while (offset < chunk.value.byteLength) {
        validate();
        const { bytesWritten } = await handle.write(
          chunk.value,
          offset,
          chunk.value.byteLength - offset,
          null,
        );
        if (bytesWritten === 0) throw new Error('Attachment destination write made no progress');
        offset += bytesWritten;
      }
    }
    if (size !== downloaded.ref.size) throw new Error('Attachment changed during transfer');
    validate();
    await handle.close();
    handle = undefined;
    validate();
    await link(temp, target);
    return { path: target, source: downloaded.ref, size };
  } finally {
    if (reader === undefined) await downloaded.body.cancel().catch(() => undefined);
    else {
      await reader.cancel().catch(() => undefined);
      reader.releaseLock();
    }
    await handle?.close();
    if (realpathSync(parent) === parent) await unlink(temp).catch(() => undefined);
  }
}

export async function importAttachmentFile(
  input: { filePath: string; signal?: AbortSignal },
  deps: {
    attachments: AttachmentStore;
    authorize(path: string): void;
  },
): Promise<ChannelAttachmentRef> {
  if (!isAbsolute(input.filePath)) throw new Error('Select an absolute file path to import');
  const path = resolve(input.filePath);
  input.signal?.throwIfAborted();
  deps.authorize(path);
  if (realpathSync(path) !== path)
    throw new Error('Attachment import requires a canonical file path');
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const file = await handle.stat();
    const validate = () => {
      input.signal?.throwIfAborted();
      deps.authorize(path);
      const current = lstatSync(path);
      if (!current.isFile() || current.dev !== file.dev || current.ino !== file.ino)
        throw new Error('Selected attachment file is no longer available');
    };
    if (!file.isFile()) throw new Error('Select a regular file to import');
    if (file.size > deps.attachments.maxBytes)
      throw new Error('Selected attachment exceeds transfer limit');
    validate();
    async function* data() {
      const buffer = Buffer.alloc(64 * 1024);
      while (true) {
        validate();
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        validate();
        if (bytesRead === 0) break;
        yield buffer.subarray(0, bytesRead);
      }
    }
    return await deps.attachments.upload({
      data: data(),
      name: basename(path),
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } finally {
    await handle.close();
  }
}
