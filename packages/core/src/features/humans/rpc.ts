import { unwrap } from '../../bridge/rpc-result.js';
import type { HumansBridgeMethods } from './methods.js';

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
