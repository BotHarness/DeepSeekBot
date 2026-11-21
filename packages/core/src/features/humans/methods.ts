import { invalidInput, type BridgeResult } from '../../bridge/method-utils.js';
import { type HumanContext } from '../../humans/context.js';
import { z } from 'zod';
import {
  type LocalHumanIdentity,
  type HumanAvatar,
  HUMAN_AVATAR_BATCH,
  isHumanAvatar,
  type ChannelRecord,
} from '../../channels/channel.js';
import type { ComposerRecoveryIdentity } from '../../bridge/composer-recovery.js';
import type { BridgeMethodsDeps, ChannelListItem } from '../../bridge/methods.js';
import { asObject, unavailable } from '../../bridge/method-utils.js';

export interface HumansBridgeMethods {
  humanIdentity(payload: unknown): BridgeResult<LocalHumanIdentity>;
  composerIdentity(payload: unknown): BridgeResult<ComposerRecoveryIdentity>;
  humanNameSet(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanAvatarSet(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanProfileSetupFinish(payload: unknown): BridgeResult<LocalHumanIdentity>;
  humanAvatars(payload: unknown): BridgeResult<{ avatars: HumanAvatar[] }>;
  channelHumanNameSet(payload: unknown): BridgeResult<{ channel: ChannelListItem }>;
}

export function createHumansBridgeMethods(
  human: HumanContext,
  deps: BridgeMethodsDeps,
  channelView: (channel: ChannelRecord) => ChannelListItem,
): HumansBridgeMethods {
  return {
    humanIdentity() {
      return { ok: true, value: deps.channels.humanIdentity(human) };
    },
    composerIdentity() {
      try {
        if (deps.composerIdentity === undefined) throw new Error();
        const identity = deps.composerIdentity(human);
        return {
          ok: true,
          value: { hostId: identity.hostId, profileId: identity.profileId, humanId: human.humanId },
        };
      } catch {
        return {
          ok: false,
          error: {
            code: 'storage-unavailable',
            message: 'Composer recovery identity unavailable',
          },
        };
      }
    },
    humanNameSet(payload) {
      const input = z
        .object({ displayName: z.string().max(128).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success) return invalidInput('A displayName string or null is required');
      try {
        return {
          ok: true,
          value: deps.channels.setHumanDefaultName(human, input.data.displayName),
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
    humanAvatarSet(payload) {
      const input = z
        .object({ avatar: z.string().max(131_072).nullable() })
        .strict()
        .safeParse(payload);
      if (!input.success || (input.data.avatar !== null && !isHumanAvatar(input.data.avatar)))
        return invalidInput('avatar must be a PNG, JPEG or WebP data URL up to 96 KiB, or null');
      return { ok: true, value: deps.channels.setHumanAvatar(human, input.data.avatar) };
    },
    humanProfileSetupFinish(payload) {
      if (!z.object({}).strict().safeParse(payload).success)
        return invalidInput('humanProfileSetupFinish takes no arguments');
      return { ok: true, value: deps.channels.finishHumanProfileSetup(human) };
    },
    humanAvatars(payload) {
      const input = z
        .object({ humanIds: z.array(z.string().min(1).max(128)).max(HUMAN_AVATAR_BATCH) })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return invalidInput(`humanIds must be up to ${HUMAN_AVATAR_BATCH} Human IDs`);
      return {
        ok: true,
        value: { avatars: deps.channels.humanAvatars(human, input.data.humanIds) },
      };
    },
    channelHumanNameSet(payload) {
      const input = z
        .object({
          channelId: z.string(),
          nickname: z.string().max(128).nullable(),
        })
        .strict()
        .safeParse(payload);
      if (!input.success)
        return invalidInput('A channelId and nickname string or null are required');
      try {
        deps.channels.setHumanNickname(human, input.data.channelId, input.data.nickname);
        return {
          ok: true,
          value: {
            channel: channelView(deps.channels.get(input.data.channelId)!),
          },
        };
      } catch (error) {
        return invalidInput(error instanceof Error ? error.message : String(error));
      }
    },
  };
}

export interface HumansAdapterMethods {
  acknowledgements(payload: unknown): BridgeResult<{ items: Record<string, string> }>;
  acknowledge(payload: unknown): BridgeResult<{ key: string; value: string }>;
}

export function createHumansAdapterMethods(deps: BridgeMethodsDeps): HumansAdapterMethods {
  return {
    acknowledgements() {
      if (deps.acknowledgements === undefined) return unavailable();
      return { ok: true, value: { items: deps.acknowledgements.list() } };
    },
    acknowledge(payload) {
      if (deps.acknowledgements === undefined) return unavailable();
      const source = asObject(payload);
      const recorded = deps.acknowledgements.record(
        String(source['key'] ?? ''),
        source['value'] as string,
      );
      if (recorded === undefined) return invalidInput('Invalid acknowledgement');
      return { ok: true, value: recorded };
    },
  };
}
