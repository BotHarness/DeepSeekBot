import type { Context } from '@deepseek-ai/cordis';
import type { Agent } from '@deepseek-ai/dsh-agent';

import type { PersonaBotRegistry } from '../../bots/registry.js';
import type { ChannelLiveHub } from '../../channels/live.js';
import type { ChannelStore } from '../../channels/store.js';
import type { OperationalDatabaseOwner } from '../../database/owner.js';
import type { DiagnosticEvents } from '../../diagnostics/diagnostic-log.js';
import { DeveloperModeSkillGate, type SkillRegistrar } from '../../logs/skill.js';
import { createSkillViewPort, type SkillAgentPresetsPort } from '../../skills/agent-view.js';
import { SkillCatalog, type SkillRegistryPort } from '../../skills/catalog.js';
import { watchSkillCatalog } from '../../skills/refresh.js';
import type { TobNativeSettings } from '../tob/cli-model-operations.js';
import type { WorkspaceGrantStore } from '../../workspaces/grants.js';

export interface DeveloperMode {
  target: { gate?: DeveloperModeSkillGate };
  sync(): void;
  set(enabled: boolean): void;
  mountSettings(
    ctx: Context,
    onDocumentUpdated: (listener: (namespace: string) => void) => void,
  ): void;
}

export interface NativeSkillHost {
  agentFor(ctx: Context, sessionId: string | undefined): Agent | undefined;
  presets(ctx: Context): SkillAgentPresetsPort<Agent> | undefined;
  registry(ctx: Context): SkillRegistryPort | undefined;
  degrade(ctx: Context, capability: string): () => void;
  installInvalidation(ctx: Context, attached: (invalidate: () => void) => () => void): () => void;
  onSkillsChange(ctx: Context, changed: () => void): () => void;
  onAgentsChange(ctx: Context, changed: () => void): () => void;
}

export interface NativeSkillsOptions {
  developerMode: DeveloperMode;
  getRegistrar(skillsCtx: Context): SkillRegistrar;
  localVoiceSkill(): Parameters<SkillRegistrar['register']>[0];
}

export function createDeveloperMode(
  readSettings: () => Pick<TobNativeSettings, 'describe'> | undefined,
): DeveloperMode {
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

export function createSkillResources(
  ctx: Context,
  core: {
    channels: Pick<ChannelStore, 'list'>;
    grants: Pick<WorkspaceGrantStore, 'list' | 'requireActive'>;
    live: Pick<ChannelLiveHub, 'publishSkillCatalogChanged'>;
    operationalDatabase: Pick<OperationalDatabaseOwner, 'mode' | 'subscribe'>;
    registry: Pick<PersonaBotRegistry, 'get' | 'list' | 'memoryDirFor'>;
    runtime: { currentOrchestratorSessionId?(botSlug: string): string | undefined };
  },
  {
    botModeOf,
    diagnosticEvents,
    nativeHost,
  }: {
    botModeOf: (slug: string) => string;
    diagnosticEvents: Pick<DiagnosticEvents, 'record'>;
    nativeHost: NativeSkillHost;
  },
) {
  let reconcileBotModeSkills: (() => void) | undefined;
  let invalidateNativeSkills: (() => void) | undefined;
  const skillAgentFor = (slug: string) =>
    nativeHost.agentFor(ctx, core.runtime.currentOrchestratorSessionId?.(slug));
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
      agentPresets: () => nativeHost.presets(ctx),
    }),
  });
  const mountWatch = () =>
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
      const offHost = nativeHost.onSkillsChange(ctx, () => void refresh.hostChanged());
      const offAgents = nativeHost.onAgentsChange(ctx, () => refresh.reconcile());
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
    mountWatch,
    mountNative({ developerMode, getRegistrar, localVoiceSkill }: NativeSkillsOptions) {
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
          const registry = nativeHost.registry(skillsCtx);
          if (registry === undefined) return nativeHost.degrade(skillsCtx, 'skills.list');
          const detach = skillCatalog.attach(registry);
          const stop = nativeHost.installInvalidation(skillsCtx, (invalidate) => {
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
