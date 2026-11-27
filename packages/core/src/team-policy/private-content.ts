import { z } from 'zod';

export const privateKindSchema = z.enum(['bot', 'channel', 'dm', 'bot-dm']);
export type PrivateKind = z.infer<typeof privateKindSchema>;
