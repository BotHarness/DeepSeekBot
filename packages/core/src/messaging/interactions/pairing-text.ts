import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { ApprovalMessaging } from '../approval-messaging.js';
import { readMessagingIdentity, type MessagingIdentity } from '../identity.js';
import {
  pairedRoute,
  type BotPairing,
  type PairingRequest,
  type PairingReviewer,
} from '../pairing.js';
import { reviewCards } from '../pairing-cards.js';
import {
  effectivePairingPermissions,
  externalUserRoles,
  platformPeople,
  readSenderPolicy,
  type ExternalUserRole,
} from '../permissions/index.js';
import { isMessagingPlatform } from '../platforms/index.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from '../provider.js';
import { answerText } from './text-answers.js';
import { ALLOW_WORDS, REJECT_WORDS } from './text-approvals.js';

export interface PairingReply {
  decision: 'approve' | 'reject';
  role?: string;
  reference?: string;
}

const byLength = (words: readonly string[]) => [...words].sort((a, b) => b.length - a.length);
const ALLOW = byLength(ALLOW_WORDS);
const REJECT = byLength(REJECT_WORDS);
const cjk = /^\p{Script=Han}/u;

function leading(body: string, words: string[]) {
  const lower = body.toLowerCase();
  for (const word of words) {
    if (!lower.startsWith(word)) continue;
    const rest = body.slice(word.length);
    if (!rest || /^\s/u.test(rest) || cjk.test(word)) return rest.trim();
  }
  return undefined;
}

export function parsePairingReply(text: string): PairingReply | undefined {
  let reference: string | undefined;
  const body = text
    .replace(/(?:^|\s)#([A-Fa-f0-9]{10})(?=\s|$)/u, (_, ref: string) => {
      reference = ref.toUpperCase();
      return ' ';
    })
    .trim()
    .replace(/[。.!！]+$/u, '')
    .trim();
  const rejected = leading(body, REJECT);
  if (rejected !== undefined)
    return rejected ? undefined : { decision: 'reject', ...(reference ? { reference } : {}) };
  const role = leading(body, ALLOW);
  if (role === undefined || role.length > 80) return undefined;
  return {
    decision: 'approve',
    ...(role ? { role } : {}),
    ...(reference ? { reference } : {}),
  };
}

const RECENT_MS = 30 * 60 * 1000;
const routeKey = (pairingId: string) => `route:${pairingId}`;
const privateKey = (actorId: string) => `private:${actorId}`;

const NOTICE = {
  unauthorized:
    'Only people allowed to review pairing for this Bot can approve or reject this request. / 只有此 Bot 的配对审核人可以批准或拒绝该申请。',
  settled: (reference: string) =>
    `Pairing request ${reference} is no longer waiting for review. / 配对申请 ${reference} 已不在待审核状态。`,
  noRole:
    'You cannot assign any Role, so this request can only be approved in Web settings. / 你没有可分配的角色，请在 Web 设置中审核。',
  chooseRole: (roles: string[]) =>
    `Choose a Role: reply "approve <role>". Roles you can assign: ${roles.join(', ')}. / 请指定角色，回复「同意 <角色>」。可分配的角色：${roles.join('、')}。`,
  unknownRole: (name: string, roles: string[]) =>
    `Role "${name}" was not found. Roles you can assign: ${roles.join(', ') || 'none'}. / 没有找到角色「${name}」。可分配的角色：${roles.join('、') || '无'}。`,
  chooseRolePublic:
    'Choose a Role: reply "approve <role>". The Roles you can assign were sent to you privately. / 请指定角色，回复「同意 <角色>」。可分配的角色已私信发给你。',
  unknownRolePublic: (name: string) =>
    `Role "${name}" was not found. The Roles you can assign were sent to you privately. / 没有找到角色「${name}」。可分配的角色已私信发给你。`,
  rolesInWeb:
    'Choose a Role: reply "approve <role>". See the Roles you can assign in Web settings. / 请指定角色，回复「同意 <角色>」。可分配的角色请在 Web 设置中查看。',
  privateRoles: (reference: string, roles: string[], unknown?: string) =>
    [
      unknown
        ? `Role "${unknown}" was not found for pairing request ${reference}. / 配对申请 ${reference} 没有找到角色「${unknown}」。`
        : `Pairing request ${reference} needs a Role. / 配对申请 ${reference} 需要指定角色。`,
      `Roles you can assign / 可分配的角色: ${roles.join(', ')}`,
      'Reply to this message or in the original thread with "approve <role>". / 回复本消息或在原线程回复「同意 <角色>」。',
      `#${reference}`,
    ].join('\n\n'),
  deniedRole: (name: string) =>
    `You cannot assign the Role "${name}". / 你不能分配角色「${name}」。`,
  approved: (reference: string, role: string) =>
    `Approved pairing request ${reference} with Role ${role}. / 已批准配对申请 ${reference}，角色：${role}。`,
  approvedPublic: (reference: string) =>
    `Approved pairing request ${reference}. / 已批准配对申请 ${reference}。`,
  rejected: (reference: string) =>
    `Rejected pairing request ${reference}. / 已拒绝配对申请 ${reference}。`,
  ambiguous:
    'Several pairing requests match this reply. Reply with the request number, for example "approve Colleague #ABCDEF0123". / 有多个配对申请匹配这条回复，请带上申请编号，例如「同意 Colleague #ABCDEF0123」。',
  failed: (reference: string) =>
    `Pairing request ${reference} could not be reviewed here. Review it in Web settings. / 配对申请 ${reference} 无法在此审核，请在 Web 设置中处理。`,
};

