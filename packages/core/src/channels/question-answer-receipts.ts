import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { AskUserQuestionAnswer } from '@deepseek-ai/dsh-user-questions/types';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import type { HumanContext } from '../humans/context.js';

export const questionAnswerReceiptSchema = z.object({
  sessionId: z.string(),
  callId: z.string(),
  humanId: z.string().nullable(),
  answerHash: z.string(),
});
export type QuestionAnswerReceipt = z.infer<typeof questionAnswerReceiptSchema>;
export const questionAnswerHash = (answer: AskUserQuestionAnswer): string =>
  createHash('sha256').update(JSON.stringify(answer.answers)).digest('hex');

export interface QuestionAnswerReceipts {
  save(sessionId: string, callId: string, answer: AskUserQuestionAnswer, human: HumanContext): void;
  discard(sessionId: string, callId: string): void;
  read(sessionId: string, callId: string): QuestionAnswerReceipt | undefined;
}

export function questionAnswerReceipts(
  database: OperationalDatabaseModulePort,
  botOf: (sessionId: string) => string | undefined,
): QuestionAnswerReceipts {
  const prefix = (sessionId: string, callId: string) =>
    'question-answer:' +
    createHash('sha256')
      .update(JSON.stringify([sessionId, callId]))
      .digest('hex') +
    ':';
  const append = (receipt: QuestionAnswerReceipt) => {
    const bot = botOf(receipt.sessionId);
    if (!bot) throw new Error('question-answer-owner-unavailable');
    const at = new Date().toISOString();
    database.transaction((db) =>
      db
        .prepare(`INSERT INTO source_events
      (source_event_id, source_kind, bot_slug, body, created_at, handled_at, observed_at, payload_json, human_id)
      VALUES (?, 'system-message', ?, '', ?, ?, ?, ?, ?)`)
        .run(
          prefix(receipt.sessionId, receipt.callId) + randomUUID(),
          bot,
          at,
          at,
          at,
          JSON.stringify({ questionAnswerSubmission: receipt }),
          receipt.humanId,
        ),
    );
  };
  return {
    save(sessionId, callId, answer, human) {
      append({ sessionId, callId, humanId: human.humanId, answerHash: questionAnswerHash(answer) });
    },
    discard(sessionId, callId) {
      append({ sessionId, callId, humanId: null, answerHash: '' });
    },
    read(sessionId, callId) {
      const start = prefix(sessionId, callId);
      const row = database.read((db) =>
        db
          .prepare(`SELECT payload_json FROM source_events
        WHERE source_event_id >= ? AND source_event_id < ? ORDER BY rowid DESC LIMIT 1`)
          .get(start, start + '\uffff'),
      );
      if (!row) return undefined;
      const data = z.object({ payload_json: z.string() }).parse(row);
      return z
        .object({ questionAnswerSubmission: questionAnswerReceiptSchema })
        .parse(JSON.parse(data.payload_json)).questionAnswerSubmission;
    },
  };
}
