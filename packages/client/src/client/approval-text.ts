import { botCreateArgs } from './bot-create-approval.js';
import type { BotHarnessTranslate } from './locale.js';
import type { ChannelMessage } from './store.js';

export function toolApprovalText(
  message: Pick<ChannelMessage, 'toolApprovalRequest' | 'toolApprovalDecision'>,
  t: BotHarnessTranslate,
): string | undefined {
  const request = message.toolApprovalRequest;
  if (request !== undefined) {
    const created =
      request.toolName === 'bot_create' || request.toolName === 'deepseekbot create'
        ? botCreateArgs(request.input)
        : undefined;
    return created === undefined
      ? t('approval.requestPreview', { tool: request.toolName })
      : t('approval.botCreate.summary', { name: created.displayName });
  }
  const outcome = message.toolApprovalDecision?.outcome;
  if (outcome === undefined) return undefined;
  return t(
    outcome === 'rejected'
      ? 'approval.rejected'
      : outcome === 'allowed-once'
        ? 'approval.approved'
        : 'approval.ruleSaved',
  );
}

export function toolApprovalReplyPreview(
  message: Pick<ChannelMessage, 'toolApprovalDecision'>,
  body: string,
  t: BotHarnessTranslate,
): string {
  return message.toolApprovalDecision === undefined ? body : t('approval.requestTitle');
}
