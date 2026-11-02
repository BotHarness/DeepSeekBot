import { createHash, randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import type { OperationalDatabaseModulePort } from '../database/owner.js';
import { requireSourceEffects } from '../purge/fence.js';
import type { ChannelMessage } from './channel.js';
import { isChannelNotice } from './channel-notice.js';

const TTL = 10 * 60_000;
const MAX_RECHECKS = 2;
type Seen = { id: string; revision: number; hash: string; readSerial?: number };
type Observation = { owner: string; channelId: string; seen: Seen[]; expires: number };
export type FreshnessOverride = { draftVersion: number; reason: string };
export type SendReviewOutcome = {
  status: 'held' | 'dropped' | 'expired' | 'refused' | 'requires-review';
  channelId: string;
  draftId: string;
  reason: string;
  draftVersion?: number;
  budget?: { used: number; limit: number; exhausted: boolean };
  choices?: ('drop' | 'snooze-inbox' | 'freshness-override')[];
  suggestedSnoozeUntil?: string;
  keepOpenInboxIds?: string[];
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
  version?: number;
  requiredReview?: Seen[];
  requiredObservationSerial?: number;
  requiredObservationBoot?: string;
  overrideAttemptedAt?: string;
  override?: {
    actor: string;
    reason: string;
    observationId: string;
    observedMessageIds: string[];
    draftVersion: number;
    count: 1;
    at: string;
    messageId: string;
  };
  committed?: { messageId: string; intent: string; at: string };
  recoveredAt?: string;
  terminationReason?: 'stopped';
};

export type DraftInspection = {
  status: 'inspected';
  channelId: string;
  hasMore: boolean;
  drafts: {
    draftId: string;
    state: string;
    sourceEventId: string;
    expiresAt: string;
    requiresRecovery: boolean;
    messageId?: string;
  }[];
};

export class GroupSendReview {
  readonly #boot = randomUUID();
  readonly #observations = new Map<string, Observation>();
  #observationSerial = 0;
  constructor(
    readonly database: OperationalDatabaseModulePort,
    readonly now: () => Date = () => new Date(),
    readonly projectMessageAttachments: (
      sourceEventId: string,
      message: ChannelMessage,
    ) => ChannelMessage = (_sourceEventId, message) => message,
    readonly attachmentContentVersions: (message: ChannelMessage) => string[] = () => [],
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
    const readSerial = ++this.#observationSerial;
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
        hash: this.#observedFingerprint(message),
        readSerial,
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

  inspectRecords(
    owner: string,
    channelId: string,
    draftId?: string,
  ): DraftInspection | SendReviewOutcome {
    return this.database.transaction((db) => {
      const records =
        draftId === undefined
          ? db
              .prepare(`SELECT record_json FROM group_send_review_drafts WHERE owner = ? AND channel_id = ?
          ORDER BY CASE WHEN json_extract(record_json, '$.state') IN ('held', 'requires-review') THEN 0 ELSE 1 END,
          json_extract(record_json, '$.expires') DESC, id DESC LIMIT 21`)
              .all(owner, channelId)
              .map((row) => JSON.parse(String(row.record_json)) as ReviewDraft)
          : [this.#load(db, owner, channelId, draftId)].filter(
              (value): value is ReviewDraft => value !== undefined,
            );
      if (draftId !== undefined && records.length === 0)
        return { status: 'refused', channelId, draftId, reason: 'draft-unavailable' };
      return {
        status: 'inspected',
        channelId,
        hasMore: records.length > 20,
        drafts: records.slice(0, 20).map((draft) => {
          const botSlug = draft.original.author.kind === 'bot' ? draft.original.author.slug : '';
          requireSourceEffects(db, draft.sourceEventId, botSlug);
          if (
            draft.state !== 'committed' &&
            draft.state !== 'dropped' &&
            draft.expires <= this.now().getTime()
          ) {
            draft.state = 'expired';
            this.#save(db, draft);
          }
          return {
            draftId: draft.id,
            state: draft.state,
            sourceEventId: draft.sourceEventId,
            expiresAt: new Date(draft.expires).toISOString(),
            requiresRecovery:
              (draft.state === 'held' || draft.state === 'requires-review') &&
              draft.boot !== this.#boot,
            ...(draft.committed ? { messageId: draft.committed.messageId } : {}),
          };
        }),
      };
    });
  }

  replay(
    owner: string,
    channelId: string,
    draftId: string,
    message: ChannelMessage,
  ): string | undefined {
    return this.database.read((db) => {
      const draft = this.#load(db, owner, channelId, draftId);
      if (draft?.state !== 'committed' || !draft.committed) return undefined;
      const refuse = (reason: string): never => {
        throw new SendReviewRequired({ status: 'refused', channelId, draftId, reason });
      };
      const botSlug = message.author.kind === 'bot' ? message.author.slug : '';
      requireSourceEffects(db, draft.sourceEventId, botSlug);
      if (fingerprint(message) !== draft.committed.intent)
        return refuse('draft-commit-content-changed');
      const row = db
        .prepare(
          'SELECT source_event_id FROM channel_placements WHERE channel_id = ? AND message_id = ?',
        )
        .get(channelId, draft.committed.messageId);
      if (!row) return refuse('committed-message-unavailable');
      requireSourceEffects(db, String(row.source_event_id), botSlug);
      return draft.committed.messageId;
    });
  }

  stop(botSlug: string): void {
    this.database.transaction((db) => {
      const rows = db
        .prepare(`SELECT record_json FROM group_send_review_drafts
        WHERE json_extract(record_json, '$.original.author.slug') = ?
        AND json_extract(record_json, '$.state') IN ('held', 'requires-review')`)
        .all(botSlug);
      for (const row of rows) {
        const draft = JSON.parse(String(row.record_json)) as ReviewDraft;
        draft.state = 'dropped';
        draft.terminationReason = 'stopped';
        this.#save(db, draft);
      }
    });
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
      if (draft.expires <= this.now().getTime()) {
        draft.state = 'expired';
        this.#save(db, draft);
        return { status: 'expired', channelId, draftId, reason: 'draft-expired' };
      }
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
              .prepare(`SELECT p.source_event_id, e.payload_json, e.body FROM channel_placements p
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
              this.#observedFingerprint(
                this.projectMessageAttachments(String(row.source_event_id), message),
              ) === seen.hash
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
      const { budget, suggestedSnoozeUntil } = this.#progress(draft);
      const keepOpenInboxIds =
        budget.exhausted && !draft.yieldedToMessageIds
          ? [
              draft.sourceEventId,
              ...db
                .prepare(
                  'SELECT message_id FROM channel_placements WHERE channel_id = ? AND source_event_id = ?',
                )
                .all(channelId, draft.sourceEventId)
                .map((row) => String(row.message_id)),
            ]
          : undefined;
      return {
        status: 'dropped',
        channelId,
        draftId,
        reason: draft.yieldedToMessageIds
          ? 'explicit-peer-yield'
          : 'explicit-drop-does-not-resolve-inbox',
        budget,
        ...(keepOpenInboxIds ? { keepOpenInboxIds: [...new Set(keepOpenInboxIds)] } : {}),
        ...(suggestedSnoozeUntil ? { suggestedSnoozeUntil } : {}),
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
      freshnessOverride?: FreshnessOverride;
      recover?: boolean;
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
    if (input.freshnessOverride && !previous)
      return fail('refused', 'override-requires-exhausted-draft');
    if (!input.draftId) {
      const pending = db
        .prepare(`SELECT record_json FROM group_send_review_drafts
        WHERE owner = ? AND channel_id = ?
        AND json_extract(record_json, '$.state') IN ('held', 'requires-review') LIMIT 1`)
        .get(owner, channelId);
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
          ...this.#progress(held),
        };
      }
    }
    if (previous) {
      if (previous.expires <= this.now().getTime()) {
        previous.state = 'expired';
        this.#save(db, previous);
        return fail('expired', 'draft-expired');
      }
      if (previous.state !== 'held' && previous.state !== 'requires-review')
        return fail('refused', 'draft-terminal');
      if (previous.boot !== this.#boot && !input.recover)
        return fail('requires-review', 'host-restarted');
      if (!input.draftId) return fail('held', 'use-explicit-draft-id');
      if (input.freshnessOverride) {
        if (previous.overrideAttemptedAt)
          return fail('refused', 'override-already-attempted-defer');
        if (previous.attempts < MAX_RECHECKS || previous.override)
          return fail('refused', 'override-requires-exhausted-draft');
        if (input.freshnessOverride.draftVersion !== (previous.version ?? 1))
          return fail('refused', 'draft-version-changed');
        if (!input.freshnessOverride.reason.trim() || input.freshnessOverride.reason.length > 500)
          return fail('refused', 'override-reason-required');
      } else if (previous.attempts >= MAX_RECHECKS)
        return {
          ...fail('requires-review', 'retry-budget-exhausted'),
          ...this.#progress(previous),
        };
    }
    const observation =
      input.observationId === undefined ? undefined : this.#observations.get(input.observationId);
    const basis =
      observation?.owner === owner &&
      observation.channelId === channelId &&
      observation.expires > this.now().getTime()
        ? observation.seen
        : [];
    if (input.recover && (!previous || basis.length === 0))
      return fail('refused', 'recovery-requires-draft-and-fresh-observation');
    const draft: ReviewDraft = previous ?? {
      id,
      owner,
      channelId,
      sourceEventId: input.sourceEventId,
      boot: this.#boot,
      expires: this.now().getTime() + TTL,
      state: 'held',
      attempts: 0,
      version: 1,
      original: message,
      current: message,
      basis,
      initialBasis: basis,
    };
    if (input.freshnessOverride) {
      if (
        !basis.length ||
        !previous?.requiredReview?.every((required) =>
          basis.some(
            (item) =>
              item.id === required.id &&
              (item.hash === required.hash ||
                (previous.requiredObservationBoot ?? previous.boot) !== this.#boot ||
                (item.readSerial ?? 0) >
                  (previous.requiredObservationSerial ?? Number.MAX_SAFE_INTEGER)),
          ),
        )
      )
        return fail('refused', 'override-context-not-observed');
    } else if (previous) draft.attempts += 1;
    if (previous) draft.version = (draft.version ?? 1) + 1;
    if (input.recover && draft.boot !== this.#boot) {
      draft.boot = this.#boot;
      draft.recoveredAt = this.now().toISOString();
    }
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
      .prepare(`SELECT p.message_id, p.revision, p.source_event_id, e.payload_json, e.body
      FROM channel_placements p JOIN source_events e ON e.source_event_id = p.source_event_id
      WHERE p.channel_id = ? AND p.revision >= ?
      ORDER BY p.revision DESC ${allBasis.length === 0 ? 'LIMIT 20' : ''}`)
      .all(channelId, floor);
    const seen = new Map(basis.map((item) => [item.id, item]));
    const currentBasis: Seen[] = rows.flatMap((row) => {
      const content = {
        ...JSON.parse(String(row.payload_json)),
        body: String(row.body),
      } as ChannelMessage;
      return isChannelNotice(content) ||
        (content.author?.kind !== 'human' && content.author?.kind !== 'bot')
        ? []
        : [
            {
              id: String(row.message_id),
              revision: Number(row.revision),
              hash: this.#observedFingerprint(
                this.projectMessageAttachments(String(row.source_event_id), content),
              ),
            },
          ];
    });
    const changed = currentBasis
      .filter((row) => {
        return seen.get(row.id)?.hash !== row.hash;
      })
      .map((row) => row.id);
    if (input.freshnessOverride) {
      draft.overrideAttemptedAt = this.now().toISOString();
      if (changed.length > 0) {
        draft.state = 'requires-review';
        draft.requiredReview = currentBasis;
        draft.requiredObservationSerial = this.#observationSerial;
        draft.requiredObservationBoot = this.#boot;
        this.#save(db, draft);
        return {
          ...fail('requires-review', 'override-context-changed-defer'),
          ...this.#progress(draft),
          changedMessageIds: changed.slice(0, 20).reverse(),
          changedMessageCount: changed.length,
          read: { channel_id: channelId, limit: 20 },
        };
      }
      draft.override = {
        actor: owner,
        reason: input.freshnessOverride.reason.trim(),
        observationId: input.observationId!,
        observedMessageIds: basis.map((item) => item.id),
        draftVersion: input.freshnessOverride.draftVersion,
        count: 1,
        at: this.now().toISOString(),
        messageId: message.id,
      };
      this.#commit(db, draft, message);
      return undefined;
    }
    if (basis.length === 0 || changed.length > 0) {
      draft.state = draft.attempts >= MAX_RECHECKS ? 'requires-review' : 'held';
      draft.requiredReview = currentBasis;
      draft.requiredObservationSerial = this.#observationSerial;
      draft.requiredObservationBoot = this.#boot;
      this.#save(db, draft);
      return {
        ...fail(
          draft.state as 'held' | 'requires-review',
          draft.attempts >= MAX_RECHECKS
            ? 'retry-budget-exhausted'
            : 'read-new-context-then-revise-or-drop',
        ),
        ...this.#progress(draft),
        changedMessageIds: changed.slice(0, 20).reverse(),
        changedMessageCount: changed.length,
        read: { channel_id: channelId, limit: 20 },
      };
    }
    this.#commit(db, draft, message);
    return undefined;
  }

  #commit(db: DatabaseSync, draft: ReviewDraft, message: ChannelMessage): void {
    draft.state = 'committed';
    draft.committed = {
      messageId: message.id,
      intent: fingerprint(message),
      at: this.now().toISOString(),
    };
    draft.original = {
      id: draft.original.id,
      at: draft.original.at,
      author: draft.original.author,
      body: '',
    };
    draft.current = { id: message.id, at: message.at, author: message.author, body: '' };
    draft.basis = [];
    draft.initialBasis = [];
    this.#save(db, draft);
  }

  #progress(
    draft: ReviewDraft,
  ): Required<Pick<SendReviewOutcome, 'draftVersion' | 'budget'>> &
    Pick<SendReviewOutcome, 'choices' | 'suggestedSnoozeUntil'> {
    const choices: NonNullable<SendReviewOutcome['choices']> = [
      'drop',
      'snooze-inbox',
      ...(draft.overrideAttemptedAt ? [] : (['freshness-override'] as const)),
    ];
    return {
      draftVersion: draft.version ?? 1,
      budget: {
        used: draft.attempts,
        limit: MAX_RECHECKS,
        exhausted: draft.attempts >= MAX_RECHECKS,
      },
      ...(draft.attempts >= MAX_RECHECKS
        ? { choices, suggestedSnoozeUntil: new Date(this.now().getTime() + 30_000).toISOString() }
        : {}),
    };
  }

  #observedFingerprint(message: ChannelMessage): string {
    return createHash('sha256')
      .update(JSON.stringify([fingerprint(message), this.attachmentContentVersions(message)]))
      .digest('hex');
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
