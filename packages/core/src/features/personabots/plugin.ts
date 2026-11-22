import { createRosterStore } from '../../roster/store.js';
import { createBotCreation } from '../../bots/creation.js';
import { createBotImports } from '../../bots/imports.js';
import { createBotZipImport } from '../../bots/zip-import.js';
import { createBotZipUploads } from '../../bots/zip-upload.js';
import { createClientAcknowledgements } from '../../onboarding/acknowledgements.js';
import { createBotOnboarding } from '../../onboarding/service.js';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { createCoreStartup } from '../../diagnostics/core-startup.js';
import { type PersonaBotRegistry } from '../../bots/registry.js';
import { createPersonaBotDeletions } from '../../bots/deletion.js';
import { attachOperationalModule } from '../../database/owner.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply({
  operationalDatabase,
  registry,
  channels,
  options,
}: {
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  registry: BotHarnessCore['registry'];
  channels: BotHarnessCore['channels'];
  options: Pick<CoreOptions, 'warn'>;
}) {
  const creations = createBotCreation({
    database: attachOperationalModule(operationalDatabase, 'bot-creation'),
    registry,
    channels,
    ...(options.warn === undefined ? {} : { log: options.warn }),
  });
  return creations;
}

export function createZipImports({
  dshHome,
  registry,
  creations,
  options,
}: {
  dshHome: string;
  registry: BotHarnessCore['registry'];
  creations: BotHarnessCore['creations'];
  options: Pick<CoreOptions, 'warn'>;
}) {
  const zipImports = createBotZipImport({
    uploads: createBotZipUploads({
      rootDir: join(dshHome, 'botharness', 'zip-uploads'),
    }),
    imports: createBotImports(creations),
    registry,
    log: (event) => options.warn?.(JSON.stringify(event)),
  });
  return zipImports;
}

export function createDeletions({
  channels,
  options,
  dshHome,
  operationalDatabase,
  registry,
  ownership,
  grants,
  toolRules,
  externalMessaging,
  runtime,
  spaces,
  live,
  contentPurge,
}: {
  channels: BotHarnessCore['channels'];
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  registry: BotHarnessCore['registry'];
  ownership: BotHarnessCore['ownership'];
  grants: BotHarnessCore['grants'];
  toolRules: BotHarnessCore['toolRules'];
  externalMessaging: BotHarnessCore['externalMessaging'];
  runtime: BotHarnessCore['runtime'];
  spaces: BotHarnessCore['spaces'];
  contentPurge: BotHarnessCore['contentPurge'];
  dshHome: string;
  live: () => BotHarnessCore['live'] | undefined;
  options: Pick<CoreOptions, 'capture' | 'workspaces' | 'erasePrivateAccounts' | 'warn'>;
}) {
  const deletions = createPersonaBotDeletions({
    accept: (slug, commit) => channels.removeBotFromGroups(slug, commit),
    ...(options.capture === undefined ? {} : { capture: options.capture }),
    protectedPaths: [dshHome],
    database: operationalDatabase,
    registry,
    dependencies: (slug) => ({
      sessions: ownership
        .rootsFor(slug)
        .flatMap((root) => [
          root.sessionId,
          ...ownership.descendantsOf(root.sessionId).map((child) => child.sessionId),
        ])
        .sort(),
      workspaces: grants
        .list(slug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => grant.workspacePath)
        .sort(),
      grants: [
        ...grants
          .list(slug)
          .filter((grant) => grant.revokedAt === undefined)
          .map((grant) => grant.id),
        ...toolRules.list(slug).map((rule) => rule.id),
        ...externalMessaging.deletionDependencies(slug).grants,
      ].sort(),
      identities: externalMessaging.deletionDependencies(slug).identities,
      channels: channels
        .list()
        .filter((channel) => channel.members.includes(slug) || channel.botSlug === slug)
        .map((channel) => channel.id)
        .sort(),
    }),
    allWorkspacePaths: () => [
      ...(options.workspaces?.()?.list() ?? []).map((workspace) => workspace.path),
      ...registry
        .listHistorical()
        .flatMap((bot) => [
          ...bot.workspaces,
          ...grants.list(bot.slug).map((grant) => grant.workspacePath),
          ...ownership
            .rootsFor(bot.slug, 'assignment')
            .flatMap((root) => (root.cwdReference === undefined ? [] : [root.cwdReference])),
        ]),
    ],
    stop: async (slug) => {
      channels.removeBotFromGroups(slug);
      channels.cancelInvitationsForBot(slug);
      for (const grant of grants.list(slug))
        if (grant.revokedAt === undefined) grants.revoke(slug, grant.id);
      for (const rule of toolRules.list(slug)) toolRules.revoke(slug, rule.id);
      await runtime?.stopBot?.(slug);
      await externalMessaging.disableBot(slug);
      await options.erasePrivateAccounts?.(slug);
    },
    changed: (slug) => {
      spaces.botMemory.cleanupErased(slug);
      live()?.publishRosterCommitted();
    },
    log: (event) => options.warn?.(JSON.stringify(event)),
  });
  contentPurge.bindMemberBots(deletions);
  return deletions;
}

export function createOnboarding(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  tob: BotHarnessCore['tob'],
  registry: PersonaBotRegistry,
  channels: BotHarnessCore['channels'],
  startup: ReturnType<typeof createCoreStartup>,
) {
  const onboarding = createBotOnboarding({
    database: attachOperationalModule(operationalDatabase, 'bot-onboarding'),
    tob,
    registry,
    channels,
  });
  startup.enter('client-acknowledgements', 'initialize');
  const acknowledgements = createClientAcknowledgements({
    database: attachOperationalModule(operationalDatabase, 'bot-onboarding'),
  });
  return { onboarding, acknowledgements };
}

export function mountRosterCleanup(ctx: Context, core: Pick<BotHarnessCore, 'roster'>) {
  ctx.effect(() => () => core.roster.detach(), 'botharness: roster');
}

export function createRoster(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  warn: CoreOptions['warn'],
  live: () => BotHarnessCore['live'] | undefined,
) {
  return createRosterStore({
    database: operationalDatabase,
    warn,
    onCommitted: () => live()?.publishRosterCommitted(),
  });
}
