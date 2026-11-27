import { z } from 'zod';

export const tobCliCommandSchema = z
  .object({
    argv: z.array(z.string()).min(1).max(256),
    stdin: z.string().default(''),
  })
  .strict()
  .superRefine((command, context) => {
    if (
      Buffer.byteLength(command.argv.join('\0')) > 64 * 1024 ||
      Buffer.byteLength(command.stdin) > 1024 * 1024
    )
      context.addIssue({ code: 'custom', message: 'CLI input exceeds its bound' });
  });
export type TobCliCommand = z.infer<typeof tobCliCommandSchema>;
export const tobCliRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('start'), command: tobCliCommandSchema }).strict(),
  z.object({ action: z.literal('status'), id: z.string().uuid() }).strict(),
  z.object({ action: z.literal('cancel'), id: z.string().uuid() }).strict(),
]);
export type TobCliRequest = z.infer<typeof tobCliRequestSchema>;
export interface TobCliOutput {
  exitCode: number;
  stdout: string;
  stderr: string;
}
export type TobCliStatus = {
  id: string;
  channelId: string;
  messageId: string;
  cancelRequested: boolean;
} & (
  | { state: 'running' }
  | { state: 'completed'; result: TobCliOutput }
  | { state: 'failed' | 'cancelled'; code: string }
);
export interface TobCliTurn {
  command: TobCliCommand;
  signal: AbortSignal;
  complete(result: TobCliOutput): void;
}
