import { TeamError } from '../../team/error.js';
import { TeamService } from '../../team/service.js';
import type { Context } from '@deepseek-ai/cordis';
import { attachOperationalModule } from '../../database/owner.js';
import { type BotRuntime } from '../../runtime/bot-runtime.js';
import { installMemberConfinement, MemberConfinement } from '../../execution/member-confinement.js';
import type { BotHarnessCore, createCore } from '../../plugin.js';
type CoreOptions = NonNullable<Parameters<typeof createCore>[0]>;

export function apply({
  operationalDatabase,
  channels,
  contentPurge,
  spaces,
  registry,
  getRuntime,
  tob,
  options,
}: {
  operationalDatabase: BotHarnessCore['operationalDatabase'];
  channels: BotHarnessCore['channels'];
  contentPurge: BotHarnessCore['contentPurge'];
  registry: BotHarnessCore['registry'];
  spaces: () => BotHarnessCore['spaces'];
  getRuntime: () => BotRuntime | undefined;
  tob: () => BotHarnessCore['tob'];
  options: Pick<CoreOptions, 'startupDiagnostic'>;
}) {
  const team = new TeamService(attachOperationalModule(operationalDatabase, 'team'), channels, {
    purge: contentPurge,
    spaces,
    replaceBotMemory: async (slug, action) => {
      const runtime = getRuntime();
      if (!runtime?.replaceOrchestrator) throw new TeamError('unavailable');
      const result = await runtime.replaceOrchestrator(slug, action);
      if (result.outcome === 'refused') throw new TeamError(result.code, undefined, { slug });
      return result.value;
    },
    settleBotPreparations: (humanId) => registry.settled(humanId),
    stopBots: async (slugs) => {
      if (!slugs.length) return;
      const runtime = getRuntime();
      if (!runtime?.stopBot) throw new Error('member-bot-stop-unavailable');
      for (const slug of slugs) await runtime.stopBot(slug);
    },
    ensureTob: (human) => tob().ensure(human),
    log: (phase, facts) => options.startupDiagnostic?.record('team', phase, facts),
  });
  return team;
}

export function mountConfinement(ctx: Context, core: BotHarnessCore, dshHome: string) {
  const memberConfinement = new MemberConfinement(core, dshHome);
  installMemberConfinement(ctx, memberConfinement);
  core.team.bindConfinement(() =>
    process.platform === 'linux' ? memberConfinement.status() : undefined,
  );
}
