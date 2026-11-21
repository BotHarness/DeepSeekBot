import { nativeReleaseRuntime } from '../../release/compatibility.js';
import { createProfileBackupHttp, PROFILE_BACKUP_PATH } from '../../portability/http.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { startAttachmentSweep } from '../../attachments/sweep.js';
import { startMediaBackfill } from '../../attachments/media-backfill.js';
import { createStorageCleanup } from '../../storage/media-cleanup.js';
import { memoryAttachmentReferences } from '../../memory/backup.js';
import { homedir } from 'node:os';
import { type ReleaseRestarter } from '../../release/restart.js';
import { installedDshVersion } from '../../telemetry/service.js';
import { createHostModelCatalog } from '../../models/host-models.js';
import { failOperationalDatabase } from '../../database/owner.js';
import { applyPendingDataReset, createDataReset } from '../../data-reset/reset.js';
import type { BotHarnessCore } from '../../plugin.js';

export function apply(ctx: Context, dshHome: string) {
  applyPendingDataReset({
    dshHome,
    home: homedir(),
    log: (message) => ctx.logger.info(message),
  });
}

export function mountStorage(
  ctx: Context,
  core: Pick<
    BotHarnessCore,
    | 'operationalDatabase'
    | 'attachments'
    | 'channels'
    | 'registry'
    | 'deletions'
    | 'live'
    | 'mediaVersions'
  >,
  dshHome: string,
) {
  const storage = createStorageCleanup({
    dshHome,
    database: core.operationalDatabase,
    attachments: core.attachments,
    channels: core.channels,
    memoryDirs: () =>
      core.registry.listHistorical().flatMap((bot) => core.registry.memoryDirFor(bot.slug) ?? []),
    memoryReferences: () => memoryAttachmentReferences(core.registry, core.deletions),
    botName: (slug) => core.registry.get(slug)?.displayName,
    cleared: (placements) => {
      for (const { channelId, messageId } of placements) {
        const message = core.channels.message(channelId, messageId);
        if (message !== undefined) core.live.publishAttachments(channelId, messageId, message);
      }
    },
  });
  ctx.effect(
    () =>
      startAttachmentSweep({
        attachments: core.attachments,
        database: core.operationalDatabase,
        channelReferences: () => core.channels.referencedAttachmentHashes(),
        memoryReferences: () => memoryAttachmentReferences(core.registry, core.deletions),
        log: (message) => ctx.logger.info(message),
      }),
    'botharness: attachment sweep',
  );
  ctx.effect(
    () =>
      startMediaBackfill({
        fileIds: () => core.channels.referencedAttachmentHashes(),
        versions: core.mediaVersions,
        log: (message) => ctx.logger.info(message),
      }),
    'botharness: media backfill',
  );
  return storage;
}

export function createReset(
  ctx: Context,
  core: Pick<BotHarnessCore, 'registry' | 'operationalDatabase'>,
  dshHome: string,
  releaseRestarter: { current: ReleaseRestarter | undefined },
) {
  const dataReset = createDataReset({
    dshHome,
    home: homedir(),
    bots: () => {
      const bots = core.registry.listHistorical();
      return {
        count: bots.length,
        chosenMemoryDirs: bots.flatMap((bot) => {
          const memoryDir = core.registry.memoryDirFor(bot.slug);
          return memoryDir === undefined ||
            memoryDir === core.registry.defaultMemoryDirFor(bot.slug)
            ? []
            : [memoryDir];
        }),
      };
    },
    restarter: () => releaseRestarter.current,
    stopWriting: () =>
      failOperationalDatabase(
        core.operationalDatabase,
        'BotHarness data is being cleared; restart the Host to finish',
      ),
    log: (message) => ctx.logger.info(message),
  });
  return dataReset;
}

export function mountFetch(
  ctx: Context,
  connectionCtx: Context,
  fetch: {
    register(route: {
      path: string;
      methods: readonly ('GET' | 'POST')[];
      requestBody: 'buffered' | 'streaming';
      fetch(request: Request): Promise<Response>;
    }): () => Promise<void>;
  },
  core: Pick<
    BotHarnessCore,
    | 'operationalDatabase'
    | 'registry'
    | 'deletions'
    | 'attachments'
    | 'contentPurge'
    | 'ownership'
    | 'profileRecovery'
  >,
  {
    dshHome,
    runningRelease,
    modelCatalog,
  }: {
    dshHome: string;
    runningRelease: { version: string };
    modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'];
  },
) {
  const profileBackupHttp = createProfileBackupHttp(
    {
      database: core.operationalDatabase,
      registry: core.registry,
      deletions: core.deletions,
      attachments: core.attachments,
      purge: core.contentPurge,
      version: runningRelease.version,
      sessionCount: () => core.ownership.list().length,
      runtimeVersions: async () => ({
        host: (await nativeReleaseRuntime())?.version ?? null,
        tools: installedDshVersion() ?? null,
      }),
      log: (message) => ctx.logger.info(message),
    },
    join(dshHome, 'botharness', 'backup-staging'),
    core.profileRecovery,
    modelCatalog,
  );
  for (const suffix of ['', '/inspect', '/recovery', '/authorize', '/activate'])
    connectionCtx.effect(
      () =>
        fetch.register({
          path: PROFILE_BACKUP_PATH + suffix,
          methods: ['GET', 'POST'],
          requestBody: suffix === '/inspect' ? 'streaming' : 'buffered',
          fetch: profileBackupHttp,
        }),
      'botharness: complete environment backup ' + suffix,
    );
}

export { createProfileRecovery } from '../../portability/recovery.js';
