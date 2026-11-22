import type { BridgeRpcReceiver } from '../../bridge/rpc-types.js';
import { unwrap } from '../../bridge/rpc-result.js';
import type { HumansBridgeMethods } from './methods.js';
import type { HumansAdapterMethods } from './methods.js';

export function humanIdentity(methods: HumansBridgeMethods) {
  return unwrap(methods.humanIdentity({}));
}

export function composerIdentity(methods: HumansBridgeMethods) {
  return unwrap(methods.composerIdentity({}));
}

export function channelHumanNameSet(
  methods: HumansBridgeMethods,
  channelId: string,
  nickname: string | null,
) {
  return unwrap(methods.channelHumanNameSet({ channelId, nickname }));
}

export function humanNameSet(methods: HumansBridgeMethods, displayName: string | null) {
  return unwrap(methods.humanNameSet({ displayName }));
}

export function humanAvatarSet(methods: HumansBridgeMethods, avatar: string | null) {
  return unwrap(methods.humanAvatarSet({ avatar }));
}

export function humanAvatars(methods: HumansBridgeMethods, humanIds: string[]) {
  return unwrap(methods.humanAvatars({ humanIds }));
}

export function humanProfileSetupFinish(methods: HumansBridgeMethods) {
  return unwrap(methods.humanProfileSetupFinish({}));
}

export function acknowledgements(methods: HumansAdapterMethods): { items: Record<string, string> } {
  return unwrap(methods.acknowledgements({}));
}

export function acknowledge(
  methods: HumansAdapterMethods,
  key: string,
  value?: string,
): { key: string; value: string } {
  return unwrap(methods.acknowledge(value === undefined ? { key } : { key, value }));
}

export const acknowledgementRpc = {
  acknowledgements(): { items: Record<string, string> } {
    return acknowledgements(this.methods);
  },

  acknowledge(key: string, value?: string): { key: string; value: string } {
    return acknowledge(this.methods, key, value);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const humanIdentityRpc = {
  humanIdentity() {
    return humanIdentity(this.methods);
  },

  composerIdentity() {
    return composerIdentity(this.methods);
  },
} satisfies ThisType<BridgeRpcReceiver>;

export const humanDisplayNameRpc = {
  channelHumanNameSet(channelId: string, nickname: string | null) {
    return channelHumanNameSet(this.methods, channelId, nickname);
  },

  humanNameSet(displayName: string | null) {
    return humanNameSet(this.methods, displayName);
  },

  humanAvatarSet(avatar: string | null) {
    return humanAvatarSet(this.methods, avatar);
  },

  humanAvatars(humanIds: string[]) {
    return humanAvatars(this.methods, humanIds);
  },

  humanProfileSetupFinish() {
    return humanProfileSetupFinish(this.methods);
  },
} satisfies ThisType<BridgeRpcReceiver>;
