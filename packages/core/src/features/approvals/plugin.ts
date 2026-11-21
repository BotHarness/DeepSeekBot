import { toolEffects } from '../../workspaces/tool-effects.js';
import { installNativeSearchResultGuard } from '../../workspaces/grant-native-tools.js';
import { questionAnswerReceipts } from '../../channels/question-answer-receipts.js';
import type { ModelFreeTobCliInvocation } from '../../tob/cli-invocation.js';
import { nativeTimedQuestions } from '../../channels/native-timed-questions.js';
import { credentialStoreDenial } from '../../credentials/store-guard.js';
import { secretCommandDenial } from '../../credentials/secret-command.js';
import { rememberedStarts, secretMcpDenial } from '../../credentials/secret-mcp.js';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Context } from '@deepseek-ai/cordis';
import { type ApprovalService } from '@deepseek-ai/dsh-user-approval';
import { randomUUID } from 'node:crypto';
import { createHostModelCatalog } from '../../models/host-models.js';
import { openLogDatabase, type LogDatabase } from '../../logs/log-db.js';
import { attachOperationalModule } from '../../database/owner.js';
import { resolveDshHome } from '../../im/config-store.js';
import {
  deviceToolAuthorization,
  grantToolExecutionDenial,
  isDshGovernedTool,
  requiresHumanToolApproval,
  approvalTemplateInUse,
  sessionHasFullAccess,
} from '../../workspaces/grant-execution.js';
import {
  ChannelToolApproval,
  registerChannelToolApproval,
  requestRequiredToolApproval,
  type ToolAutoApproval,
} from '../../workspaces/tool-approval.js';
import {
  changesApprovalPolicy,
  deletesMarketplaceBot,
  publishesBotMemory,
  createApprovalTemplateLibrary,
} from '../../workspaces/approval-templates.js';
import {
  APPROVAL_REVIEW_SESSION_PREFIX,
  createApprovalReviewRunner,
} from '../../workspaces/approval-reviewer.js';
import { createApprovalReviewerSettings } from '../../workspaces/approval-reviewer-settings.js';
import {
  ChannelUserQuestions,
  registerChannelUserQuestions,
} from '../../channels/user-questions.js';
import type { PrivateInputs } from '../../credentials/private-inputs.js';
import { createToolApprovalRuleStore } from '../../workspaces/tool-approval-rules.js';
import { type DshDefaultModelHost } from '../../runtime/dsh-bot-agent-adapter.js';
import type { DshSessionStore } from '../../sessions/source.js';
import * as messaging from '../messaging/plugin.js';
import type { BotHarnessCore } from '../../plugin.js';

function reviewerRejectionText(reason: string): string {
  return (
    "The Approval Reviewer rejected this call under the Bot's Approval Template: " +
    reason +
    ' Try another way that the template allows, or ask the Human. The Human can still allow this exact call once from the Inbox; you will be told if they do.'
  );
}

export function createRules(
  operationalDatabase: BotHarnessCore['operationalDatabase'],
  externalMessaging: BotHarnessCore['externalMessaging'],
) {
  const toolRules = createToolApprovalRuleStore(
    attachOperationalModule(operationalDatabase, 'tool-approval-rules'),
    (botSlug, creator) => externalMessaging.toolRuleCreatorAuthorized(botSlug, creator),
  );
  const reconcileCreators = (slug: string) => {
    toolRules.reconcileExternal(slug);
    externalMessaging.approvals.refreshRules(slug);
  };
  return { toolRules, reconcileCreators };
}

export function apply(dshHome: string) {
  const approvalTemplates = createApprovalTemplateLibrary(
    join(dshHome, 'botharness', 'approval-templates'),
  );
  const approvalReviewer = createApprovalReviewerSettings(join(dshHome, 'botharness'));
  return { approvalTemplates, approvalReviewer };
}

