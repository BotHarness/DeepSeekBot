import { z } from 'zod';
import type { DatabaseSync } from 'node:sqlite';
import type { BotSourcePolicyEditor } from '../../runtime/source-policy.js';
import { groupReceptionInput, type GroupReceptionInput } from './group-reception.js';
import { MessagingError } from '../provider.js';

export const threadReceptionInput = z
  .object({
    mode: z.enum(['follow', 'inherit', 'exclude']),
    expectedRevision: z.number().int().min(0),
    wake: groupReceptionInput
      .omit({
        collection: true,
        inheritance: true,
        expectedRevision: true,
        expectedDefaultRevision: true,
      })
      .nullable(),
  })
  .strict();
export type ThreadReceptionInput = z.infer<typeof threadReceptionInput>;
export interface ThreadReceptionPolicy {
  threadId: string;
  conversationId: string;
  rootId: string;
  anchorSourceEventId: string;
  fingerprint: string;
  mode: ThreadReceptionInput['mode'];
  wake: Omit<GroupReceptionInput, 'collection'> | null;
  revision: number;
  changedAt: string;
  editor: BotSourcePolicyEditor | { kind: 'built-in' };
}
export interface ThreadReceptionView extends ThreadReceptionPolicy {
  ordinaryDelivery: 'verified' | 'unverified';
  preview?: string;
}
export function threadReceptionPolicy(
  db: DatabaseSync,
  grantId: string,
  threadId: string,
): ThreadReceptionPolicy | undefined {
  const row = db
    .prepare(
      'SELECT body FROM messaging_thread_policy_revisions WHERE grant_id = ? AND thread_id = ? ORDER BY revision DESC LIMIT 1',
    )
    .get(grantId, threadId) as { body: string } | undefined;
  return row ? (JSON.parse(row.body) as ThreadReceptionPolicy) : undefined;
}
export function commitThreadReceptionPolicy(
  db: DatabaseSync,
  grantId: string,
  anchor: Pick<
    ThreadReceptionPolicy,
    'threadId' | 'conversationId' | 'rootId' | 'anchorSourceEventId' | 'fingerprint'
  >,
  input: ThreadReceptionInput,
  editor: BotSourcePolicyEditor,
): ThreadReceptionPolicy {
  const parsed = threadReceptionInput.parse(input);
  const previous = threadReceptionPolicy(db, grantId, anchor.threadId);
  if (
    previous &&
    (previous.rootId !== anchor.rootId ||
      previous.conversationId !== anchor.conversationId ||
      previous.fingerprint !== anchor.fingerprint)
  )
    throw new MessagingError('thread-route-mismatch');
  if ((previous?.revision ?? 0) !== parsed.expectedRevision)
    throw new MessagingError('thread-policy-conflict');
  if (
    editor.kind === 'bot' &&
    (parsed.mode === 'exclude' ||
      (previous?.editor.kind === 'human' && previous.mode !== 'inherit'))
  )
    throw new MessagingError('human-thread-override');
  const policy: ThreadReceptionPolicy = {
    ...anchor,
    mode: parsed.mode,
    wake: parsed.mode === 'follow' ? parsed.wake : null,
    revision: (previous?.revision ?? 0) + 1,
    changedAt: new Date().toISOString(),
    editor,
  };
  db.prepare(
    'INSERT INTO messaging_thread_policy_revisions (grant_id, thread_id, revision, body) VALUES (?, ?, ?, ?)',
  ).run(grantId, anchor.threadId, policy.revision, JSON.stringify(policy));
  return policy;
}