export function renderPairingReview(
  request: PairingRequest,
  platform: string,
  roles: ExternalUserRole[],
  defaultRoleId?: string,
): string {
  const names = roles.map((role) =>
    role.id === defaultRoleId ? `${role.name} (default / 默认)` : role.name,
  );
  return [
    'Pairing review / 配对审核',
    [
      `Applicant / 申请人: ${request.actorName ? `${request.actorName} (${request.actorId})` : request.actorId}`,
      `App / 应用: ${request.accountName} · ${platform}`,
      `Conversation / 会话: ${request.conversationKind === 'group' ? 'group / 群' : 'DM / 私聊'} ${request.conversationId}`,
      `Expires / 到期: ${request.expiresAt}`,
      `Roles you can assign / 可分配角色: ${names.join(', ') || 'None / 无'}`,
    ].join('\n'),
    defaultRoleId && roles.some((role) => role.id === defaultRoleId)
      ? 'Reply to this message with "approve" for the default Role, "approve <role>" or "reject". / 回复本消息「同意」使用默认角色，或「同意 <角色>」「拒绝」。'
      : 'Reply to this message with "approve <role>" or "reject". / 回复本消息「同意 <角色>」或「拒绝」。',
    `#${request.reference}`,
  ]
    .join('\n\n')
    .slice(0, 16000);
}