export function mount(
  ctx: Context,
  core: BotHarnessCore,
  {
    dshHome,
    approvalTemplates,
    approvalReviewer,
    defaultModel,
    modelCatalog,
    reviewing,
    privateInputs,
    sessions,
    publishToolApproval,
    publishQuestions,
    tobCliInvocation,
    permissionDenial,
  }: {
    dshHome: string;
    approvalTemplates: ReturnType<typeof createApprovalTemplateLibrary>;
    approvalReviewer: ReturnType<typeof createApprovalReviewerSettings>;
    defaultModel: DshDefaultModelHost;
    modelCatalog: ReturnType<typeof createHostModelCatalog>['modelCatalog'];
    reviewing: Set<string>;
    privateInputs: () => PrivateInputs | undefined;
    sessions: () => DshSessionStore;
    publishToolApproval(approval: ChannelToolApproval): void;
    publishQuestions(questions: ChannelUserQuestions): void;
    tobCliInvocation: ModelFreeTobCliInvocation;
    permissionDenial(session: import('@deepseek-ai/dsh-session').Session): string | undefined;
  },
) {
  let reviewLogs: LogDatabase | undefined;
  try {
    reviewLogs = openLogDatabase({ dir: join(dshHome, 'botharness') });
  } catch {
    reviewLogs = undefined;
  }
  ctx.effect(() => () => reviewLogs?.close(), 'botharness: approval review logs');
  const templateInUse = approvalTemplateInUse(core.registry, approvalTemplates);
  const autoApproval: ToolAutoApproval = {
    template: (slug) => {
      const selection = core.registry.get(slug)?.approvalTemplate;
      if (selection === undefined) return undefined;
      const global = selection === '@global' ? approvalTemplates.global() : undefined;
      if (global?.kind === 'invalid') throw new Error('global-template-unreadable');
      const name =
        global === undefined ? selection : global.kind === 'selected' ? global.name : undefined;
      if (name === undefined) return undefined;
      const template = approvalTemplates.get(name);
      if (template === undefined) throw new Error('selected-template-unavailable');
      return { name: template.name, text: template.text };
    },
    templateInUse,
    excerptLimits: (slug) => {
      const limits = core.prompts.limits(slug);
      return {
        humanMessages: limits['review-human-messages'],
        humanMessageChars: limits['review-human-message-chars'],
        toolCalls: limits['review-tool-calls'],
      };
    },
    review: createApprovalReviewRunner({
      setting: () => approvalReviewer.model(),
      botRoute: (slug) => {
        const own = core.registry.get(slug)?.modelPlan?.orchestrator;
        if (own !== undefined) return own;
        try {
          return defaultModel.currentSelection();
        } catch {
          return undefined;
        }
      },
      validate: (route) => modelCatalog.validate(route),
      agents: () => ctx.agents,
      session: (request) => {
        const sessionId = APPROVAL_REVIEW_SESSION_PREFIX + randomUUID();
        const cwd = join(dshHome, 'botharness', 'approval-reviews');
        mkdirSync(cwd, { recursive: true });
        const titles = ctx.get('sessionTitle') as
          | { rename?: (session: unknown, title: string) => void }
          | undefined;
        reviewing.add(sessionId);
        return {
          sessionId,
          cwd,
          timeoutMs: core.prompts.limits(request.botSlug)['review-timeout-seconds'] * 1000,
          botName: core.registry.get(request.botSlug)?.displayName ?? request.botSlug,
          ...(typeof titles?.rename === 'function'
            ? { rename: (session, title) => titles.rename!(session, title) }
            : {}),
        };
      },
      settle: (sessionId) => reviewing.delete(sessionId),
    }),
    log: (entry) => {
      const detail =
        `approval-review bot=${entry.botSlug} template=${entry.template} tool=${entry.toolName}` +
        (entry.templateVersion === undefined ? '' : ` templateVersion=${entry.templateVersion}`) +
        (entry.model === undefined ? '' : ` model=${entry.model}`) +
        (entry.reviewSession === undefined ? '' : ` reviewSession=${entry.reviewSession}`) +
        ` outcome=${entry.outcome} latencyMs=${entry.latencyMs}` +
        (entry.fallback === undefined ? '' : ` fallback=${entry.fallback}`);
      ctx.logger.info(detail);
      try {
        reviewLogs?.write({
          plugin: 'approval-reviewer',
          owner: `bot:${entry.botSlug}`,
          kind: entry.fallback === undefined ? entry.outcome : 'fallback',
          detail,
          bot: entry.botSlug,
        });
      } catch {}
    },
  };
  const toolApproval = new ChannelToolApproval(
    core.channels,
    core.ownership,
    core.toolRules,
    (agent, owner) => {
      const cwd = agent.session.header.cwd ?? '';
      if (owner.rootRole === 'assignment') {
        const assignment = core.runtime.getAssignment(owner.botSlug, owner.sessionId);
        const grantId = assignment?.permission?.grantId;
        if (grantId === undefined) return undefined;
        try {
          core.grants.requireActive(owner.botSlug, grantId);
        } catch {
          return undefined;
        }
        return JSON.stringify(['assignment', cwd, grantId]);
      }
      const activeIds = core.grants
        .list(owner.botSlug)
        .filter((grant) => grant.revokedAt === undefined)
        .map((grant) => `${grant.id}:${grant.writeRevision ?? 0}`)
        .sort();
      return JSON.stringify(['orchestrator', cwd, activeIds]);
    },
    {
      changed: (slug, count) => core.states.setApprovalCount(slug, count),
      warn: (message) => ctx.logger.warn(message),
    },
    (sessionId, callId, signal) =>
      core.runtime.beginAssignmentApprovalWait?.(sessionId, callId, signal),
    (query) => core.runtime.toolApprovalOrigin?.(query),
    autoApproval,
    (sessionId) => sessionHasFullAccess(core, sessionId),
    core.team.approvals,
    (query) => core.runtime.hasDirectToolInvocation?.(query) === true,
  );
  publishToolApproval(toolApproval);
  messaging.mountApprovals(ctx, core, toolApproval);
  ctx.effect(
    () => core.companions.attachApprovals(toolApproval),
    'botharness: companion approval observation',
  );
  const userQuestions = new ChannelUserQuestions(
    core.channels,
    core.ownership,
    (agent) => ctx.agents.get(agent.id) === agent,
    (message) => ctx.logger.warn(message),
    (slug, count) => core.states.setQuestionCount(slug, count),
    nativeTimedQuestions(
      ctx,
      core.runtime,
      sessions(),
      questionAnswerReceipts(
        attachOperationalModule(core.operationalDatabase, 'messaging'),
        (sessionId) => core.ownership.resolve(sessionId)?.botSlug,
      ),
    ),
    (sessionId) => core.runtime.askChannel?.(sessionId),
    core.team.approvals,
  );
  publishQuestions(userQuestions);
  ctx.effect(() => () => userQuestions.close(), 'botharness: Channel user questions');
  ctx.inject(['sessionProjections', 'sessionQuery', 'userQuestions'], () => {
    void userQuestions
      .recover(core.humanAttention.openTimedQuestionCards())
      .catch(() => ctx.logger.warn('user-question-recovery-failed'));
  });
  ctx.effect(
    () => core.companions.attachQuestions(userQuestions),
    'botharness: companion question observation',
  );
  registerChannelUserQuestions(ctx, userQuestions);
  ctx.effect(
    () =>
      core.team.approvals.bindStatus((kind, botSlug, channelId, messageId) =>
        kind === 'tool-approval'
          ? toolApproval.status(botSlug, messageId)
          : kind === 'user-question'
            ? userQuestions.status(botSlug, messageId, channelId, false)
            : (privateInputs()?.status(channelId, messageId) ?? 'expired'),
      ),
    'botharness: approval projection status',
  );
  messaging.mountQuestions(ctx, core, userQuestions);
  const approvedCalls = new Map<symbol, (name: string, args: unknown) => boolean>();
  const deviceCallReleases = new Map<symbol, () => void>();
  ctx.effect(() => () => approvedCalls.clear(), 'botharness: one-call approval execution fences');
  ctx.effect(
    () => () => {
      for (const release of deviceCallReleases.values()) release();
      deviceCallReleases.clear();
    },
    'botharness: device approval execution leases',
  );
  ctx.effect(() => () => toolApproval.close(), 'botharness: Channel tool approvals');
  registerChannelToolApproval(ctx, toolApproval);
  ctx.on(
    'tools/pre-execute',
    async (execution, next) => {
      const agent = execution.agent;
      if (agent === undefined || core.ownership.resolve(agent.session.id) === undefined)
        return next();
      if (
        !isDshGovernedTool(execution.name) &&
        !requiresHumanToolApproval(execution.name, execution.arguments, templateInUse) &&
        execution.name !== 'deepseekbot_cli'
      )
        return next();
      const storeDenial = credentialStoreDenial(
        execution.name,
        execution.arguments,
        resolveDshHome(),
        agent.session.header.cwd,
      );
      if (storeDenial !== undefined) return { kind: 'deny', reason: storeDenial };
      if (execution.name === 'secret_cli') {
        const commandDenial = secretCommandDenial(execution.arguments);
        if (commandDenial !== undefined) return { kind: 'deny', reason: commandDenial };
      }
      if (execution.name === 'secret_mcp_connect') {
        const serverDenial = secretMcpDenial(execution.arguments);
        if (serverDenial !== undefined) return { kind: 'deny', reason: serverDenial };
      }

      const computerTools = ctx.get('botharnessComputerTools') as
        | {
            ownsTool?(name: string): boolean;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(): string;
            approvalScope?(sessionId: string): string;
            authorizeCall?(token: symbol, authorized: () => boolean): () => void;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (computerTools?.ownsTool?.(execution.name) === true) {
        const computerAuthorization = deviceToolAuthorization(
          computerTools,
          agent.session.id,
          sessionHasFullAccess(core, agent.session.id),
        );
        if (computerAuthorization === 'authorized') return next();
        if (computerAuthorization === 'changed')
          return {
            kind: 'deny',
            reason: 'Computer Target changed while awaiting Human approval; request a new action.',
          };
        const authorizationScope = computerTools.authorizationScope?.();
        if (!computerTools.approvalScope || !computerTools.authorizeCall)
          return {
            kind: 'deny',
            reason: 'Computer approval Provider is unavailable',
          };
        const computerApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackComputer = toolApproval.track(
          execution,
          'operation',
          false,
          'computer',
          undefined,
          {
            authorizationScope: () => computerTools.approvalScope!(agent.session.id),
          },
        );
        if (computerApproval === undefined || untrackComputer === undefined) {
          return {
            kind: 'deny',
            reason: 'The tool call cannot be presented for Human approval',
          };
        }
        try {
          const outcome = await requestRequiredToolApproval({
            approval: computerApproval,
            channelApproval: toolApproval,
            ownership: core.ownership,
            forceChannel: false,
            request: {
              agent,
              toolName: execution.name,
              callId: execution.callId,
              reason: "This PersonaBot wants to act on the profile's shared Computer.",
              signal: execution.signal,
            },
          });
          if (outcome !== 'allowed-once') {
            const reviewed = toolApproval.takeReviewRejection(agent.session.id, execution.callId);
            return {
              kind: 'deny',
              reason:
                reviewed === undefined
                  ? 'Human approval was ' + outcome
                  : reviewerRejectionText(reviewed),
            };
          }
          if (
            !toolApproval.usesStandingRule(agent, execution.callId) &&
            computerTools.markAuthorized?.(agent.session.id, authorizationScope) === false
          )
            return {
              kind: 'deny',
              reason:
                'Computer Target changed while awaiting Human approval; request a new action.',
            };
          const guard = toolApproval.executionGuard(agent, execution.callId);
          if (!guard || !guard(execution.name, execution.arguments))
            return {
              kind: 'deny',
              reason: 'Approval authority changed before execution',
            };
          if (toolApproval.usesStandingRule(agent, execution.callId))
            deviceCallReleases.set(
              execution.token,
              computerTools.authorizeCall(execution.token, () =>
                guard(execution.name, execution.arguments),
              ),
            );
          approvedCalls.set(execution.token, guard);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackComputer();
        }
      }
      const browserTools = ctx.get('botharnessBrowserTools') as
        | {
            ownsTool?(name: string): boolean;
            executionSignal?(sessionId: string): AbortSignal | undefined;
            needsAuthorization?(sessionId: string): boolean;
            authorizationScope?(sessionId?: string): string;
            approvalScope?(sessionId: string): string;
            authorizeCall?(token: symbol, authorized: () => boolean): () => void;
            markAuthorized?(sessionId: string, scope?: string): boolean | void;
          }
        | undefined;
      if (browserTools?.ownsTool?.(execution.name) === true) {
        const browserSignal = browserTools.executionSignal?.(agent.session.id);
        if (browserTools.executionSignal !== undefined && browserSignal === undefined)
          return {
            kind: 'deny',
            reason: 'Browser Access is off for this PersonaBot',
          };
        const browserAuthorization = deviceToolAuthorization(
          browserTools,
          agent.session.id,
          sessionHasFullAccess(core, agent.session.id),
        );
        if (browserAuthorization === 'authorized') return next();
        if (browserAuthorization === 'changed')
          return {
            kind: 'deny',
            reason:
              'Browser authority changed while awaiting Human approval; request a new action.',
          };
        const browserAuthorizationScope = browserTools.authorizationScope?.(agent.session.id);
        if (!browserTools.approvalScope || !browserTools.authorizeCall)
          return {
            kind: 'deny',
            reason: 'Browser approval Provider is unavailable',
          };
        const browserApproval = ctx.get('approval') as ApprovalService | undefined;
        const untrackBrowser = toolApproval.track(
          execution,
          'operation',
          false,
          'browser',
          undefined,
          {
            authorizationScope: () => browserTools.approvalScope!(agent.session.id),
          },
        );
        if (browserApproval === undefined || untrackBrowser === undefined) {
          return {
            kind: 'deny',
            reason: 'The tool call cannot be presented for Human approval',
          };
        }
        try {
          const outcome = await requestRequiredToolApproval({
            approval: browserApproval,
            channelApproval: toolApproval,
            ownership: core.ownership,
            forceChannel: false,
            request: {
              agent,
              toolName: execution.name,
              callId: execution.callId,
              reason: 'This PersonaBot wants to use the Browser authorized by the Human.',
              signal: AbortSignal.any([execution.signal, browserSignal ?? execution.signal]),
            },
          });
          if (outcome !== 'allowed-once') {
            const reviewed = toolApproval.takeReviewRejection(agent.session.id, execution.callId);
            return {
              kind: 'deny',
              reason:
                reviewed === undefined
                  ? 'Human approval was ' + outcome
                  : reviewerRejectionText(reviewed),
            };
          }
          if (
            !toolApproval.usesStandingRule(agent, execution.callId) &&
            browserTools.markAuthorized?.(agent.session.id, browserAuthorizationScope) === false
          )
            return {
              kind: 'deny',
              reason:
                'Browser authority changed while awaiting Human approval; request a new action.',
            };
          const guard = toolApproval.executionGuard(agent, execution.callId);
          if (!guard || !guard(execution.name, execution.arguments))
            return {
              kind: 'deny',
              reason: 'Approval authority changed before execution',
            };
          if (toolApproval.usesStandingRule(agent, execution.callId))
            deviceCallReleases.set(
              execution.token,
              browserTools.authorizeCall(execution.token, () =>
                guard(execution.name, execution.arguments),
              ),
            );
          approvedCalls.set(execution.token, guard);
          return await next();
        } catch {
          return { kind: 'deny', reason: 'Human approval is unavailable' };
        } finally {
          untrackBrowser();
        }
      }
      const denial = permissionDenial(agent.session);
      if (denial !== undefined) return { kind: 'deny', reason: denial };
      const cliAdmission = tobCliInvocation.delegate(execution);
      if (cliAdmission === 'delegated') return next();
      if (cliAdmission === 'refused')
        return { kind: 'deny', reason: 'The owned CLI invocation authority is unavailable' };
      if (!requiresHumanToolApproval(execution.name, execution.arguments, templateInUse))
        return next();
      const eachUse = execution.name === 'secret_cli' || execution.name === 'secret_mcp_connect';
      const approval = ctx.get('approval') as ApprovalService | undefined;
      const owner = core.ownership.resolve(agent.session.id);
      const untrack = toolApproval.track(
        execution,
        execution.name === 'secret_mcp_connect' ? 'each-use' : 'operation',
        execution.name === 'secret_mcp_connect',
        undefined,
        execution.name === 'bot_create' && owner !== undefined
          ? core.runtime.botCreatePreview?.(owner.botSlug, execution.arguments)
          : undefined,
      );
      if (approval === undefined || untrack === undefined) {
        return {
          kind: 'deny',
          reason: 'The tool call cannot be presented for Human approval',
        };
      }
      try {
        const outcome = await requestRequiredToolApproval({
          approval,
          channelApproval: toolApproval,
          ownership: core.ownership,
          forceChannel:
            eachUse ||
            toolEffects(execution.name, execution.arguments)?.authority === 'management' ||
            core.runtime.hasDirectToolInvocation?.({
              sessionId: agent.session.id,
              callId: execution.callId,
            }) === true,
          request: {
            agent,
            toolName: execution.name,
            callId: execution.callId,
            reason:
              execution.name === 'channel_attachment_open'
                ? 'This PersonaBot wants to edit the selected original attachment. All references to this file will show its current contents.'
                : execution.name === 'bot_create'
                  ? 'This PersonaBot wants to create a new PersonaBot with a new Memory folder. The new Bot gets no grants, accesses or secrets from it.'
                  : publishesBotMemory(JSON.stringify(execution.arguments) ?? '')
                    ? 'This PersonaBot wants to upload a Bot to the Bot Marketplace. Its Memory files become public. Check them for secrets and private details first.'
                    : deletesMarketplaceBot(JSON.stringify(execution.arguments) ?? '')
                      ? 'This PersonaBot wants to delete one of your Uploaded Bots from the Bot Marketplace. Its files and counts are erased and cannot be restored.'
                      : changesApprovalPolicy(
                            JSON.stringify(execution.arguments) ?? '',
                            templateInUse,
                          )
                        ? 'This PersonaBot wants to change persistent permissions or its approval policy. A Human can approve once or save Always allow for this tool in the current scope.'
                        : 'This PersonaBot wants to run a command-line tool with a secret you entered. The program receives the secret and could reveal it. Check the program and every argument.',
            signal: execution.signal,
          },
        });
        if (outcome !== 'allowed-once') {
          const reviewed = toolApproval.takeReviewRejection(agent.session.id, execution.callId);
          return {
            kind: 'deny',
            reason:
              reviewed === undefined
                ? 'Human approval was ' + outcome
                : reviewerRejectionText(reviewed),
          };
        }
        if (!toolApproval.validAfterDecision(agent, execution.callId))
          return { kind: 'deny', reason: 'Approval rule scope changed' };
        if (toolApproval.remembered(agent, execution.callId)) rememberedStarts.add(execution.token);
        const guard = toolApproval.executionGuard(agent, execution.callId);
        if (!guard || !guard(execution.name, execution.arguments))
          return {
            kind: 'deny',
            reason: 'Approval authority changed before execution',
          };
        approvedCalls.set(execution.token, guard);
        return await next();
      } catch {
        return { kind: 'deny', reason: 'Human approval is unavailable' };
      } finally {
        untrack();
      }
    },
    { global: true },
  );

  ctx.on(
    'tools/post-execute',
    async (execution, result, next) => {
      const reason =
        execution.agent === undefined
          ? undefined
          : toolApproval.takeReviewRejection(execution.agent.session.id, execution.callId);
      const decision = await next();
      if (reason === undefined || decision.kind !== 'accept' || decision.value !== undefined)
        return decision;
      const note = {
        type: 'text' as const,
        text: reviewerRejectionText(reason),
      };
      return {
        ...decision,
        content: result.isError ? [note] : [...(decision.content ?? result.content), note],
      };
    },
    { global: true },
  );

  installNativeSearchResultGuard(ctx, core, (session) => sessionHasFullAccess(core, session.id));
  ctx.tools.guard((execution) => {
    const invocationDenial = tobCliInvocation.guard(execution);
    if (invocationDenial) return invocationDenial;
    const { agent, name, arguments: args, token } = execution;
    const approvalGuard = approvedCalls.get(token);
    if (approvalGuard && !approvalGuard(name, args))
      return 'Approval authority or operation changed before execution';
    const allowedOnce = approvalGuard !== undefined;
    return agent === undefined
      ? undefined
      : grantToolExecutionDenial(
          core,
          agent.session,
          ctx.get('sandboxPolicy'),
          ctx.get('approval'),
          name,
          args,
          allowedOnce,
          templateInUse,
        );
  });
  ctx.on(
    'tools/execute',
    async (execution, next) => {
      const owner =
        execution.agent === undefined
          ? undefined
          : core.ownership.resolve(execution.agent.session.id);
      if (owner === undefined) return next();
      const untrack =
        isDshGovernedTool(execution.name) &&
        !requiresHumanToolApproval(execution.name, execution.arguments, templateInUse)
          ? toolApproval.track(execution)
          : undefined;
      try {
        if (owner.rootRole !== 'assignment' || core.runtime.runAssignmentTool === undefined)
          return await next();
        return await core.runtime.runAssignmentTool(
          execution.agent!.session.id,
          execution.callId,
          execution.token,
          execution.signal,
          () => {
            const approvalGuard = approvedCalls.get(execution.token);
            if (approvalGuard && !approvalGuard(execution.name, execution.arguments))
              throw new Error('Approval authority or operation changed before execution');
            const denial = grantToolExecutionDenial(
              core,
              execution.agent!.session,
              ctx.get('sandboxPolicy'),
              ctx.get('approval'),
              execution.name,
              execution.arguments,
              approvalGuard !== undefined,
              templateInUse,
            );
            if (denial !== undefined) throw new Error(denial);
            return next();
          },
        );
      } finally {
        untrack?.();
      }
    },
    { global: true },
  );
  ctx.on(
    'tools/result',
    (execution) => {
      deviceCallReleases.get(execution.token)?.();
      deviceCallReleases.delete(execution.token);
      approvedCalls.delete(execution.token);
      if (execution.agent !== undefined)
        core.runtime.settleAssignmentTool?.(execution.agent.session.id, execution.callId);
    },
    { global: true },
  );
  return { toolApproval, userQuestions, templateInUse };
}
