import { z } from 'zod';

export const feedbackTags = {
  good: ['accurate', 'completed', 'understood', 'fast'],
  bad: [
    'incorrect',
    'instructions',
    'incomplete',
    'no-response',
    'delivery',
    'slow',
    'interface',
    'other',
  ],
} as const;

export const feedbackSelectionSchema = z
  .object({
    channelId: z.string().min(1).max(200),
    messageId: z.string().min(1).max(200),
    before: z.number().int().min(0).max(100).default(20),
    after: z.number().int().min(0).max(100).default(20),
    conversation: z.boolean().default(true),
    sessions: z.boolean().default(true),
    inbox: z.boolean().default(true),
    deliveries: z.boolean().default(true),
    relatedChats: z.boolean().default(true),
    wholeSessions: z.boolean().default(false),
  })
  .strict();

export const feedbackRatingSchema = z
  .object({
    rating: z.enum(['good', 'bad']),
    tags: z.array(z.string()).max(8).default([]),
    comment: z
      .string()
      .refine((value) => Array.from(value).length <= 500)
      .default(''),
  })
  .strict()
  .refine(
    (value) =>
      value.tags.every((tag) => feedbackTags[value.rating].some((candidate) => candidate === tag)),
    'invalid-tags',
  );

export type FeedbackSelection = z.infer<typeof feedbackSelectionSchema>;
export type FeedbackRating = z.infer<typeof feedbackRatingSchema>;
export interface FeedbackReceipt {
  reportId: string;
  expiresAt: string;
}