export function createPairingText(options: {
  database: OperationalDatabaseModulePort;
  pairing: BotPairing;
  approvals: Pick<ApprovalMessaging, 'managementDestination'>;
  provider(id: string): MessagingProvider;
  isBotActive(slug: string): boolean;
  routeAvailable(request: PairingRequest): boolean;
  notifyApplicant(request: PairingRequest): Promise<void>;
  reviewed(botSlug: string): void;
  warn?(message: string): void;
}) {
  const { database, pairing } = options;
  const log = (phase: string, outcome: string) =>
    options.warn?.(
      JSON.stringify({ event: 'pairing-text', initiator: 'messaging', phase, outcome }),
    );
  const assignable = (botSlug: string, bindingId: string, actorId: string) =>
    database.read((db) => {
      const permissions = effectivePairingPermissions(db, botSlug, bindingId, actorId);
      const delegable = permissions.delegableCapabilities ?? [];
      return {
        reviewer: permissions.capabilities.includes('review-pairing'),
        roles: externalUserRoles(db, botSlug).filter((role) =>
          [...role.capabilities, ...(role.delegableCapabilities ?? [])].every((cap) =>
            delegable.includes(cap),
          ),
        ),
        all: externalUserRoles(db, botSlug),
        defaultRoleId: readSenderPolicy(db, botSlug).defaultRoleId,
      };
    });

  const notify = async (request: PairingRequest) => {
    if (request.status !== 'pending' || request.purpose !== 'conversation' || !request.reply)
      return;
    let destination: ReturnType<ApprovalMessaging['managementDestination']>;
    try {
      destination = options.approvals.managementDestination(request.botSlug);
    } catch {
      return;
    }
    const { identity, paired, provider } = destination;
    if (
      !provider.reply ||
      (identity.id === request.bindingId && paired.actorId === request.actorId) ||
      (identity.id === request.bindingId && reviewCards(identity.platform))
    )
      return;
    const scope = assignable(request.botSlug, identity.id, paired.actorId);
    const target = pairedRoute(paired);
    if (!scope.reviewer || !target) return;
    const key = routeKey(paired.id);
    if (!pairing.notice(request.id, key)) return;
    let outcome: 'accepted' | 'unconfirmed' = 'unconfirmed';
    let receipt: { messageId: string; conversationId: string } | undefined;
    try {
      const live = () => {
        try {
          const current = pairing.list(request.botSlug).find((item) => item.id === request.id);
          const holder = options.approvals.managementDestination(request.botSlug);
          return (
            holder.identity.id === identity.id &&
            holder.paired.id === paired.id &&
            holder.paired.revision === paired.revision &&
            assignable(request.botSlug, identity.id, paired.actorId).reviewer &&
            options.isBotActive(request.botSlug) &&
            current?.status === 'pending' &&
            current.revision === request.revision &&
            options.routeAvailable(current)
          );
        } catch {
          return false;
        }
      };
      const sent = await provider.reply({
        accountRef: identity.accountRef,
        fingerprint: identity.fingerprint,
        route: target,
        text: renderPairingReview(
          request,
          platformName(request, identity),
          scope.roles,
          scope.defaultRoleId,
        ),
        signal: AbortSignal.timeout(15000),
        beforeSend: live,
        standalone: true,
      });
      if (sent.receipt) {
        receipt = {
          messageId: sent.receipt.messageId,
          conversationId: sent.receipt.conversationId,
        };
        outcome = 'accepted';
      }
    } catch {}
    pairing.notice(request.id, key, outcome, receipt);
    log('route-review', outcome);
  };

  const text = async (
    providerId: string,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<boolean> => {
    if (
      !isMessagingPlatform(event.channel) ||
      !platformPeople(event.channel)?.roles ||
      event.actor.kind !== 'user' ||
      event.attachments?.length
    )
      return false;
    const parsed = parsePairingReply(answerText(event));
    if (!parsed) return false;
    const binding = database.read((db) => {
      const row = db
        .prepare(
          'SELECT id FROM messaging_bindings WHERE provider_id = ? AND account_ref = ? AND fingerprint = ? AND revoked_at IS NULL',
        )
        .get(providerId, event.botId, event.fingerprint) as { id: string } | undefined;
      return row ? readMessagingIdentity(db, row.id) : undefined;
    });
    if (!binding?.enabled || !options.isBotActive(binding.botSlug)) return false;
    const conversation = event.conversation.id;
    const requests = pairing
      .list(binding.botSlug)
      .filter((item) => item.purpose === 'conversation');
    const routeNotice = (item: PairingRequest) =>
      item.notifications?.some(
        (notice) =>
          notice.key.startsWith('route:') && notice.receipt?.conversationId === conversation,
      ) ?? false;
    const threadNotice = (item: PairingRequest) =>
      item.bindingId === binding.id &&
      (item.conversationId === conversation ||
        (item.notifications?.some(
          (notice) =>
            (notice.key.startsWith('pending:') || notice.key === privateKey(event.actor.id)) &&
            notice.receipt?.conversationId === conversation,
        ) ??
          false));
    const reachable = (item: PairingRequest) => threadNotice(item) || routeNotice(item);
    const anchors = [event.reply.parentId, event.reply.threadId, event.reply.rootId].filter(
      (id): id is string => !!id && id !== event.messageId,
    );
    const exact = (item: PairingRequest) => {
      const ids = [
        ...(item.messageIds ?? []),
        ...(item.notifications ?? [])
          .filter((notice) => notice.receipt?.conversationId === conversation)
          .map((notice) => notice.receipt!.messageId),
      ];
      return anchors.some((id) => ids.includes(id));
    };
    const sharedThread = (item: PairingRequest) =>
      !!item.reply?.threadId && anchors.includes(item.reply.threadId);
    const candidates = requests.filter(reachable);
    const exactMatches = candidates.filter(exact);
    const anchorMatches = exactMatches.length ? exactMatches : candidates.filter(sharedThread);
    const ambiguous = !parsed.reference && anchorMatches.length > 1;
    const reviewerFor = (item: PairingRequest): PairingReviewer =>
      threadNotice(item)
        ? { bindingId: binding.id, actorId: event.actor.id }
        : { bindingId: binding.id, actorId: event.actor.id, approvalRoute: true };
    let target = parsed.reference
      ? requests.find((item) => item.reference === parsed.reference && reachable(item))
      : anchorMatches.length === 1
        ? anchorMatches[0]
        : undefined;
    let explicit = !!target;
    if (ambiguous) {
      if (!assignable(binding.botSlug, binding.id, event.actor.id).reviewer) return false;
      setImmediate(() => {
        if (!signal.aborted) void send(providerId, binding, event, NOTICE.ambiguous, signal);
      });
      return true;
    }
    if (!target && !parsed.reference) {
      const pending = requests.filter((item) => item.status === 'pending' && reachable(item));
      if (pending.length === 1 && !approvalPending(conversation)) target = pending[0];
      else if (!pending.length) {
        const cutoff = Date.now() - RECENT_MS;
        target = requests
          .filter(
            (item) =>
              item.status !== 'pending' &&
              reachable(item) &&
              Date.parse(item.updatedAt ?? item.reviewedAt ?? item.createdAt) >= cutoff,
          )
          .sort((a, b) =>
            (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt),
          )[0];
      }
    }
    if (!target) return false;
    const scope = assignable(binding.botSlug, binding.id, event.actor.id);
    if (!explicit && !scope.reviewer) return false;
    explicit = true;
    const reply = (text: string) =>
      setImmediate(() => {
        if (!signal.aborted) void send(providerId, binding, event, text, signal);
      });
    if (!scope.reviewer) {
      reply(NOTICE.unauthorized);
      return explicit;
    }
    if (target.status !== 'pending') {
      reply(NOTICE.settled(target.reference));
      return true;
    }
    const dm = event.conversation.kind === 'dm';
    const listRoles = (unknown?: string) => {
      const names = scope.roles.map((item) => item.name);
      if (dm) {
        reply(unknown ? NOTICE.unknownRole(unknown, names) : NOTICE.chooseRole(names));
        return;
      }
      setImmediate(() => {
        if (signal.aborted) return;
        void privately(providerId, binding, event, target!, names, unknown).then((sent) =>
          send(
            providerId,
            binding,
            event,
            sent
              ? unknown
                ? NOTICE.unknownRolePublic(unknown)
                : NOTICE.chooseRolePublic
              : NOTICE.rolesInWeb,
            signal,
          ),
        );
      });
    };
    let role: ExternalUserRole | undefined;
    if (parsed.decision === 'approve') {
      if (parsed.role) {
        const wanted = parsed.role.toLowerCase();
        role = scope.all.find((item) => item.name.trim().toLowerCase() === wanted);
        if (!role) {
          if (scope.roles.length) listRoles(parsed.role);
          else reply(NOTICE.noRole);
          return true;
        }
        if (!scope.roles.some((item) => item.id === role!.id)) {
          reply(NOTICE.deniedRole(role.name));
          return true;
        }
      } else {
        role =
          scope.roles.find((item) => item.id === scope.defaultRoleId) ??
          (scope.roles.length === 1 ? scope.roles[0] : undefined);
        if (!role) {
          if (scope.roles.length) listRoles();
          else reply(NOTICE.noRole);
          return true;
        }
      }
    }
    if (signal.aborted) return true;
    try {
      const accepted = pairing.review(
        binding.botSlug,
        parsed.decision === 'reject'
          ? { kind: 'reject', id: target.id, expectedRevision: target.revision }
          : {
              kind: 'approve',
              id: target.id,
              expectedRevision: target.revision,
              roleId: role!.id,
              expectedRoleRevision: role!.revision,
            },
        reviewerFor(target),
      );
      options.reviewed(binding.botSlug);
      log('review', parsed.decision);
      if (accepted.status === 'approved')
        void options.notifyApplicant(accepted).catch(() => log('applicant-notice', 'unconfirmed'));
      reply(
        parsed.decision === 'reject'
          ? NOTICE.rejected(target.reference)
          : dm
            ? NOTICE.approved(target.reference, role!.name)
            : NOTICE.approvedPublic(target.reference),
      );
    } catch (error) {
      log('review', error instanceof MessagingError ? error.code : 'failed');
      reply(
        error instanceof MessagingError && error.code === 'pairing-unauthorized'
          ? NOTICE.unauthorized
          : error instanceof MessagingError && error.code === 'pairing-delegation-denied'
            ? NOTICE.deniedRole(role?.name ?? '')
            : error instanceof MessagingError && error.code === 'pairing-stale'
              ? NOTICE.settled(target.reference)
              : NOTICE.failed(target.reference),
      );
    }
    return true;
  };

  const approvalPending = (conversationId: string) =>
    database.read(
      (db) =>
        !!db
          .prepare(
            "SELECT 1 FROM messaging_approval_deliveries WHERE json_extract(body, '$.status') = 'pending' AND json_extract(body, '$.receipt.conversationId') = ? LIMIT 1",
          )
          .get(conversationId),
    );

  const privately = async (
    providerId: string,
    binding: MessagingIdentity,
    event: MessagingInboundEvent,
    request: PairingRequest,
    roles: string[],
    unknown?: string,
  ) => {
    const provider = options.provider(providerId);
    const own = pairing
      .list(binding.botSlug)
      .find(
        (item) =>
          item.status === 'approved' &&
          item.bindingId === binding.id &&
          item.actorId === event.actor.id &&
          item.conversationKind === 'dm',
      );
    const route = own && pairedRoute(own);
    if (!provider.reply || !route) return false;
    const key = privateKey(event.actor.id);
    const first = pairing.notice(request.id, key);
    try {
      const sent = await provider.reply({
        accountRef: binding.accountRef,
        fingerprint: binding.fingerprint,
        route,
        text: NOTICE.privateRoles(request.reference, roles, unknown),
        signal: AbortSignal.timeout(15000),
        standalone: true,
        beforeSend: () => {
          try {
            const current = database.read((db) => readMessagingIdentity(db, binding.id));
            return (
              current.enabled &&
              !current.revokedAt &&
              current.fingerprint === binding.fingerprint &&
              options.isBotActive(binding.botSlug)
            );
          } catch {
            return false;
          }
        },
      });
      if (first)
        pairing.notice(
          request.id,
          key,
          sent.receipt ? 'accepted' : 'unconfirmed',
          sent.receipt && {
            messageId: sent.receipt.messageId,
            conversationId: sent.receipt.conversationId,
          },
        );
      log('private-roles', sent.receipt ? 'accepted' : 'unconfirmed');
      return true;
    } catch {
      if (first) pairing.notice(request.id, key, 'unconfirmed');
      log('private-roles', 'unconfirmed');
      return false;
    }
  };

  const send = async (
    providerId: string,
    binding: MessagingIdentity,
    event: MessagingInboundEvent,
    text: string,
    signal: AbortSignal,
  ) => {
    const provider = options.provider(providerId);
    if (!provider.reply) return;
    try {
      await provider.reply({
        accountRef: binding.accountRef,
        fingerprint: binding.fingerprint,
        route: event.reply,
        text,
        signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
        ...(event.conversation.kind === 'dm' ? { standalone: true as const } : {}),
        beforeSend: () => {
          try {
            const current = database.read((db) => readMessagingIdentity(db, binding.id));
            return (
              current.enabled &&
              !current.revokedAt &&
              current.fingerprint === binding.fingerprint &&
              options.isBotActive(binding.botSlug)
            );
          } catch {
            return false;
          }
        },
      });
    } catch {
      log('reply', 'unconfirmed');
    }
  };

  return { notify, text };
}

function platformName(request: PairingRequest, route: MessagingIdentity) {
  return request.bindingId === route.id ? route.platform : request.accountName;
}
