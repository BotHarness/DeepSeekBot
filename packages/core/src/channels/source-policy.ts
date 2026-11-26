import type { DatabaseSync } from 'node:sqlite';
import { DEFAULT_GROUP_WAKE_POLICY, type GroupWakePolicy } from './channel.js';

export const BOT_SOURCE_DEFAULTS = {
  'human-dm': { wake: 'immediate', delivery: 'steer' },
  'bot-dm': { wake: 'immediate', delivery: 'steer' },
  'group-mention': { wake: 'immediate', delivery: 'steer' },
  'group-ordinary': {
    wake: 'digest',
    digestCount: DEFAULT_GROUP_WAKE_POLICY.count,
    digestIntervalSeconds: DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
  },
  'group-invite': { wake: 'immediate' },
  'group-join-request': { wake: 'immediate' },
  'group-join-decision': { wake: 'immediate' },
  'assignment-report': { wake: 'conditional' },
  'assignment-lifecycle': { wake: 'immediate' },
} as const;

export type BotSourceClass = keyof typeof BOT_SOURCE_DEFAULTS;
export type BotSourceWake = 'immediate' | 'digest' | 'conditional' | 'mentions' | 'silent';
export type BotSourcePolicyEditor = { kind: 'human' } | { kind: 'bot'; botSlug: string };
export type BotSourcePolicyActor =
  | { kind: 'built-in' }
  | { kind: 'template' }
  | BotSourcePolicyEditor;

export interface BotSourcePolicy {
  sourceClass: BotSourceClass;
  admission: 'admit';
  wake: BotSourceWake;
  delivery: 'steer' | 'turn';
  digestCount?: number;
  digestIntervalSeconds?: number;
  revision: number;
  lastActor: BotSourcePolicyActor;
  changedAt: string;
  overrideActive: boolean;
  recentWakeCount: number;
}

export type ChannelSourceRule = Pick<
  BotSourcePolicy,
  'sourceClass' | 'revision' | 'wake' | 'digestCount' | 'digestIntervalSeconds'
>;

export interface ChannelSourcePolicy {
  resolveIn(db: DatabaseSync, botSlug: string, sourceClass: BotSourceClass): ChannelSourceRule;
  readGroupOrdinary(botSlug: string): ChannelSourceRule;
}

export function defaultGroupWakePolicy(policy: ChannelSourceRule): GroupWakePolicy {
  if (
    policy.sourceClass !== 'group-ordinary' ||
    (policy.wake !== 'immediate' &&
      policy.wake !== 'digest' &&
      policy.wake !== 'mentions' &&
      policy.wake !== 'silent') ||
    (policy.wake === 'digest' &&
      (policy.digestCount === undefined || policy.digestIntervalSeconds === undefined))
  )
    throw new Error('Group ordinary source default is invalid');
  return {
    mode: policy.wake === 'immediate' ? 'all' : policy.wake,
    count: policy.digestCount ?? DEFAULT_GROUP_WAKE_POLICY.count,
    intervalSeconds: policy.digestIntervalSeconds ?? DEFAULT_GROUP_WAKE_POLICY.intervalSeconds,
    revision: 0,
  };
}
