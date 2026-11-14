import type { HumanContext } from '../humans/context.js';
import { z } from 'zod';
import type { ChannelMessage } from '../channels/channel.js';
import type { ToolApprovalRequestCard } from '../workspaces/tool-approval.js';
import type { ChannelQuestionRequest } from '../channels/user-questions.js';
import type { PrivateInputCard } from '../credentials/contracts.js';

export type ApprovalKind = 'tool-approval' | 'user-question' | 'private-input';
export interface ApprovalDecider {
  humanId: string;
  displayName?: string | undefined;
}
export interface ApprovalAuthority {
  requireRequest(human: HumanContext, channelId: string, messageId: string): void;
  decider(human: HumanContext): ApprovalDecider;
}
export const maskedApprovalCardSchema = z.strictObject({
  masked: z.literal(true),
  kind: z.enum(['tool-approval', 'user-question', 'private-input']),
  botSlug: z.string(),
  state: z.string(),
  requestedAt: z.string(),
  decidedAt: z.string().optional(),
});
export type MaskedApprovalCard = z.infer<typeof maskedApprovalCardSchema>;
export const isMaskedApprovalCard = (value: unknown): value is MaskedApprovalCard =>
  maskedApprovalCardSchema.safeParse(value).success;
export type ApprovalCard =
  | MaskedApprovalCard
  | (Omit<MaskedApprovalCard, 'masked'> & {
      masked: false;
      opaque: boolean;
      decidedBy?: ApprovalDecider;
    });
export type ProjectedApprovalMessage = Omit<
  ChannelMessage,
  'toolApprovalRequest' | 'userQuestionRequest' | 'privateInputRequest'
> & {
  toolApprovalRequest?: ToolApprovalRequestCard | MaskedApprovalCard;
  userQuestionRequest?: ChannelQuestionRequest | MaskedApprovalCard;
  privateInputRequest?: PrivateInputCard | MaskedApprovalCard;
};
