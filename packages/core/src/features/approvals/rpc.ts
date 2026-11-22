import { toRemoteError } from '../../bridge/rpc-result.js';
import { TeamError } from '../../team/service.js';
import { type HumanContext } from '../../humans/context.js';
import { RemoteError } from '@deepseek-ai/dsh-typert-protocol';
import type { PrivateInputs } from '../../credentials/private-inputs.js';
import type { PrivateAccountSummary, PrivateInputStatus } from '../../credentials/contracts.js';
import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { resolveInvocationHuman } from '../../bridge/invocation-human.js';
import { unwrap, unwrapAsync } from '../../bridge/rpc-result.js';
import type { ApprovalTemplateDeletionPreview } from '../../workspaces/approval-template-deletion-contract.js';
import type { ApprovalCard } from '../../team/approval-contract.js';
import type { ApprovalReviewerModelView } from '../../bridge/methods.js';
import type { ModelRoute } from '../../models/presets.js';
import type { PersonaBotDetail, ApprovalTemplateEntry } from '../../bridge/methods.js';
import type { ToolApprovalRule } from '../../workspaces/tool-approval-rules.js';
import type { ToolApprovalHistoryEntry } from '../../channels/approval-history.js';
import type { ApprovalsBridgeMethods } from './methods.js';

export function approvalRoute(
  methods: ApprovalsBridgeMethods,
  slug: string,
  pairingId: string | null,
  expectedRevision: number,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.approvalRoute({ slug, pairingId, expectedRevision }));
}

export function approvalTest(
  methods: ApprovalsBridgeMethods,
  slug: string,
): Promise<{
  delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
}> {
  return unwrapAsync(methods.approvalTest({ slug }));
}

export function questionRetry(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): Promise<{ updated: true }> {
  return unwrapAsync(methods.questionRetry({ slug, id }));
}

export function approvalRetry(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): Promise<{
  delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
}> {
  return unwrapAsync(methods.approvalRetry({ slug, id }));
}

export function approvalTemplates(
  methods: ApprovalsBridgeMethods,
  slug?: string,
): {
  templates: ApprovalTemplateEntry[];
  selected?: string | null;
  globalDefault?: string | null;
  effective?: string | null;
  source?: 'global' | 'specific' | 'off';
} {
  return unwrap(methods.approvalTemplates(slug === undefined ? {} : { slug }));
}

export function approvalTemplateCreate(
  methods: ApprovalsBridgeMethods,
  name: string,
  text?: string,
  from?: string,
): { template: ApprovalTemplateEntry } {
  return unwrap(
    methods.approvalTemplateCreate({
      name,
      ...(text === undefined ? {} : { text }),
      ...(from === undefined ? {} : { from }),
    }),
  );
}

export function approvalTemplateUpdate(
  methods: ApprovalsBridgeMethods,
  name: string,
  text: string,
): { template: ApprovalTemplateEntry } {
  return unwrap(methods.approvalTemplateUpdate({ name, text }));
}

export function approvalTemplateDeletePreview(
  methods: ApprovalsBridgeMethods,
  name: string,
): { preview: ApprovalTemplateDeletionPreview } {
  return unwrap(methods.approvalTemplateDeletePreview({ name }));
}

export function approvalTemplateDelete(
  methods: ApprovalsBridgeMethods,
  name: string,
  confirmed: boolean,
  revision: string,
): {
  template: { name: string };
  clearedBots: string[];
  inheritedBots: string[];
  globalDefault: string | null;
} {
  return unwrap(methods.approvalTemplateDelete({ name, confirmed, revision }));
}

export function approvalTemplateGlobalSet(
  methods: ApprovalsBridgeMethods,
  template: string | null,
): { template: string | null } {
  return unwrap(methods.approvalTemplateGlobalSet({ template }));
}

export function botApprovalTemplateSet(
  methods: ApprovalsBridgeMethods,
  slug: string,
  template: string | null,
): { bot: PersonaBotDetail } {
  return unwrap(methods.botApprovalTemplateSet({ slug, template }));
}

