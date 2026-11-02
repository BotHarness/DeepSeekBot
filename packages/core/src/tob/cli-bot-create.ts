import { createHash } from 'node:crypto';
import type { BridgeMethods } from '../bridge/methods.js';
import {
  BotCreationError,
  validBotCreationKey,
  type BotCreationInput,
  type BotCreationService,
} from '../bots/creation.js';
import { isPersonaBotAvatar } from '../bots/persona-bot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import { tobBotProfileView } from './cli-bot-profile-operations.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../marketplace/descriptor.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_BOT_CREATE_CAPABILITIES: readonly TobCliCapability[] = [
  {
    command: 'create',
    description:
      'Create one Bot with personality and initial Memory; retry the same operation key and payload to recover its identity and DM',
    write: true,
  },
];

export function createTobBotCreationOperations(deps: {
  creations: BotCreationService;
  bridge: Pick<BridgeMethods, 'create'>;
  registry: Pick<PersonaBotRegistry, 'get'>;
}): PrepareTobOperation {
  return (command, args) => {
    if (command !== 'create') return undefined;
    const allowed = [
      'operationKey',
      'displayName',
      'description',
      'roles',
      'avatar',
      'persona',
      'coreMemory',
    ];
    if (Object.keys(args).some((key) => !allowed.includes(key)))
      throw new TobError('invalid-input');
    const operationKey = args.operationKey;
    if (typeof operationKey !== 'string' || !validBotCreationKey(operationKey))
      throw new TobError('invalid-operation-key');
    const displayName = args.displayName;
    if (
      typeof displayName !== 'string' ||
      !displayName.trim() ||
      displayName.length > 512 ||
      [...displayName].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
    )
      throw new TobError('invalid-input');
    for (const key of ['description', 'persona', 'coreMemory']) {
      const value = args[key];
      if (
        value !== undefined &&
        (typeof value !== 'string' || Buffer.byteLength(value) > 64 * 1024)
      )
        throw new TobError('invalid-input');
    }
    if (
      typeof args.description === 'string' &&
      [...args.description.trim()].length > MAX_DESCRIPTOR_BIO_LENGTH
    )
      throw new TobError('invalid-input');
    if (
      args.roles !== undefined &&
      (!Array.isArray(args.roles) ||
        args.roles.length > MAX_DESCRIPTOR_TAGS ||
        !args.roles.every(
          (role) =>
            typeof role === 'string' && [...role.trim()].length <= MAX_DESCRIPTOR_TAG_LENGTH,
        ))
    )
      throw new TobError('invalid-input');
    if (
      args.avatar !== undefined &&
      (typeof args.avatar !== 'string' || !isPersonaBotAvatar(args.avatar))
    )
      throw new TobError('invalid-input');
    const { operationKey: _key, ...fields } = structuredClone(args);
    const input = fields as unknown as BotCreationInput;
    const lookup = () => {
      try {
        return deps.creations.lookup(operationKey, input);
      } catch (error) {
        if (error instanceof BotCreationError) throw new TobError(error.code);
        throw error;
      }
    };
    const view = (slug: string) => {
      const record = deps.registry.get(slug);
      if (!record) throw new TobError('creation-identity-unavailable');
      return { bot: tobBotProfileView(record), profileFingerprint: botProfileFingerprint(record) };
    };
    const previous = lookup();
    if (previous?.status === 'created')
      return {
        run(guard) {
          guard();
          const receipt = lookup();
          if (receipt?.status !== 'created') throw new TobError('creation-identity-unavailable');
          return { ...view(receipt.botSlug), receipt, channelId: receipt.channelId };
        },
      };
    const patch = {
      ...input,
      ...(typeof input.avatar === 'string'
        ? {
            avatar: {
              sha256: createHash('sha256').update(input.avatar).digest('hex'),
              bytes: Buffer.byteLength(input.avatar),
            },
          }
        : {}),
    };
    return {
      proposal: { command, target: operationKey, previousValue: previous ?? null, patch },
      run(guard, beforeEffect) {
        guard();
        lookup();
        beforeEffect?.();
        const result = deps.bridge.create({ ...input, operationKey });
        if (!result.ok) throw new TobError(result.error.code);
        const receipt = lookup();
        if (receipt?.status !== 'created' || receipt.botSlug !== result.value.bot.slug)
          throw new TobError('creation-outcome-uncertain');
        return { ...view(receipt.botSlug), receipt, channelId: receipt.channelId };
      },
    };
  };
}
