import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { MessagingIdentity } from '../identity.js';
import type { BotPairing, PairingCapability, PairingRequest } from '../pairing.js';
import {
  changeSenderAccess,
  effectivePairingPermissions,
  externalPermissionGroups,
  externalUserRoles,
  platformPeople,
  readSenderBlock,
  type ExternalPermissionGroup,
  type ExternalUserRole,
} from '../permissions/index.js';
import { isMessagingPlatform } from '../platforms/index.js';
import { MessagingError, type MessagingInboundEvent, type MessagingProvider } from '../provider.js';
import {
  controlBinding,
  controlDeliveries,
  controlReply,
  privateRoute,
} from './control-replies.js';

const errorCode = (error: unknown): string =>
  error instanceof MessagingError
    ? error.code
    : error instanceof Error && error.cause instanceof MessagingError
      ? error.cause.code
      : 'failed';

export interface RoleCommand {
  role?: string;
}

export function parseRoleCommand(text: string): RoleCommand | undefined {
  const match = /^[/／](?:roles?|角色)(?:\s+([\s\S]*))?$/iu.exec(text.trim());
  if (!match) return undefined;
  const rest = (match[1] ?? '').trim();
  if (/[\n\r]/u.test(rest) || rest.length > 200) return undefined;
  return rest ? { role: rest } : {};
}

export interface PermissionCommand {
  action: 'grant' | 'revoke';
  capability?: string;
}

export function parsePermissionCommand(text: string): PermissionCommand | undefined {
  const match = /^[/／](grant|revoke|授予|收回)(?:\s+([\s\S]*))?$/iu.exec(text.trim());
  if (!match) return undefined;
  const rest = (match[2] ?? '').trim();
  if (/[\n\r]/u.test(rest) || rest.length > 80) return undefined;
  const action = /^(?:grant|授予)$/iu.test(match[1]!) ? 'grant' : 'revoke';
  return rest ? { action, capability: rest } : { action };
}

export interface GroupCommand {
  action?: 'add' | 'remove';
  group?: string;
}

export function parseGroupCommand(text: string): GroupCommand | undefined {
  const match = /^[/／](?:group|权限组)(?:\s+([\s\S]*))?$/iu.exec(text.trim());
  if (!match) return undefined;
  const rest = (match[1] ?? '').trim();
  if (/[\n\r]/u.test(rest) || rest.length > 120) return undefined;
  if (!rest) return {};
  const action = /^(add|remove|加入|移出)(?:\s+([\s\S]*))?$/iu.exec(rest);
  if (!action) return undefined;
  const group = (action[2] ?? '').trim();
  return {
    action: /^(?:add|加入)$/iu.test(action[1]!) ? 'add' : 'remove',
    ...(group ? { group } : {}),
  };
}

export function parseBlockCommand(text: string): { action: 'block' | 'unblock' } | undefined {
  const match = /^[/／](block|unblock|屏蔽|取消屏蔽)\s*$/iu.exec(text.trim());
  if (!match) return undefined;
  return { action: /^(?:block|屏蔽)$/iu.test(match[1]!) ? 'block' : 'unblock' };
}

type ManagedCapability = Exclude<PairingCapability, 'answer'>;
const managed = (cap: PairingCapability): cap is ManagedCapability => cap !== 'answer';

const CAPABILITIES: Record<string, ManagedCapability> = {
  approve: 'approve',
  批准: 'approve',
  reject: 'reject',
  拒绝: 'reject',
  'review-pairing': 'review-pairing',
  审核配对: 'review-pairing',
  'save-rules': 'save-rules',
  保存规则: 'save-rules',
};

export function capabilityNamed(name: string): ManagedCapability | undefined {
  return CAPABILITIES[name.trim().toLowerCase()];
}