export function approvalReviewerModel(
  methods: ApprovalsBridgeMethods,
): Promise<ApprovalReviewerModelView> {
  return unwrapAsync(methods.approvalReviewerModel({}));
}

export function approvalReviewerModelSet(
  methods: ApprovalsBridgeMethods,
  model: ModelRoute | null,
): Promise<ApprovalReviewerModelView> {
  return unwrapAsync(methods.approvalReviewerModelSet({ model }));
}

export function toolApprovalRules(
  methods: ApprovalsBridgeMethods,
  slug: string,
): { rules: ToolApprovalRule[] } {
  return unwrap(methods.toolApprovalRules({ slug }));
}

export function toolApprovalRuleRevoke(
  methods: ApprovalsBridgeMethods,
  slug: string,
  id: string,
): { rule: ToolApprovalRule } {
  return unwrap(methods.toolApprovalRuleRevoke({ slug, id }));
}

export function toolApprovalHistory(
  methods: ApprovalsBridgeMethods,
  slug: string,
  page?: { cursor?: string; limit?: number },
): { entries: ToolApprovalHistoryEntry[]; nextCursor?: string } {
  return unwrap(methods.toolApprovalHistory({ slug, ...page }));
}

export function toolApprovalStatus(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
): {
  approval?: ApprovalCard;
  status: 'pending' | 'expired' | 'stopped';
  execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
} {
  return unwrap(methods.toolApprovalStatus({ channelId, messageId }));
}

export function toolApprovalDecide(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
  outcome:
    | 'allowed-once'
    | 'allowed-always-tool'
    | 'allowed-always-exact'
    | 'allowed-always-all'
    | 'rejected',
): Promise<{ accepted: boolean }> {
  return unwrapAsync(methods.toolApprovalDecide({ channelId, messageId, outcome }));
}

export function toolAutoRejectionOverride(
  methods: ApprovalsBridgeMethods,
  itemId: string,
): Promise<{ accepted: true; channelId: string; messageId: string }> {
  return unwrapAsync(methods.toolAutoRejectionOverride({ itemId }));
}

export function userQuestionStatus(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
): { status: 'pending' | 'submitted' | 'answered' | 'expired'; approval?: ApprovalCard } {
  return unwrap(methods.userQuestionStatus({ channelId, messageId }));
}

export function userQuestionAnswer(
  methods: ApprovalsBridgeMethods,
  channelId: string,
  messageId: string,
  answer: { answers: { id: string; selected: string[]; custom?: string }[] },
): Promise<{ accepted: boolean }> {
  return unwrapAsync(methods.userQuestionAnswer({ channelId, messageId, answer }));
}

