import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import type { BridgeMethods, BridgeResult } from '../bridge/methods.js';
import { canonicalRecipe, isAvatarRecipe } from '../bots/avatar-appearance.js';
import { isBotBanner } from '../bots/bot-banner.js';
import { isPersonaBotAvatar, type PersonaBotRecord } from '../bots/persona-bot.js';
import { isBotPrimaryColor } from '../bots/primary-color.js';
import { botProfileFingerprint } from '../bots/profile-snapshot.js';
import type { PersonaBotRegistry } from '../bots/registry.js';
import type { PersonaBotDeletion, PersonaBotDeletionPreview } from '../bots/deletion.js';
import { dmChannelId } from '../channels/channel.js';
import {
  MAX_DESCRIPTOR_BIO_LENGTH,
  MAX_DESCRIPTOR_TAG_LENGTH,
  MAX_DESCRIPTOR_TAGS,
} from '../marketplace/descriptor.js';
import type { PrepareTobOperation, TobCliCapability } from './cli-operations.js';
import { TobError } from './service.js';

export const TOB_BOT_PROFILE_CAPABILITIES: readonly TobCliCapability[] = [
  ['show', 'Read a Bot profile and its current profile fingerprint', false],
  ['update', 'Update a reviewed Bot name, description and tags', true],
  ['pause', 'Archive a reviewed Bot', true],
  ['resume', 'Reactivate a reviewed Bot', true],
  ['bot-avatar-set', 'Set or clear a reviewed Bot avatar', true],
  ['bot-banner-set', 'Set or clear a reviewed Bot banner', true],
  ['bot-appearance-set', 'Set a reviewed Bot appearance recipe', true],
  ['bot-primary-color-set', 'Set a reviewed Bot presentation color', true],
  ['bot-delete-preview', 'Read the existing owner deletion scope and confirmation token', false],
  ['bot-delete-memory-folder', 'Read the existing owner validated Memory folder', false],
  [
    'bot-delete-confirm',
    'Confirm the exact Bot deletion scope and explicit Memory retention choice',
    true,
  ],
  ['bot-delete-retry', 'Retry the already accepted deletion scope after Human review', true],
].map(([command, description, write]) => ({
  command: String(command),
  description: String(description),
  write: Boolean(write),
}));

type ProfileBridge = Pick<
  BridgeMethods,
  | 'update'
  | 'pause'
  | 'resume'
  | 'botAvatarSet'
  | 'botBannerSet'
  | 'botAppearanceSet'
  | 'botPrimaryColorSet'
  | 'deletionPreview'
  | 'deletionMemoryFolder'
  | 'deletionConfirm'
  | 'deletionRetry'
>;

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new TobError('invalid-input');
  return value as Record<string, unknown>;
}
function keys(value: Record<string, unknown>, allowed: string[]) {
  if (Object.keys(value).some((key) => !allowed.includes(key))) throw new TobError('invalid-input');
}
function text(value: unknown, limit = 512): string {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value !== value.trim() ||
    [...value].length > limit ||
    [...value].some((char) => char.charCodeAt(0) < 32)
  )
    throw new TobError('invalid-input');
  return value;
}
function result<T>(value: BridgeResult<T>): T {
  if (!value.ok)
    throw new TobError(
      ['protected-bot', 'unknown-bot', 'stale-setting', 'stale-profile', 'unavailable'].includes(
        value.error.code,
      )
        ? value.error.code
        : 'invalid-input',
    );
  return value.value;
}
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item);
    Object.freeze(value);
  }
  return value;
}
function imageView(value: string) {
  return {
    present: true,
    sha256: createHash('sha256').update(value).digest('hex'),
    bytes: Buffer.byteLength(value),
    type: value.split(';')[0],
  };
}
function deletionView(deletion: PersonaBotDeletion): PersonaBotDeletion {
  return {
    ...deletion,
    ...(deletion.failure === undefined ? {} : { failure: 'cleanup-incomplete' }),
  };
}
function deletionPreviewView(preview: PersonaBotDeletionPreview): PersonaBotDeletionPreview {
  return { ...preview, ...(preview.deletion ? { deletion: deletionView(preview.deletion) } : {}) };
}
export function tobBotProfileView(record: PersonaBotRecord) {
  return {
    slug: record.slug,
    displayName: record.displayName,
    description: record.description ?? '',
    roles: record.roles ?? [],
    paused: record.paused === true,
    ...(record.avatar ? { avatar: imageView(record.avatar) } : {}),
    ...(record.appearance ? { appearance: record.appearance } : {}),
    ...(record.banner
      ? {
          banner:
            'image' in record.banner ? { image: imageView(record.banner.image) } : record.banner,
        }
      : {}),
    ...(record.primaryColor ? { primaryColor: record.primaryColor } : {}),
  };
}

