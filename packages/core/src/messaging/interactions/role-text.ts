import type { OperationalDatabaseModulePort } from '../../database/owner.js';
import type { MessagingIdentity } from '../identity.js';
import type { BotPairing, PairingRequest } from '../pairing.js';
import {
  changeSenderAccess,
  effectivePairingPermissions,
  externalUserRoles,
  platformPeople,
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

const NOTICE = {
  unauthorized:
    'Only people allowed to review pairing for this Bot can change Roles. / 只有此 Bot 的配对审核人可以修改角色。',
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
  const firstDelivery = controlDeliveries();
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
      return {
        reviewer: permissions.capabilities.includes('review-pairing'),
        roles: all.filter(within),
        all,
        within,
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
      ? event.mentions.find((mention) => mention.key.length > 0 && body.startsWith(mention.key))
      : undefined;
    let rest = lead ? body.slice(lead.key.length) : body;
    const targets: MessagingInboundEvent['mentions'] = [];
    for (const mention of [...event.mentions].sort((a, b) => b.key.length - a.key.length)) {
      if (mention === lead || !mention.key || !rest.includes(mention.key)) continue;
      targets.push(mention);
      rest = rest.replaceAll(mention.key, ' ');
    }
    const command = parseRoleCommand(rest.replace(/\s+/gu, ' '));
    if (!command) return false;
    const binding = controlBinding(database, providerId, event);
    if (!binding?.enabled || !options.isBotActive(binding.botSlug)) return false;
    if (!firstDelivery(event)) return true;
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
      reply(NOTICE.unauthorized);
      log('command', 'unauthorized');
      return true;
    }
    const names = reviewer.roles.map((role) => role.name);
    if (targets.length === 0) {
      if (command.role) reply(NOTICE.oneMention);
      else if (names.length) privately(NOTICE.roles(names));
      else reply(NOTICE.noRole);
      return true;
    }
    const distinct = [...new Set(targets.map((mention) => mention.id))];
    if (distinct.length !== 1) {
      reply(NOTICE.oneMention);
      return true;
    }
    const mention = targets[0]!;
    const label = mention.name ? `@${mention.name}` : `@${mention.id}`;
    const person = pairing
      .list(binding.botSlug)
      .find(
        (item) =>
          item.purpose === 'conversation' &&
          item.status === 'approved' &&
          item.bindingId === binding.id &&
          item.actorId === mention.id,
      );
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
      const code = error instanceof MessagingError ? error.code : 'failed';
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