export const privateInputRpc = {
  requireApproval(channelId: string, messageId: string): HumanContext {
    if (!this.team) this.requirePrivateOwner();
    const human = this.invocationHuman();
    try {
      this.team?.approvals.requireRequest(human, channelId, messageId);
    } catch (error) {
      if (error instanceof TeamError)
        throw toRemoteError({
          code: error.code,
          message: error.code,
          ...(error.details ? { details: error.details } : {}),
        });
      throw error;
    }
    return human;
  },

  privateInputStatus(
    channelId: string,
    messageId: string,
  ): { status: PrivateInputStatus; approval?: ApprovalCard } {
    if (!this.team) this.requirePrivateOwner();
    const human = this.invocationHuman();
    if (
      this.team &&
      !this.team.belongs(human, channelId) &&
      !this.team.approvals.ownsRequest(human, channelId, messageId)
    )
      throw toRemoteError({ code: 'channel-not-found', message: 'channel-not-found' });
    const message = this.team?.approvals.request(channelId, messageId);
    const approval = message && this.team?.approvals.card(human, channelId, message);
    return {
      status: this.privateInputs?.status(channelId, messageId) ?? 'expired',
      ...(approval ? { approval } : {}),
    };
  },

  async privateInputSubmit(
    channelId: string,
    messageId: string,
    values: Record<string, string>,
  ): Promise<{ accepted: boolean; reason?: string }> {
    const human = this.requireApproval(channelId, messageId);
    if (this.privateInputs === undefined) return { accepted: false, reason: 'store-unavailable' };
    return await this.privateInputs.submission(true, { channelId, messageId, values }, human);
  },

  async privateInputCancel(channelId: string, messageId: string): Promise<{ accepted: boolean }> {
    const human = this.requireApproval(channelId, messageId);
    return {
      accepted: (await this.privateInputs?.cancel(true, channelId, messageId, human)) ?? false,
    };
  },

  async privateAccountStatus(channelId: string, messageId: string) {
    this.requirePrivateOwner();
    return (
      this.privateInputs?.accountStatus(true, channelId, messageId) ?? {
        status: 'unavailable',
        references: {},
      }
    );
  },

  async privateInputReplace(channelId: string, messageId: string): Promise<{ messageId?: string }> {
    this.requirePrivateOwner();
    const replacement = await this.privateInputs?.replace(true, channelId, messageId);
    return replacement === undefined ? {} : { messageId: replacement };
  },

  async privateAccounts(slug: string): Promise<{
    status: 'ready' | 'unavailable';
    accounts: PrivateAccountSummary[];
    replaceable: boolean;
    mcpServers: ReturnType<NonNullable<PrivateInputs['mcpServers']>['list']>;
  }> {
    this.requirePrivateOwner();
    const accounts =
      typeof slug === 'string' ? await this.privateInputs?.accounts(true, slug) : undefined;
    const replaceable = (await this.privateInputs?.replaceable().catch(() => false)) ?? false;
    const mcpServers =
      typeof slug === 'string' ? (this.privateInputs?.mcpServers?.list(slug) ?? []) : [];
    return accounts === undefined
      ? { status: 'unavailable', accounts: [], replaceable: false, mcpServers }
      : { status: 'ready', accounts, replaceable, mcpServers };
  },

  async privateMcpServerEnable(
    slug: string,
    serverName: string,
    enabled: boolean,
  ): Promise<{ accepted: boolean }> {
    this.requirePrivateOwner();
    return {
      accepted:
        typeof slug === 'string' && typeof serverName === 'string' && typeof enabled === 'boolean'
          ? ((await this.privateInputs?.mcpServers?.setEnabled(slug, serverName, enabled)) ?? false)
          : false,
    };
  },

  async privateMcpServerRemove(slug: string, serverName: string): Promise<{ removed: boolean }> {
    this.requirePrivateOwner();
    return {
      removed:
        typeof slug === 'string' && typeof serverName === 'string'
          ? ((await this.privateInputs?.mcpServers?.remove(slug, serverName)) ?? false)
          : false,
    };
  },

  async privateAccountRevoke(channelId: string, messageId: string) {
    this.requirePrivateOwner();
    return (
      this.privateInputs?.revoke(true, channelId, messageId, this.invocationHuman()) ?? {
        accepted: false,
        stopped: 0,
        completed: 0,
        uncertain: 0,
      }
    );
  },

  requirePrivateOwner(message = 'Private input requires the authenticated Owner'): void {
    if (resolveInvocationHuman(this.ctx.invocation?.peer, this.ctx.get('connection')) === undefined)
      throw new RemoteError('forbidden' as RemoteError['code'], message, {});
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const externalApprovalRpc = {
  approvalRoute(
    slug: string,
    pairingId: string | null,
    expectedRevision: number,
  ): Promise<{ updated: true }> {
    return approvalRoute(this.methods, slug, pairingId, expectedRevision);
  },

  approvalTest(slug: string): Promise<{
    delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
  }> {
    return approvalTest(this.methods, slug);
  },

  questionRetry(slug: string, id: string): Promise<{ updated: true }> {
    return questionRetry(this.methods, slug, id);
  },

  approvalRetry(
    slug: string,
    id: string,
  ): Promise<{
    delivery: import('../../messaging/approval-messaging.js').ApprovalDelivery;
  }> {
    return approvalRetry(this.methods, slug, id);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const approvalTemplateReadRpc = {
  approvalTemplates(slug?: string): {
    templates: ApprovalTemplateEntry[];
    selected?: string | null;
    globalDefault?: string | null;
    effective?: string | null;
    source?: 'global' | 'specific' | 'off';
  } {
    return approvalTemplates(this.methods, slug);
  },

  approvalTemplateCreate(
    name: string,
    text?: string,
    from?: string,
  ): { template: ApprovalTemplateEntry } {
    return approvalTemplateCreate(this.methods, name, text, from);
  },

  approvalTemplateUpdate(name: string, text: string): { template: ApprovalTemplateEntry } {
    return approvalTemplateUpdate(this.methods, name, text);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const approvalTemplateWriteRpc = {
  approvalTemplateDeletePreview(name: string): { preview: ApprovalTemplateDeletionPreview } {
    return approvalTemplateDeletePreview(this.methods, name);
  },

  approvalTemplateDelete(
    name: string,
    confirmed: boolean,
    revision: string,
  ): {
    template: { name: string };
    clearedBots: string[];
    inheritedBots: string[];
    globalDefault: string | null;
  } {
    return approvalTemplateDelete(this.methods, name, confirmed, revision);
  },

  approvalTemplateGlobalSet(template: string | null): { template: string | null } {
    return approvalTemplateGlobalSet(this.methods, template);
  },

  botApprovalTemplateSet(slug: string, template: string | null): { bot: PersonaBotDetail } {
    return botApprovalTemplateSet(this.methods, slug, template);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const approvalReviewerRpc = {
  approvalReviewerModel(): Promise<ApprovalReviewerModelView> {
    return approvalReviewerModel(this.methods);
  },

  approvalReviewerModelSet(model: ModelRoute | null): Promise<ApprovalReviewerModelView> {
    return approvalReviewerModelSet(this.methods, model);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const toolApprovalRpc = {
  toolApprovalRules(slug: string): { rules: ToolApprovalRule[] } {
    return toolApprovalRules(this.methods, slug);
  },

  toolApprovalRuleRevoke(slug: string, id: string): { rule: ToolApprovalRule } {
    return toolApprovalRuleRevoke(this.methods, slug, id);
  },

  toolApprovalHistory(
    slug: string,
    page?: { cursor?: string; limit?: number },
  ): { entries: ToolApprovalHistoryEntry[]; nextCursor?: string } {
    return toolApprovalHistory(this.methods, slug, page);
  },

  toolApprovalStatus(
    channelId: string,
    messageId: string,
  ): {
    approval?: ApprovalCard;
    status: 'pending' | 'expired' | 'stopped';
    execution?: 'waiting-human' | 'waiting-capacity' | 'running' | 'settled' | 'needs-repair';
  } {
    return toolApprovalStatus(this.methods, channelId, messageId);
  },

  toolApprovalDecide(
    channelId: string,
    messageId: string,
    outcome:
      | 'allowed-once'
      | 'allowed-always-tool'
      | 'allowed-always-exact'
      | 'allowed-always-all'
      | 'rejected',
  ): Promise<{ accepted: boolean }> {
    return toolApprovalDecide(this.methods, channelId, messageId, outcome);
  },

  toolAutoRejectionOverride(
    itemId: string,
  ): Promise<{ accepted: true; channelId: string; messageId: string }> {
    return toolAutoRejectionOverride(this.methods, itemId);
  },

  userQuestionStatus(
    channelId: string,
    messageId: string,
  ): { status: 'pending' | 'submitted' | 'answered' | 'expired'; approval?: ApprovalCard } {
    return userQuestionStatus(this.methods, channelId, messageId);
  },

  userQuestionAnswer(
    channelId: string,
    messageId: string,
    answer: { answers: { id: string; selected: string[]; custom?: string }[] },
  ): Promise<{ accepted: boolean }> {
    return userQuestionAnswer(this.methods, channelId, messageId, answer);
  },
} satisfies ThisType<BridgeRpcReceiver>;
