import { z } from 'zod';

export const privateRequestSchema = z
  .strictObject({
    account: z.string().min(1).max(120),
    purpose: z.string().min(1).max(1000),
    fields: z
      .array(
        z.strictObject({
          id: z.string().regex(/^[a-z][a-z0-9_]{0,47}$/),
          label: z.string().min(1).max(120),
          required: z.boolean(),
        }),
      )
      .min(1)
      .max(8),
  })
  .refine(
    (request) => new Set(request.fields.map((field) => field.id)).size === request.fields.length,
  );

export type PrivateInputDeclaration = z.infer<typeof privateRequestSchema>;
export type PrivateInputStatus = 'pending' | 'configured' | 'cancelled' | 'expired';
export interface PrivateInputCard extends PrivateInputDeclaration {
  sessionId?: string;
  expiresAt?: string;
  replacesMessageId?: string;
}
export interface PrivateAccountStatus {
  status: 'configured' | 'revoked' | 'superseded' | 'unavailable';
  references: Record<string, string>;
}
export interface PrivateAccountSummary {
  account: string;
  purpose?: string;
  fields: { id: string; label: string; required: boolean }[];
  status: 'configured' | 'replacing' | 'unavailable';
  configuredAt?: string;
  channelId?: string;
  messageId?: string;
  replacementMessageId?: string;
}
export interface PrivateRevocationResult {
  accepted: boolean;
  stopped: number;
  completed: number;
  uncertain: number;
}
export interface PrivateInputResult {
  status: 'configured' | 'cancelled' | 'expired';
  account: string;
  references: Record<string, string>;
}
export interface PrivateInputResolution {
  requestMessageId: string;
  state: 'configured' | 'cancelled' | 'expired';
  references: Record<string, string>;
}

export const privateSubmissionSchema = z.strictObject({
  channelId: z.string().min(1).max(160),
  messageId: z.string().uuid(),
  values: z
    .record(z.string(), z.string().max(16_384))
    .refine((values) => Object.keys(values).length <= 8),
});
