import {
  loadMessageAttachmentTarget,
  loadChannelMediaTarget,
  loadMemoryFileTarget,
  loadWorkspaceFileTarget,
  loadFilesPage,
  type FilesPage,
  type BridgeCall,
} from './bridge.js';
import {
  memoryDownloadUrl,
  type HostFileTarget,
  type HostFileOptions,
  type HostFileOpen,
} from './host-file-actions.js';
import { createFileOpenPreferences, type FileOpenPreferences } from './file-open-preferences.js';
import type { ActionFolderAccess, ActionResources } from './actions.js';

export interface FileActions {
  deletionFolderApplications(slug: string): Promise<HostFileOptions>;
  deletionFolderOpen(slug: string, choice?: HostFileOpen): Promise<void>;
  channelFilesPage(
    channelId: string,
    request: { before?: number; limit?: number },
    signal?: AbortSignal,
  ): Promise<FilesPage>;
  messageAttachmentTarget(
    channelId: string,
    messageId: string,
    fileId: string,
  ): Promise<HostFileTarget>;
  messageAttachmentApplications(
    channelId: string,
    messageId: string,
    fileId: string,
  ): Promise<HostFileOptions>;
  messageAttachmentOpen(
    channelId: string,
    messageId: string,
    fileId: string,
    choice: HostFileOpen,
  ): Promise<void>;
  messageAttachmentDownload(channelId: string, messageId: string, fileId: string): Promise<void>;
  bridgeFileCommands?(sourceEventId: string):
    | (import('./host-file-menu.js').HostFileCommands & {
        available(): Promise<boolean>;
      })
    | undefined;
  workspaceFileTarget(slug: string, grantId: string): Promise<HostFileTarget>;
  workspaceFileApplications(slug: string, grantId: string): Promise<HostFileOptions>;
  workspaceFileOpen(slug: string, grantId: string, choice: HostFileOpen): Promise<void>;
  memoryFileTarget(slug: string, path: string): Promise<HostFileTarget>;
  memoryFileApplications(slug: string, path: string): Promise<HostFileOptions>;
  memoryFileOpen(slug: string, path: string, choice: HostFileOpen): Promise<void>;
  memoryFileDownload(slug: string, path: string): Promise<void>;
  fileOpenPreferences: FileOpenPreferences;
}

