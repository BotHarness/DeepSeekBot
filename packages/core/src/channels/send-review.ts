import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { requireSourceEffects } from '../purge/fence.js';
import type { ChannelMessage } from './channel.js';
import { isChannelNotice } from './channel-notice.js';

const TTL = 10 * 60_000;
type Seen = { id: string; revision: number; hash: string };
type Observation = { owner: string; channelId: string; seen: Seen[]; expires: number };
export type SendReviewOutcome = {
  status: 'held' | 'dropped' | 'expired' | 'refused' | 'requires-review';
  channelId: string;
  draftId: string;
  reason: string;
  changedMessageIds?: string[];
  changedMessageCount?: number;
  yieldedToMessageIds?: string[];
  review?: {
    observationId: string;
    content: string;
    complete: boolean;
    observedMessageIds: string[];
    peerMessageIds?: string[];
    responsibility: string;
  };
  read?: { channel_id: string; limit: number };
};
export class SendReviewRequired extends Error {
  constructor(readonly outcome: SendReviewOutcome) {
    super(outcome.reason);
  }
}
export class GroupReplySourceRevoked extends Error {
  readonly code = 'group-reply-source-revoked';
  constructor(readonly channelId: string) {
    super(
      'Group reply source membership was revoked. Stop this task; do not continue in another Channel.',
    );
  }
}
export type ReviewDraft = {
  id: string;
  owner: string;
  channelId: string;
  sourceEventId: string;
  boot: string;
  expires: number;
  state: string;
  attempts: number;
  original: ChannelMessage;
  current: ChannelMessage;
  basis: Seen[];
  initialBasis: Seen[];
  yieldedToMessageIds?: string[];
};

export class GroupSendReview {
  readonly #boot = randomUUID();
  readonly #observations = new Map<string, Observation>();
  constructor(
    readonly database: OperationalDatabaseModulePort,
    readonly now: () => Date = () => new Date(),
  ) {}

  enabled(channelId: string): boolean {
    return (
      this.database.read((db) =>
        db.prepare('SELECT 1 FROM group_send_review_enabled WHERE channel_id = ?').get(channelId),
      ) !== undefined
    );
  }

  configure(channelId: string, enabled: boolean): void {
    this.database.transaction((db) => {
      db.prepare(
        enabled
          ? 'INSERT OR IGNORE INTO group_send_review_enabled VALUES (?)'
          : 'DELETE FROM group_send_review_enabled WHERE channel_id = ?',
      ).run(channelId);
    });
  }

