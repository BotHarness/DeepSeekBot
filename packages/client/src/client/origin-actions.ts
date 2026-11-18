import type { BridgeActions } from './actions.js';

const origin = new WeakSet<BridgeActions>();

export function markOriginActions(actions: BridgeActions): BridgeActions {
  origin.add(actions);
  return actions;
}

export function isOriginActions(actions: BridgeActions): boolean {
  return origin.has(actions);
}