export function createTobBotProfileOperations(deps: {
  registry: Pick<PersonaBotRegistry, 'get'>;
  bridge: () => ProfileBridge;
  isProtectedBot(slug: string): boolean;
}): PrepareTobOperation {
  const current = (slug: string) => {
    const record = deps.registry.get(slug);
    if (!record) throw new TobError('unknown-bot');
    return record;
  };
  const view = (slug: string) => {
    const record = current(slug);
    return { bot: tobBotProfileView(record), profileFingerprint: botProfileFingerprint(record) };
  };
  return (command, raw) => {
    if (!TOB_BOT_PROFILE_CAPABILITIES.some((entry) => entry.command === command)) return undefined;
    const args = structuredClone(object(raw));
    const slug = text(args.slug);
    const bridge = deps.bridge();
    if (command.startsWith('bot-delete-')) {
      if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
      if (command === 'bot-delete-preview' || command === 'bot-delete-memory-folder') {
        keys(args, ['slug']);
        return {
          run(guard) {
            guard();
            if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
            return command === 'bot-delete-preview'
              ? { preview: deletionPreviewView(result(bridge.deletionPreview({ slug })).preview) }
              : result(bridge.deletionMemoryFolder({ slug }));
          },
        };
      }
      keys(
        args,
        command === 'bot-delete-confirm'
          ? ['slug', 'token', 'eraseMemory', 'confirm']
          : ['slug', 'confirm'],
      );
      if (args.confirm !== true) throw new TobError('confirmation-required');
      const previous = result(bridge.deletionPreview({ slug })).preview;
      if (command === 'bot-delete-confirm') {
        text(args.token, 256);
        if (typeof args.eraseMemory !== 'boolean') throw new TobError('invalid-input');
        if (args.token !== previous.token || previous.deletion) throw new TobError('stale-setting');
        if (args.eraseMemory && !previous.eraseAvailable) throw new TobError('invalid-input');
      } else if (!previous.deletion) throw new TobError('invalid-input');
      const patch =
        command === 'bot-delete-confirm'
          ? {
              delete: true,
              eraseMemory: args.eraseMemory,
              memoryDir: previous.memoryDir,
              token: previous.token,
              confirm: true,
            }
          : {
              retry: true,
              eraseMemory: previous.deletion!.eraseMemory,
              memoryDir: previous.deletion!.memoryDir,
              confirm: true,
            };
      return {
        proposal: freeze(
          structuredClone({
            command,
            target: slug,
            previousValue: deletionPreviewView(previous),
            patch,
          }),
        ),
        async run(guard, beforeEffect) {
          guard();
          if (deps.isProtectedBot(slug)) throw new TobError('protected-bot');
          if (!isDeepStrictEqual(result(bridge.deletionPreview({ slug })).preview, previous))
            throw new TobError('stale-setting');
          beforeEffect?.();
          const pending =
            command === 'bot-delete-confirm'
              ? bridge.deletionConfirm({ slug, token: args.token, eraseMemory: args.eraseMemory })
              : bridge.deletionRetry({ slug });
          const saved = result(await pending);
          try {
            guard();
          } catch {
            throw new TobError('operation-outcome-uncertain');
          }
          return { deletion: deletionView(saved.deletion) };
        },
      };
    }
    if (command === 'show') {
      keys(args, ['slug']);
      return {
        run(guard) {
          guard();
          return view(slug);
        },
      };
    }
    const fields: Record<string, string[]> = {
      update: ['patch'],
      pause: [],
      resume: [],
      'bot-avatar-set': ['avatar'],
      'bot-banner-set': ['banner'],
      'bot-appearance-set': ['recipe'],
      'bot-primary-color-set': ['primaryColor'],
    };
    keys(args, ['slug', 'expectedProfile', ...fields[command]!]);
    const expected = text(args.expectedProfile, 64);
    if (!/^[a-f0-9]{64}$/u.test(expected)) throw new TobError('invalid-input');
    const snapshot = structuredClone(current(slug));
    if (botProfileFingerprint(snapshot) !== expected) throw new TobError('stale-profile');
    if (command === 'pause' && deps.isProtectedBot(slug)) throw new TobError('protected-bot');
    let apply: () => BridgeResult<unknown>;
    let patch: unknown;
    switch (command) {
      case 'update': {
        const changes = object(args.patch);
        keys(changes, ['displayName', 'description', 'roles']);
        if (!Object.keys(changes).length) throw new TobError('invalid-input');
        if (changes.displayName !== undefined) text(changes.displayName, 200);
        if (
          changes.description !== undefined &&
          (typeof changes.description !== 'string' ||
            [...changes.description.trim()].length > MAX_DESCRIPTOR_BIO_LENGTH)
        )
          throw new TobError('invalid-input');
        if (
          changes.roles !== undefined &&
          (!Array.isArray(changes.roles) ||
            changes.roles.length > MAX_DESCRIPTOR_TAGS ||
            changes.roles.some(
              (role) =>
                typeof role !== 'string' ||
                !role.trim() ||
                [...role.trim()].length > MAX_DESCRIPTOR_TAG_LENGTH,
            ))
        )
          throw new TobError('invalid-input');
        patch = changes;
        apply = () => bridge.update({ slug, patch: changes });
        break;
      }
      case 'pause':
      case 'resume':
        patch = { paused: command === 'pause' };
        apply = () => bridge[command]({ slug });
        break;
      case 'bot-avatar-set':
        if (args.avatar !== null && !isPersonaBotAvatar(args.avatar))
          throw new TobError('invalid-input');
        patch = { avatar: args.avatar === null ? null : imageView(args.avatar as string) };
        apply = () => bridge.botAvatarSet({ channelId: dmChannelId(slug), avatar: args.avatar });
        break;
      case 'bot-banner-set':
        if (args.banner !== null && !isBotBanner(args.banner)) throw new TobError('invalid-input');
        patch = {
          banner:
            args.banner === null
              ? null
              : 'image' in args.banner
                ? { image: imageView(args.banner.image) }
                : args.banner,
        };
        apply = () => bridge.botBannerSet({ channelId: dmChannelId(slug), banner: args.banner });
        break;
      case 'bot-appearance-set':
        if (!isAvatarRecipe(args.recipe)) throw new TobError('invalid-input');
        args.recipe = canonicalRecipe(args.recipe);
        patch = { recipe: args.recipe };
        apply = () =>
          bridge.botAppearanceSet({ channelId: dmChannelId(slug), recipe: args.recipe });
        break;
      case 'bot-primary-color-set':
        keys(object(args.primaryColor), ['mode', 'color']);
        if (!isBotPrimaryColor(args.primaryColor)) throw new TobError('invalid-input');
        patch = { primaryColor: args.primaryColor };
        apply = () =>
          bridge.botPrimaryColorSet({
            channelId: dmChannelId(slug),
            primaryColor: args.primaryColor,
          });
        break;
      default:
        throw new TobError('unsupported-command');
    }
    return {
      proposal: freeze(
        structuredClone({
          command,
          target: slug,
          previousValue: tobBotProfileView(snapshot),
          patch: { expectedProfile: expected, changes: patch },
        }),
      ),
      run(guard, beforeEffect) {
        guard();
        if (command === 'pause' && deps.isProtectedBot(slug)) throw new TobError('protected-bot');
        if (botProfileFingerprint(current(slug)) !== expected) throw new TobError('stale-profile');
        beforeEffect?.();
        result(apply());
        return view(slug);
      },
    };
  };
}