  observe(owner: string, channelId: string, messages: ChannelMessage[], previous?: string): string {
    const now = this.now().getTime();
    for (const [id, value] of this.#observations)
      if (value.expires <= now) this.#observations.delete(id);
    const prior = previous === undefined ? undefined : this.#observations.get(previous);
    const seen = new Map<string, Seen>();
    if (prior?.owner === owner && prior.channelId === channelId && prior.expires > now)
      for (const item of prior.seen) seen.set(item.id, item);
    for (const message of messages) {
      if (message.channelRevision === undefined) continue;
      seen.set(message.id, {
        id: message.id,
        revision: message.channelRevision,
        hash: fingerprint(message),
      });
    }
    const id = randomUUID();
    this.#observations.set(id, { owner, channelId, seen: [...seen.values()], expires: now + TTL });
    while (this.#observations.size > 4096)
      this.#observations.delete(this.#observations.keys().next().value!);
    return id;
  }

  inspect(owner: string, channelId: string, draftId: string): ReviewDraft | undefined {
    return this.database.read((db) => this.#load(db, owner, channelId, draftId));
  }

  drop(
    owner: string,
    channelId: string,
    draftId: string,
    evidence?: { observationId: string; messageIds: string[] },
  ): SendReviewOutcome {
    return this.database.transaction((db) => {
      const draft = this.#load(db, owner, channelId, draftId);
      if (!draft || draft.state === 'committed')
        return { status: 'refused', channelId, draftId, reason: 'draft-unavailable' };
      if (evidence && draft.state !== 'dropped') {
        const observation = this.#observations.get(evidence.observationId);
        const botSlug = draft.original.author.kind === 'bot' ? draft.original.author.slug : '';
        const validObservation =
          observation?.owner === owner &&
          observation.channelId === channelId &&
          observation.expires > this.now().getTime();
        const validPeers =
          evidence.messageIds.length > 0 &&
          evidence.messageIds.length <= 20 &&
          evidence.messageIds.every((id) => {
            const seen = validObservation && observation.seen.find((item) => item.id === id);
            if (!seen) return false;
            const row = db
              .prepare(`SELECT e.payload_json, e.body FROM channel_placements p
                JOIN source_events e ON e.source_event_id = p.source_event_id
                WHERE p.channel_id = ? AND p.message_id = ?
                AND NOT EXISTS (SELECT 1 FROM messaging_purge_facts f
                  WHERE f.channel_id = p.channel_id AND f.message_id = p.message_id)`)
              .get(channelId, id);
            if (!row) return false;
            const message = {
              ...JSON.parse(String(row.payload_json)),
              body: String(row.body),
            } as ChannelMessage;
            return (
              message.author.kind === 'bot' &&
              message.author.slug !== botSlug &&
              !isChannelNotice(message) &&
              !message.sessionFailure &&
              !!message.body.trim() &&
              fingerprint(message) === seen.hash
            );
          });
        if (!validPeers)
          return {
            status: 'refused',
            channelId,
            draftId,
            reason: 'peer-answer-not-observed',
          };
        draft.yieldedToMessageIds = [...new Set(evidence.messageIds)];
      }
      draft.state = 'dropped';
      this.#save(db, draft);
      return {
        status: 'dropped',
        channelId,
        draftId,
        reason: draft.yieldedToMessageIds
          ? 'explicit-peer-yield'
          : 'explicit-drop-does-not-resolve-inbox',
        ...(draft.yieldedToMessageIds ? { yieldedToMessageIds: draft.yieldedToMessageIds } : {}),
      };
    });
  }

  check(
    db: DatabaseSync,
    input: {
      owner: string;
      channelId: string;
      sourceEventId: string;
      message: ChannelMessage;
      observationId?: string;
      draftId?: string;
    },
  ): SendReviewOutcome | undefined {
    const { owner, channelId, message } = input;
    const id = input.draftId ?? message.id;
    const fail = (status: SendReviewOutcome['status'], reason: string): SendReviewOutcome => ({
      status,
      channelId,
      draftId: id,
      reason,
    });
    const previous = this.#load(db, owner, channelId, id);
    if (input.draftId && !previous) return fail('refused', 'draft-unavailable');
    if (!input.draftId) {
      const pending = db
        .prepare(`SELECT record_json FROM group_send_review_drafts
        WHERE owner = ? AND channel_id = ? AND source_event_id = ?
        AND json_extract(record_json, '$.state') IN ('held', 'requires-review') LIMIT 1`)
        .get(owner, channelId, input.sourceEventId);
      if (pending) {
        const held = JSON.parse(String(pending.record_json)) as ReviewDraft;
        if (held.expires <= this.now().getTime()) {
          held.state = 'expired';
          this.#save(db, held);
          return { status: 'expired', channelId, draftId: held.id, reason: 'draft-expired' };
        }
        if (held.boot !== this.#boot)
          return {
            status: 'requires-review',
            channelId,
            draftId: held.id,
            reason: 'host-restarted',
          };
        return {
          status: held.state === 'held' ? 'held' : 'requires-review',
          channelId,
          draftId: held.id,
          reason: 'use-existing-draft-no-new-retry-budget',
        };
      }
    }
    if (previous) {
      if (previous.expires <= this.now().getTime()) {
        previous.state = 'expired';
        this.#save(db, previous);
        return fail('expired', 'draft-expired');
      }
      if (previous.boot !== this.#boot) return fail('requires-review', 'host-restarted');
      if (previous.state !== 'held') return fail('refused', 'draft-terminal');
      if (!input.draftId) return fail('held', 'use-explicit-draft-id');
      if (previous.attempts >= 1) return fail('requires-review', 'retry-budget-exhausted');
    }
    const observation =
      input.observationId === undefined ? undefined : this.#observations.get(input.observationId);
    const basis =
      observation?.owner === owner &&
      observation.channelId === channelId &&
      observation.expires > this.now().getTime()
        ? observation.seen
        : [];
    const draft: ReviewDraft = previous ?? {
      id,
      owner,
      channelId,
      sourceEventId: input.sourceEventId,
      boot: this.#boot,
      expires: this.now().getTime() + TTL,
      state: 'held',
      attempts: 0,
      original: message,
      current: message,
      basis,
      initialBasis: basis,
    };
    if (previous) draft.attempts += 1;
    draft.current = message;
    const priorBasis = draft.basis;
    draft.basis = basis;
    const allBasis = [...priorBasis, ...basis];
    const floor = allBasis.length ? Math.min(...allBasis.map((item) => item.revision)) : 0;
    const botSlug = message.author.kind === 'bot' ? message.author.slug : '';
    requireSourceEffects(db, draft.sourceEventId, botSlug);
    const purged = db
      .prepare(`SELECT 1 FROM messaging_purge_facts WHERE channel_id = ? AND message_id IN
      (SELECT message_id FROM channel_placements WHERE channel_id = ? AND revision >= ?) LIMIT 1`)
      .get(channelId, channelId, floor);
    if (purged) return fail('refused', 'observed-content-purged');
    const rows = db
      .prepare(`SELECT p.message_id, p.revision, e.payload_json, e.body
      FROM channel_placements p JOIN source_events e ON e.source_event_id = p.source_event_id
      WHERE p.channel_id = ? AND p.revision >= ? ORDER BY p.revision`)
      .all(channelId, floor);
    const seen = new Map(basis.map((item) => [item.id, item]));
    const changed = rows
      .filter((row) => {
        const content = {
          ...JSON.parse(String(row.payload_json)),
          body: String(row.body),
        } as ChannelMessage;
        if (
          isChannelNotice(content) ||
          (content.author?.kind !== 'human' && content.author?.kind !== 'bot')
        )
          return false;
        return seen.get(String(row.message_id))?.hash !== fingerprint(content);
      })
      .map((row) => String(row.message_id));
    if (basis.length === 0 || changed.length > 0) {
      draft.state = previous ? 'requires-review' : 'held';
      this.#save(db, draft);
      return {
        ...fail(
          previous ? 'requires-review' : 'held',
          previous
            ? 'changed-again-stop-and-keep-responsibility-open'
            : 'read-new-context-then-revise-or-drop',
        ),
        changedMessageIds: changed.slice(0, 20),
        changedMessageCount: changed.length,
        read: { channel_id: channelId, limit: 20 },
      };
    }
    draft.state = 'committed';
    this.#save(db, draft);
    return undefined;
  }

  #load(db: DatabaseSync, owner: string, channelId: string, id: string): ReviewDraft | undefined {
    const row = db
      .prepare(
        'SELECT record_json FROM group_send_review_drafts WHERE id = ? AND owner = ? AND channel_id = ?',
      )
      .get(id, owner, channelId);
    return row === undefined ? undefined : (JSON.parse(String(row.record_json)) as ReviewDraft);
  }
  #save(db: DatabaseSync, draft: ReviewDraft): void {
    db.prepare(`INSERT INTO group_send_review_drafts (id, owner, channel_id, source_event_id, record_json)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET record_json = excluded.record_json`).run(
      draft.id,
      draft.owner,
      draft.channelId,
      draft.sourceEventId,
      JSON.stringify(draft),
    );
  }
}

function fingerprint(message: ChannelMessage): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        author: message.author,
        body: message.body,
        attachments: message.attachments,
        replyTo: message.replyTo,
        mentions: message.mentions,
        humanMentions: message.humanMentions,
      }),
    )
    .digest('hex');
}
