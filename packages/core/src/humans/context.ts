import { LOCAL_HUMAN_ID } from '../channels/channel.js';

export type HumanId = string;

export interface HumanContext {
  readonly humanId: HumanId;
}

export function humanContext(humanId: HumanId): HumanContext {
  if (typeof humanId !== 'string' || humanId.trim().length === 0)
    throw new Error('Human ID must be non-empty');
  return Object.freeze({ humanId });
}

export const OWNER_HUMAN_CONTEXT: HumanContext = humanContext(LOCAL_HUMAN_ID);