const NOTICE = {
  unauthorized:
    'Only people allowed to review pairing for this Bot can change Roles. / 只有此 Bot 的配对审核人可以修改角色。',
  unauthorizedPermission:
    'Only people allowed to review pairing for this Bot can change permissions. / 只有此 Bot 的配对审核人可以修改权限。',
  oneMention:
    'Mention exactly one person, for example "/role @name Colleague". / 请只提及一个人，例如「/角色 @某人 Colleague」。',
  notPaired: (name: string) =>
    `${name} is not paired with this Bot. / ${name} 还没有和此 Bot 配对。`,
  self: 'You cannot change your own Role here. / 不能在这里修改自己的角色。',
  noRole:
    'You cannot assign any Role. Use Web settings. / 你没有可分配的角色，请在 Web 设置中处理。',
  roles: (roles: string[]) =>
    [
      `Roles you can assign / 可分配的角色: ${roles.join(', ')}`,
      'Change a paired person\'s Role with "/role @name <role>". / 用「/角色 @某人 <角色>」修改已配对成员的角色。',
    ].join('\n\n'),
  person: (name: string, role: string, capabilities: string[]) =>
    `${name}: Role ${role}; can ${capabilities.join(', ') || 'nothing extra'}. / ${name}：角色 ${role}，权限：${capabilities.join('、') || '无'}。`,
  unknownRole: (name: string, roles: string[]) =>
    `Role "${name}" was not found. Roles you can assign: ${roles.join(', ') || 'none'}. / 没有找到角色「${name}」。可分配的角色：${roles.join('、') || '无'}。`,
  unknownRolePublic: (name: string) =>
    `Role "${name}" was not found. The Roles you can assign were sent to you privately. / 没有找到角色「${name}」。可分配的角色已私信发给你。`,
  deniedRole: (name: string) =>
    `You cannot assign the Role "${name}". / 你不能分配角色「${name}」。`,
  deniedPerson: (name: string) =>
    `You cannot change the Role of ${name}. / 你不能修改 ${name} 的角色。`,
  changed: (name: string, role: string) =>
    `${name} now has the Role ${role}. / ${name} 的角色已改为 ${role}。`,
  changedPublic: (name: string) => `Updated the Role of ${name}. / 已更新 ${name} 的角色。`,
  unchanged: (name: string) => `${name} already has that Role. / ${name} 已经是这个角色。`,
  sentPrivately: 'Sent to you privately. / 已私信发给你。',
  inWeb:
    'Open a DM with this Bot or use Web settings to see this. / 请在与此 Bot 的私聊或 Web 设置中查看。',
  failed:
    'The Role could not be changed here. Use Web settings. / 无法在此修改角色，请在 Web 设置中处理。',
  onePermission:
    'Mention exactly one person and one permission, for example "/grant @name approve". / 请只提及一个人和一项权限，例如「/授予 @某人 批准」。',
  unknownCapability: (name: string) =>
    `Permission "${name}" was not found. Use approve, reject, review-pairing or save-rules. / 没有找到权限「${name}」。可用：批准、拒绝、审核配对、保存规则。`,
  deniedCapability: (name: string) =>
    `You cannot grant or revoke "${name}". / 你不能授予或收回「${name}」。`,
  selfPermission: 'You cannot change your own permissions here. / 不能在这里修改自己的权限。',
  granted: (name: string, cap: string) =>
    `${name} can now ${cap}. / ${name} 现在拥有「${cap}」权限。`,
  revoked: (name: string, cap: string) =>
    `${name} can no longer ${cap}. / ${name} 已不再拥有「${cap}」权限。`,
  alreadyGranted: (name: string, cap: string) =>
    `${name} can already ${cap}. / ${name} 已经拥有「${cap}」权限。`,
  alreadyRevoked: (name: string, cap: string) =>
    `${name} already cannot ${cap}. / ${name} 本来就没有「${cap}」权限。`,
  groupDenies: (name: string, cap: string) =>
    `A permission group still denies ${cap} to ${name}. Change the group in Web settings. / 有授权组仍拒绝 ${name} 的「${cap}」权限，请在 Web 设置中修改该组。`,
  unauthorizedGroup:
    'Only people allowed to review pairing for this Bot can change permission groups. / 只有此 Bot 的配对审核人可以修改权限组。',
  oneGroup:
    'Mention exactly one person and one permission group, for example "/group add @name Reviewers". / 请只提及一个人和一个权限组，例如「/权限组 加入 @某人 Reviewers」。',
  noGroup:
    'You cannot change any permission group. Use Web settings. / 你没有可修改的权限组，请在 Web 设置中处理。',
  groups: (groups: string[]) =>
    [
      `Permission groups you can change / 可修改的权限组: ${groups.join(', ')}`,
      'Add or remove a paired person with "/group add @name <group>" or "/group remove @name <group>". / 用「/权限组 加入 @某人 <权限组>」或「/权限组 移出 @某人 <权限组>」修改成员。',
    ].join('\n\n'),
  unknownGroup: (name: string, groups: string[]) =>
    `Permission group "${name}" was not found. Groups you can change: ${groups.join(', ') || 'none'}. / 没有找到权限组「${name}」。可修改的权限组：${groups.join('、') || '无'}。`,
  unknownGroupPublic: (name: string) =>
    `Permission group "${name}" was not found. The groups you can change were sent to you privately. / 没有找到权限组「${name}」。可修改的权限组已私信发给你。`,
  deniedGroup: (name: string) =>
    `You cannot change the permission group "${name}". / 你不能修改权限组「${name}」。`,
  selfGroup:
    'You cannot change your own permission groups here. / 不能在这里修改自己所在的权限组。',
  added: (person: string, group: string) =>
    `${person} is now in ${group}. / ${person} 已加入权限组「${group}」。`,
  removed: (person: string, group: string) =>
    `${person} is no longer in ${group}. / ${person} 已移出权限组「${group}」。`,
  alreadyIn: (person: string, group: string) =>
    `${person} is already in ${group}. / ${person} 已经在权限组「${group}」中。`,
  alreadyOut: (person: string, group: string) =>
    `${person} is not in ${group}. / ${person} 本来就不在权限组「${group}」中。`,
  unauthorizedBlock:
    'Only people allowed to review pairing for this Bot can block senders. / 只有此 Bot 的配对审核人可以屏蔽发送者。',
  oneBlock:
    'Mention exactly one person, for example "/block @name". / 请只提及一个人，例如「/屏蔽 @某人」。',
  selfBlock: 'You cannot block yourself. / 不能屏蔽自己。',
  deniedBlock: (name: string) =>
    `You cannot block or unblock ${name}. / 你不能屏蔽或取消屏蔽 ${name}。`,
  blocked: (name: string) =>
    `Blocked ${name}. This Bot no longer receives their messages. / 已屏蔽 ${name}，此 Bot 不再接收其消息。`,
  unblocked: (name: string) => `Unblocked ${name}. / 已取消屏蔽 ${name}。`,
  alreadyBlocked: (name: string) => `${name} is already blocked. / ${name} 已经被屏蔽。`,
  notBlocked: (name: string) => `${name} is not blocked. / ${name} 没有被屏蔽。`,
  blockFailed:
    'The block could not be changed here. Use Web settings. / 无法在此修改屏蔽，请在 Web 设置中处理。',
  groupFailed:
    'The permission group could not be changed here. Use Web settings. / 无法在此修改权限组，请在 Web 设置中处理。',
  permissionFailed:
    'The permission could not be changed here. Use Web settings. / 无法在此修改权限，请在 Web 设置中处理。',
};