export function createFileActions(
  call: BridgeCall,
  folderAccess: ActionFolderAccess | undefined,
  resources: ActionResources | undefined,
) {
  let openingFile = false;
  const fileOpenPreferences =
    folderAccess?.fileOpenPreferences ?? createFileOpenPreferences({ storage: undefined });

  return {
    async deletionFolderApplications(slug) {
      const result = await call('deletionMemoryFolder', { slug });
      if (!result.ok) throw new Error(result.error.message);
      const target = (result.value as { target: HostFileTarget }).target;
      return (
        folderAccess?.nativeFiles?.applications(target) ?? {
          available: false,
          applications: [],
        }
      );
    },
    async deletionFolderOpen(slug, choice) {
      if (openingFile) throw new Error('A Host file open is already in progress');
      openingFile = true;
      try {
        const result = await call('deletionMemoryFolder', { slug });
        if (!result.ok) throw new Error(result.error.message);
        const target = (result.value as { target: HostFileTarget }).target;
        const native = folderAccess?.nativeFiles;
        if (native === undefined) throw new Error('DSH Host opening is unavailable');
        if (choice === undefined) {
          const handlers = await native.applications(target);
          const manager = handlers.applications.find((app) =>
            ['finder', 'explorer', 'filemanager'].includes(app.id),
          );
          if (manager === undefined) throw new Error('No installed Host file manager is available');
          choice = { application: manager.id };
        }
        await native.open(target, choice);
      } finally {
        openingFile = false;
      }
    },
    channelFilesPage: (channelId, request, signal) =>
      loadFilesPage(call, channelId, request, signal),
    bridgeFileCommands: (sourceEventId) =>
      folderAccess?.nativeFiles === undefined
        ? undefined
        : {
            available: () => folderAccess.nativeFiles!.available?.() ?? Promise.resolve(false),
            target: (channelId, attachmentId) =>
              loadChannelMediaTarget(call, channelId, sourceEventId, attachmentId),
            applications: async (channelId, attachmentId) => {
              const target = await loadChannelMediaTarget(
                call,
                channelId,
                sourceEventId,
                attachmentId,
              );
              return folderAccess.nativeFiles!.applications(target);
            },
            open: async (channelId, attachmentId, choice) => {
              if (openingFile) throw new Error('A Host file open is already in progress');
              openingFile = true;
              try {
                const target = await loadChannelMediaTarget(
                  call,
                  channelId,
                  sourceEventId,
                  attachmentId,
                );
                await folderAccess.nativeFiles!.open(target, choice);
              } finally {
                openingFile = false;
              }
            },
            preferences: fileOpenPreferences,
          },
    messageAttachmentTarget: (channelId, messageId, fileId) =>
      loadMessageAttachmentTarget(call, channelId, messageId, fileId),
    async messageAttachmentApplications(channelId, messageId, fileId) {
      const target = await loadMessageAttachmentTarget(call, channelId, messageId, fileId);
      return (
        folderAccess?.nativeFiles?.applications(target) ?? {
          available: false,
          applications: [],
        }
      );
    },
    async messageAttachmentOpen(channelId, messageId, fileId, choice) {
      if (openingFile) throw new Error('A Host file open is already in progress');
      openingFile = true;
      try {
        const target = await loadMessageAttachmentTarget(call, channelId, messageId, fileId);
        if (folderAccess?.nativeFiles === undefined)
          throw new Error('DSH Host opening is unavailable');
        await folderAccess.nativeFiles.open(target, choice);
      } finally {
        openingFile = false;
      }
    },
    async messageAttachmentDownload(channelId, messageId, fileId) {
      const target = await loadMessageAttachmentTarget(call, channelId, messageId, fileId);
      const path =
        '/api/botharness/attachment?' + new URLSearchParams({ channelId, messageId, fileId });
      if (resources !== undefined) return resources.download(path, target.relativePath);
      const anchor = document.createElement('a');
      anchor.href =
        './api/botharness/attachment?' + new URLSearchParams({ channelId, messageId, fileId });
      anchor.download = target.relativePath;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
    workspaceFileTarget: (slug, grantId) => loadWorkspaceFileTarget(call, slug, grantId),
    async workspaceFileApplications(slug, grantId) {
      const target = await loadWorkspaceFileTarget(call, slug, grantId);
      return (
        folderAccess?.nativeFiles?.applications(target) ?? {
          available: false,
          applications: [],
        }
      );
    },
    async workspaceFileOpen(slug, grantId, choice) {
      if (openingFile) throw new Error('A Host file open is already in progress');
      openingFile = true;
      try {
        const target = await loadWorkspaceFileTarget(call, slug, grantId);
        if (folderAccess?.nativeFiles === undefined)
          throw new Error('DSH Host opening is unavailable');
        await folderAccess.nativeFiles.open(target, choice);
      } finally {
        openingFile = false;
      }
    },
    fileOpenPreferences,
    memoryFileTarget: (slug, path) => loadMemoryFileTarget(call, slug, path),
    async memoryFileApplications(slug, path) {
      const target = await loadMemoryFileTarget(call, slug, path);
      return (
        folderAccess?.nativeFiles?.applications(target) ?? {
          available: false,
          applications: [],
        }
      );
    },
    async memoryFileOpen(slug, path, choice) {
      if (openingFile) throw new Error('A Host file open is already in progress');
      openingFile = true;
      try {
        const target = await loadMemoryFileTarget(call, slug, path);
        if (folderAccess?.nativeFiles === undefined)
          throw new Error('DSH Host opening is unavailable');
        await folderAccess.nativeFiles.open(target, choice);
      } finally {
        openingFile = false;
      }
    },
    async memoryFileDownload(slug, path) {
      const target = await loadMemoryFileTarget(call, slug, path);
      if (target.kind !== 'file') throw new Error('Only files can be downloaded');
      if (resources !== undefined)
        return resources.download(
          '/api/botharness/memory/file?' + new URLSearchParams({ slug, path }),
          path.split('/').at(-1) ?? '',
        );
      const anchor = document.createElement('a');
      anchor.href = memoryDownloadUrl(slug, path);
      anchor.download = path.split('/').at(-1) ?? '';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
    },
  } satisfies FileActions;
}
