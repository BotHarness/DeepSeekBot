import { randomUUID } from 'node:crypto';
import type { ShellPrefixApproval } from '@botharness/host-protocol/wire';
import type { ChannelStore } from '../../channels/store.js';
import type { HumanContext } from '../../humans/context.js';
import type { ApprovalAuthority } from '../../team/approval-contract.js';
import { requiresHumanDecision } from '../../workspaces/approval-templates.js';
import { decideToolApproval } from '../../workspaces/tool-effects.js';
import {
  checkShellPrefixPatterns,
  MAX_SHELL_PREFIX_PATTERNS,
  shellApprovalInput,
  shellPrefixScope,
} from '../../workspaces/shell-approval-prefix.js';
import type { ToolApprovalRuleStore } from '../../workspaces/tool-approval-rules.js';
import type { Pending, TrackedCall } from './tool-approval-types.js';

export type ToolApprovalPolicyOptions = {
  fullAccess?: boolean;
  standingRule?: 'none' | 'ordinary' | 'explicit';
  reviewer?: boolean;
};

export function toolApprovalPolicy(
  tracked: TrackedCall,
  options: ToolApprovalPolicyOptions,
  templateInUse?: (name: string) => boolean,
) {
  return decideToolApproval(tracked.effects, {
    stage: 'request',
    legacyProtected: requiresHumanDecision(tracked.toolName + ' ' + tracked.input, templateInUse),
    explicitApproval: tracked.requireExplicitApproval === true,
    eachUse: tracked.externalDecision === 'each-use',
    device: tracked.device !== undefined,
    fullAccess: options.fullAccess === true,
    standingRule: options.standingRule ?? 'none',
    reviewer: options.reviewer === true,
    rememberable: tracked.rememberable === true,
  });
}

export async function commitShellPrefixDecision({
  human,
  pending,
  tracked,
  action,
  rules,
  channels,
  approvals,
  stillPending,
}: {
  human: HumanContext;
  pending: Pending;
  tracked: TrackedCall;
  action: ShellPrefixApproval;
  rules: Pick<ToolApprovalRuleStore, 'preparePrefixes'>;
  channels: Pick<ChannelStore, 'appendMessageOnce'>;
  approvals: ApprovalAuthority | undefined;
  stillPending(): boolean;
}): Promise<boolean> {
  const { botSlug, channelId } = pending;
  const { messageId } = pending.notice;
  const args = shellApprovalInput(tracked.toolName, tracked.input);
  const scopeKey = shellPrefixScope(tracked.scopeKey, tracked.cwd, args);
  if (
    !args ||
    !scopeKey ||
    action.patterns.length < 1 ||
    action.patterns.length > MAX_SHELL_PREFIX_PATTERNS ||
    checkShellPrefixPatterns(args.command, action.patterns)
  )
    return false;
  const prepared = rules.preparePrefixes({
    botSlug,
    role: tracked.role,
    scopeKey,
    toolName: tracked.toolName,
    patterns: action.patterns,
  });
  const authorized = () => {
    try {
      approvals?.requireRequest(human, channelId, messageId);
      return true;
    } catch {
      return false;
    }
  };
  const result = await channels.appendMessageOnce(
    human,
    channelId,
    {
      id: randomUUID(),
      at: new Date().toISOString(),
      author: { kind: 'human' },
      body: '已保存 Shell 命令前缀规则并批准这一次调用',
      replyTo: messageId,
      toolApprovalDecision: {
        requestMessageId: messageId,
        decidedBy: approvals?.decider(human) ?? { humanId: human.humanId },
        outcome: 'allowed-always-prefix',
      },
    },
    undefined,
    undefined,
    (connection) => {
      if (
        !connection ||
        pending.signal?.aborted ||
        Date.parse(pending.notice.expiresAt) <= Date.now() ||
        !authorized() ||
        !stillPending()
      )
        return false;
      prepared.commit(connection);
      return true;
    },
  );
  if (result.status !== 'appended') return false;
  tracked.authorized = authorized;
  tracked.humanReviewed = true;
  pending.notice.savedPrefixRuleIds = prepared.rules.map((rule) => rule.id);
  return true;
}