export function createRoleText(options: {
  database: OperationalDatabaseModulePort;
  pairing: BotPairing;
  provider(id: string): MessagingProvider;
  isBotActive(slug: string): boolean;
  changed(botSlug: string): void;
  warn?(message: string): void;
}) {
  const { database, pairing } = options;
  const deliveries = controlDeliveries();
  const log = (phase: string, outcome: string) =>
    options.warn?.(JSON.stringify({ event: 'role-text', initiator: 'messaging', phase, outcome }));

  const scope = (botSlug: string, bindingId: string, actorId: string) =>
    database.read((db) => {
      const permissions = effectivePairingPermissions(db, botSlug, bindingId, actorId);
      const delegable = permissions.delegableCapabilities ?? [];
      const within = (role: ExternalUserRole) =>
        [...role.capabilities, ...(role.delegableCapabilities ?? [])].every((cap) =>
          delegable.includes(cap),
        );
      const all = externalUserRoles(db, botSlug);
      const groupWithin = (group: ExternalPermissionGroup) =>
        !group.behaviorAllow?.length &&
        !group.behaviorDeny?.length &&
        [
          ...group.allow,
          ...group.deny,
          ...(group.delegateAllow ?? []),
          ...(group.delegateDeny ?? []),
        ].every((cap) => delegable.includes(cap));
      const groups = externalPermissionGroups(db, botSlug).filter(
        (group) => group.bindingId === bindingId && group.available !== false,
      );
      return {
        reviewer: permissions.capabilities.includes('review-pairing'),
        delegable,
        roles: all.filter(within),
        all,
        within,
        groups,
        groupWithin,
      };
    });

  const text = async (
    providerId: string,
    event: MessagingInboundEvent,
    signal: AbortSignal,
  ): Promise<boolean> => {
    if (
      !isMessagingPlatform(event.channel) ||
      !platformPeople(event.channel)?.roles ||
      event.actor.kind !== 'user' ||
      event.attachments?.length ||
      (event.conversation.kind !== 'dm' && !event.mentionedAccount)
    )
      return false;
    const body = event.text.trim();
    const lead = event.mentionedAccount
      ? event.mentions
          .filter((mention) => mention.key.length > 0 && body.startsWith(mention.key))
          .sort((a, b) => b.key.length - a.key.length)[0]
      : undefined;
    let rest = lead ? body.slice(lead.key.length) : body;
    const targets: MessagingInboundEvent['mentions'] = [];
    for (const mention of [...event.mentions].sort((a, b) => b.key.length - a.key.length)) {
      if (mention === lead || !mention.key || !rest.includes(mention.key)) continue;
      targets.push(mention);
      rest = rest.replaceAll(mention.key, ' ');
    }
    const normalized = rest.replace(/\s+/gu, ' ');
    const command = parseRoleCommand(normalized);
    const permission = command ? undefined : parsePermissionCommand(normalized);
    const groupCommand = command || permission ? undefined : parseGroupCommand(normalized);
    const blockCommand =
      command || permission || groupCommand ? undefined : parseBlockCommand(normalized);
    if (!command && !permission && !groupCommand && !blockCommand) return false;
    const binding = controlBinding(database, providerId, event);
    if (!binding?.enabled || !options.isBotActive(binding.botSlug)) return false;
    if (!deliveries.claim(event)) return true;
    const dm = event.conversation.kind === 'dm';
    const reply = (message: string) =>
      setImmediate(() => {
        if (signal.aborted) return;
        void controlReply({
          database,
          provider: options.provider(providerId),
          binding,
          route: event.reply,
          text: message,
          standalone: dm,
          signal,
          isBotActive: options.isBotActive,
        }).catch(() => log('reply', 'unconfirmed'));
      });
    const privately = (message: string, publicNotice = NOTICE.sentPrivately) => {
      if (dm) {
        reply(message);
        return;
      }
      setImmediate(() => {
        if (signal.aborted) return;
        void sendPrivately(providerId, binding, event.actor.id, message).then((sent) =>
          reply(sent ? publicNotice : NOTICE.inWeb),
        );
      });
    };
    const reviewer = scope(binding.botSlug, binding.id, event.actor.id);
    if (!reviewer.reviewer) {
      reply(
        permission
          ? NOTICE.unauthorizedPermission
          : groupCommand
            ? NOTICE.unauthorizedGroup
            : blockCommand
              ? NOTICE.unauthorizedBlock
              : NOTICE.unauthorized,
      );
      log('command', 'unauthorized');
      return true;
    }
    const distinctTargets = [...new Set(targets.map((mention) => mention.id))];
    if (permission) {
      if (distinctTargets.length !== 1 || !permission.capability) {
        reply(NOTICE.onePermission);
        return true;
      }
      const capability = capabilityNamed(permission.capability);
      if (!capability) {
        reply(NOTICE.unknownCapability(permission.capability));
        return true;
      }
      const mention = targets[0]!;
      const label = mention.name ? `@${mention.name}` : `@${mention.id}`;
      const person = pairedPerson(binding, mention.id);
      if (!person) {
        reply(NOTICE.notPaired(label));
        return true;
      }
      if (person.actorId === event.actor.id) {
        reply(NOTICE.selfPermission);
        return true;
      }
      if (!reviewer.delegable.includes(capability)) {
        reply(NOTICE.deniedCapability(capability));
        log('permission', 'delegation-denied');
        return true;
      }
      if (signal.aborted) return true;
      try {
        const outcome = changePermission(binding, person, capability, permission.action, {
          bindingId: binding.id,
          actorId: event.actor.id,
        });
        log('permission', outcome);
        reply(
          outcome === 'denied-by-group'
            ? NOTICE.groupDenies(label, capability)
            : outcome === 'unchanged'
              ? permission.action === 'grant'
                ? NOTICE.alreadyGranted(label, capability)
                : NOTICE.alreadyRevoked(label, capability)
              : permission.action === 'grant'
                ? NOTICE.granted(label, capability)
                : NOTICE.revoked(label, capability),
        );
      } catch (error) {
        const code = errorCode(error);
        log('permission', code);
        reply(
          code === 'pairing-unauthorized'
            ? NOTICE.unauthorizedPermission
            : code === 'pairing-delegation-denied'
              ? NOTICE.deniedCapability(capability)
              : NOTICE.permissionFailed,
        );
      }
      return true;
    }
    if (blockCommand) {
      if (distinctTargets.length !== 1) {
        reply(NOTICE.oneBlock);
        return true;
      }
      const mention = targets[0]!;
      const label = mention.name ? `@${mention.name}` : `@${mention.id}`;
      if (mention.id === event.actor.id) {
        reply(NOTICE.selfBlock);
        return true;
      }
      if (signal.aborted) return true;
      try {
        const outcome = changeBlock(binding, mention, blockCommand.action, {
          bindingId: binding.id,
          actorId: event.actor.id,
        });
        log('block', outcome);
        reply(
          outcome === 'unchanged'
            ? blockCommand.action === 'block'
              ? NOTICE.alreadyBlocked(label)
              : NOTICE.notBlocked(label)
            : blockCommand.action === 'block'
              ? NOTICE.blocked(label)
              : NOTICE.unblocked(label),
        );
      } catch (error) {
        const code = errorCode(error);
        log('block', code);
        reply(
          code === 'pairing-unauthorized'
            ? NOTICE.unauthorizedBlock
            : code === 'pairing-delegation-denied' || code === 'sender-block-owner'
              ? NOTICE.deniedBlock(label)
              : NOTICE.blockFailed,
        );
      }
      return true;
    }
    if (groupCommand) {
      const manageable = reviewer.groups.filter(reviewer.groupWithin).map((group) => group.name);
      if (!groupCommand.action) {
        if (targets.length) reply(NOTICE.oneGroup);
        else if (manageable.length) privately(NOTICE.groups(manageable));
        else reply(NOTICE.noGroup);
        return true;
      }
      if (distinctTargets.length !== 1 || !groupCommand.group) {
        reply(NOTICE.oneGroup);
        return true;
      }
      const mention = targets[0]!;
      const label = mention.name ? `@${mention.name}` : `@${mention.id}`;
      const person = pairedPerson(binding, mention.id);
      if (!person) {
        reply(NOTICE.notPaired(label));
        return true;
      }
      if (person.actorId === event.actor.id) {
        reply(NOTICE.selfGroup);
        return true;
      }
      const wanted = groupCommand.group.toLowerCase();
      const group = reviewer.groups.find((item) => item.name.trim().toLowerCase() === wanted);
      if (!group) {
        if (manageable.length)
          privately(
            NOTICE.unknownGroup(groupCommand.group, manageable),
            NOTICE.unknownGroupPublic(groupCommand.group),
          );
        else reply(NOTICE.noGroup);
        return true;
      }
      if (!reviewer.groupWithin(group)) {
        reply(NOTICE.deniedGroup(group.name));
        log('group', 'delegation-denied');
        return true;
      }
      const member = group.memberIds.includes(person.id);
      if (member === (groupCommand.action === 'add')) {
        reply(
          groupCommand.action === 'add'
            ? NOTICE.alreadyIn(label, group.name)
            : NOTICE.alreadyOut(label, group.name),
        );
        return true;
      }
      if (signal.aborted) return true;
      try {
        changeMembership(binding.botSlug, group, person, groupCommand.action, {
          bindingId: binding.id,
          actorId: event.actor.id,
        });
        log('group', 'accepted');
        reply(
          groupCommand.action === 'add'
            ? NOTICE.added(label, group.name)
            : NOTICE.removed(label, group.name),
        );
      } catch (error) {
        const code = errorCode(error);
        log('group', code);
        reply(
          code === 'pairing-unauthorized'
            ? NOTICE.unauthorizedGroup
            : code === 'pairing-delegation-denied'
              ? NOTICE.deniedGroup(group.name)
              : NOTICE.groupFailed,
        );
      }
      return true;
    }
    if (!command) return true;
    const names = reviewer.roles.map((role) => role.name);
    if (targets.length === 0) {
      if (command.role) reply(NOTICE.oneMention);
      else if (names.length) privately(NOTICE.roles(names));
      else reply(NOTICE.noRole);
      return true;
    }
    if (distinctTargets.length !== 1) {
      reply(NOTICE.oneMention);
      return true;
    }
    const mention = targets[0]!;
    const label = mention.name ? `@${mention.name}` : `@${mention.id}`;
    const person = pairedPerson(binding, mention.id);
    if (!person) {
      reply(NOTICE.notPaired(label));
      return true;
    }
    const current = reviewer.all.find((role) => role.id === person.roleId);
    if (!command.role) {
      const permissions = database.read((db) =>
        effectivePairingPermissions(db, binding.botSlug, binding.id, person.actorId),
      );
      privately(NOTICE.person(label, current?.name ?? '-', permissions.capabilities));
      return true;
    }
    if (person.actorId === event.actor.id) {
      reply(NOTICE.self);
      return true;
    }
    const wanted = command.role.toLowerCase();
    const role = reviewer.all.find((item) => item.name.trim().toLowerCase() === wanted);
    if (!role) {
      if (names.length)
        privately(NOTICE.unknownRole(command.role, names), NOTICE.unknownRolePublic(command.role));
      else reply(NOTICE.noRole);
      return true;
    }
    if (!reviewer.within(role)) {
      reply(NOTICE.deniedRole(role.name));
      return true;
    }
    if (current && !reviewer.within(current)) {
      reply(NOTICE.deniedPerson(label));
      return true;
    }
    if (current?.id === role.id) {
      reply(NOTICE.unchanged(label));
      return true;
    }
    if (signal.aborted) return true;
    try {
      reassign(binding.botSlug, person, role, { bindingId: binding.id, actorId: event.actor.id });
      log('reassign', 'accepted');
      reply(dm ? NOTICE.changed(label, role.name) : NOTICE.changedPublic(label));
    } catch (error) {
      const code = errorCode(error);
      log('reassign', code);
      reply(
        code === 'pairing-unauthorized'
          ? NOTICE.unauthorized
          : code === 'pairing-delegation-denied'
            ? NOTICE.deniedRole(role.name)
            : NOTICE.failed,
      );
    }
    return true;
  };

  const pairedPerson = (binding: MessagingIdentity, actorId: string) =>
    pairing
      .list(binding.botSlug)
      .find(
        (item) =>
          item.purpose === 'conversation' &&
          item.status === 'approved' &&
          item.bindingId === binding.id &&
          item.actorId === actorId,
      );

  const changePermission = (
    binding: MessagingIdentity,
    person: PairingRequest,
    capability: ManagedCapability,
    action: 'grant' | 'revoke',
    reviewer: { bindingId: string; actorId: string },
  ): 'changed' | 'unchanged' | 'denied-by-group' => {
    const outcome = database.transaction(
      (db) => {
        const effective = () =>
          effectivePairingPermissions(db, binding.botSlug, binding.id, person.actorId);
        const before = effective();
        const others = before.permissionSources.filter((source) => source.kind !== 'person');
        const otherAllows = others.some((source) => source.allow.includes(capability));
        const otherDenies = others.some((source) => source.deny.includes(capability));
        if (action === 'grant' && otherDenies) return 'denied-by-group' as const;
        const exceptions = person.permissionExceptions;
        const currentAllow = (exceptions?.allow ?? []).filter(managed);
        const currentDeny = (exceptions?.deny ?? []).filter(managed);
        const allow = currentAllow.filter((cap) => cap !== capability);
        const deny = currentDeny.filter((cap) => cap !== capability);
        if (action === 'grant' && !otherAllows) allow.push(capability);
        if (action === 'revoke' && otherAllows) deny.push(capability);
        const same = (a: readonly string[], b: readonly string[]) =>
          a.length === b.length && a.every((cap) => b.includes(cap));
        if (same(allow, currentAllow) && same(deny, currentDeny)) return 'unchanged' as const;
        changeSenderAccess(
          db,
          binding.botSlug,
          {
            kind: 'person-permissions',
            id: person.id,
            expectedRevision: person.revision,
            allow,
            deny,
          },
          reviewer,
        );
        return 'changed' as const;
      },
      ['pairing', 'bot-inbox'],
    );
    if (outcome === 'changed') options.changed(binding.botSlug);
    return outcome;
  };

  const changeBlock = (
    binding: MessagingIdentity,
    mention: MessagingInboundEvent['mentions'][number],
    action: 'block' | 'unblock',
    reviewer: { bindingId: string; actorId: string },
  ): 'changed' | 'unchanged' => {
    const outcome = database.transaction(
      (db) => {
        const before = !!readSenderBlock(db, binding.botSlug, binding.fingerprint, mention.id);
        changeSenderAccess(
          db,
          binding.botSlug,
          action === 'block'
            ? {
                kind: 'block-sender',
                bindingId: binding.id,
                actorId: mention.id,
                ...(mention.name ? { actorName: mention.name.slice(0, 200) } : {}),
              }
            : { kind: 'unblock-sender', bindingId: binding.id, actorId: mention.id },
          reviewer,
        );
        return before === (action === 'block') ? ('unchanged' as const) : ('changed' as const);
      },
      ['pairing', 'bot-inbox'],
    );
    if (outcome === 'changed') options.changed(binding.botSlug);
    return outcome;
  };

  const changeMembership = (
    botSlug: string,
    group: ExternalPermissionGroup,
    person: PairingRequest,
    action: 'add' | 'remove',
    reviewer: { bindingId: string; actorId: string },
  ) => {
    database.transaction(
      (db) =>
        changeSenderAccess(
          db,
          botSlug,
          {
            kind: 'edit-group',
            id: group.id,
            expectedRevision: group.revision,
            name: group.name,
            allow: group.allow.filter(managed),
            deny: group.deny.filter(managed),
            memberIds:
              action === 'add'
                ? [...group.memberIds, person.id]
                : group.memberIds.filter((id) => id !== person.id),
          },
          reviewer,
        ),
      ['pairing', 'bot-inbox'],
    );
    options.changed(botSlug);
  };

  const reassign = (
    botSlug: string,
    person: PairingRequest,
    role: ExternalUserRole,
    reviewer: { bindingId: string; actorId: string },
  ) => {
    database.transaction(
      (db) =>
        changeSenderAccess(
          db,
          botSlug,
          {
            kind: 'reassign-role',
            id: person.id,
            expectedRevision: person.revision,
            roleId: role.id,
            expectedRoleRevision: role.revision,
          },
          reviewer,
        ),
      ['pairing', 'bot-inbox'],
    );
    options.changed(botSlug);
  };

  const sendPrivately = async (
    providerId: string,
    binding: MessagingIdentity,
    actorId: string,
    message: string,
  ) => {
    const route = privateRoute(pairing, binding, actorId);
    if (!route) return false;
    try {
      const sent = await controlReply({
        database,
        provider: options.provider(providerId),
        binding,
        route,
        text: message,
        standalone: true,
        isBotActive: options.isBotActive,
      });
      log('private', sent?.receipt ? 'accepted' : 'unconfirmed');
      return !!sent;
    } catch {
      log('private', 'unconfirmed');
      return false;
    }
  };

  return { text };
}
