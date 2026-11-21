import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';

import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelLiveHub } from '../../channels/live.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseOwner } from '../../database/owner.js';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import { DeveloperModeSkillGate, type SkillRegistrar } from '../../logs/skill.js';
import type { BotRuntime } from '../../runtime/bot-runtime.js';
import {
  degradeHostCapability,
  hostAgentPresets,
  hostSkillRegistry,
  installHostSkillInvalidation,
  onHostSkillsChange,
  hostSkillAgent,
  onHostSkillAgentsChange,
} from '../../runtime/native-agent-compat.js';
import { createSkillViewPort, type SkillAgentPresetsPort } from '../../skills/agent-view.js';
import { SkillCatalog, type SkillRegistryPort } from '../../skills/catalog.js';
import { watchSkillCatalog } from '../../skills/refresh.js';
import type { TobNativeSettings } from '../../tob/cli-model-operations.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';

export function createDeveloperMode(
  readSettings: () => Pick<TobNativeSettings, 'describe'> | undefined,
) {
  const target: { gate?: DeveloperModeSkillGate } = {};
  const syncDeveloperMode = () => {
    let enabled = false;
    try {
      const settings = readSettings();
      const value = settings
        ?.describe({ redactSecrets: true })
        .find((entry) => entry.ns === 'botharness-client')?.value;
      enabled =
        typeof value === 'object' &&
        value !== null &&
        'developerMode' in value &&
        value.developerMode === true;
    } catch {}
    target.gate?.set(enabled);
  };

  return {
    target,
    sync: syncDeveloperMode,
    set: (enabled: boolean) => target.gate?.set(enabled),
    mountSettings(
      settingsCtx: Context,
      onDocumentUpdated: (listener: (namespace: string) => void) => void,
    ) {
      onDocumentUpdated((namespace) => {
        if (namespace === 'botharness-client') syncDeveloperMode();
      });
      settingsCtx.effect(() => {
        syncDeveloperMode();
        return () => target.gate?.set(false);
      }, 'botharness: developer mode settings');
    },
  };
}

export function apply(
  ctx: Context,
  core: {
    channels: Pick<ChannelStore, 'list'>;
    grants: Pick<WorkspaceGrantStore, 'list' | 'requireActive'>;
    live: Pick<ChannelLiveHub, 'publishSkillCatalogChanged'>;
    operationalDatabase: Pick<OperationalDatabaseOwner, 'mode' | 'subscribe'>;
    registry: Pick<PersonaBotRegistry, 'get' | 'list' | 'memoryDirFor'>;
    runtime: Pick<BotRuntime, 'currentOrchestratorSessionId'>;
  },
  {
    botModeOf,
    diagnosticEvents,
  }: {
    botModeOf: (slug: string) => string;
    diagnosticEvents: Pick<DiagnosticEvents, 'record'>;
  },
) {
  let reconcileBotModeSkills: (() => void) | undefined;
  let invalidateNativeSkills: (() => void) | undefined;
  const skillAgentFor = (slug: string) =>
    hostSkillAgent(ctx, core.runtime.currentOrchestratorSessionId?.(slug));
  const skillCatalog = new SkillCatalog({
    grantsFor: (slug) =>
      core.grants.list(slug).flatMap((grant) => {
        try {
          return [core.grants.requireActive(slug, grant.id)];
        } catch {
          return [];
        }
      }),
    memoryDirFor: (slug) =>
      core.registry.get(slug) === undefined ? undefined : core.registry.memoryDirFor(slug),
    viewFor: createSkillViewPort({
      agentFor: skillAgentFor,
      presetFor: botModeOf,
      agentPresets: () => hostAgentPresets<SkillAgentPresetsPort<Agent>>(ctx),
    }),
  });
  ctx.effect(() => {
    if (core.operationalDatabase.mode !== 'ready') return () => undefined;
    const refresh = watchSkillCatalog({
      catalog: skillCatalog,
      invalidateNative: () => invalidateNativeSkills?.(),
      bots: () =>
        core.registry.list().flatMap((bot) => {
          const memoryDir = core.registry.memoryDirFor(bot.slug);
          return memoryDir === undefined
            ? []
            : [
                {
                  slug: bot.slug,
                  memoryDir,
                  agent: skillAgentFor(bot.slug),
                  preset: botModeOf(bot.slug),
                },
              ];
        }),
      changed: (botSlugs) =>
        core.live.publishSkillCatalogChanged({
          botSlugs,
          channelIds: core.channels
            .list()
            .filter(
              (channel) =>
                channel.deletedAt === undefined &&
                channel.members.some((slug) => botSlugs.includes(slug)),
            )
            .map((channel) => channel.id),
        }),
      diagnostic: (phase, fields) => diagnosticEvents.record('skills', phase, fields),
    });
    const offRegistry = core.operationalDatabase.subscribe(({ topics }) => {
      if (
        topics.some((topic) =>
          ['bot-registry', 'member-purged', 'session-ownership', 'workspace-grants'].includes(
            topic,
          ),
        )
      )
        refresh.reconcile();
    });
    const offHost = onHostSkillsChange(ctx, () => void refresh.hostChanged());
    const offAgents = onHostSkillAgentsChange(ctx, () => refresh.reconcile());
    reconcileBotModeSkills = () => refresh.reconcile();
    return () => {
      reconcileBotModeSkills = undefined;
      offAgents();
      offHost();
      offRegistry();
      refresh.close();
    };
  }, 'botharness: live skill catalog');

  return {
    catalog: skillCatalog,
    reconcileBotMode: () => reconcileBotModeSkills?.(),
    mountNative({
      developerMode,
      getRegistrar,
      localVoiceSkill,
    }: {
      developerMode: ReturnType<typeof createDeveloperMode>;
      getRegistrar: (skillsCtx: Context) => SkillRegistrar;
      localVoiceSkill: () => Parameters<SkillRegistrar['register']>[0];
    }) {
      ctx.inject(['skills'], (skillsCtx) => {
        const skills = getRegistrar(skillsCtx);
        const gate = new DeveloperModeSkillGate({
          register: (definition) => {
            let dispose: (() => void) | undefined;
            skillsCtx.effect(() => {
              dispose = skills.register(definition);
              return () => dispose?.();
            }, 'botharness: operational logs skill');
            return () => dispose?.();
          },
        });
        developerMode.target.gate = gate;
        skillsCtx.effect(() => {
          const registry = hostSkillRegistry<SkillRegistryPort>(skillsCtx);
          if (registry === undefined) return degradeHostCapability(skillsCtx, 'skills.list');
          const detach = skillCatalog.attach(registry);
          const stop = installHostSkillInvalidation(skillsCtx, (invalidate) => {
            invalidateNativeSkills = invalidate;
            return () => {
              if (invalidateNativeSkills === invalidate) invalidateNativeSkills = undefined;
            };
          });
          return () => {
            stop();
            detach();
          };
        }, 'botharness: skill catalog');
        skillsCtx.effect(() => skills.register(localVoiceSkill()), 'botharness: local voice skill');
        skillsCtx.effect(() => {
          developerMode.sync();
          return () => {
            gate.set(false);
            if (developerMode.target.gate === gate) delete developerMode.target.gate;
          };
        }, 'botharness: developer mode skill gate');
      });
    },
  };
}
