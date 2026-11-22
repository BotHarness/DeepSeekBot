import type { Agent } from '@deepseek-ai/dsh-agent';

import type { ChannelAppendOnceResult } from '../channels/store.js';
import type { HumanContext } from '../humans/context.js';
import type { PrivateAccountScope } from './account-bindings.js';
import type { PrivateInputDeclaration, PrivateInputResult } from './contracts.js';
import type { PrivateInputOrigin } from './im-origin.js';

export type Terminal = 'cancelled' | 'expired';
export type Pending = {
  agent: Agent | undefined;
  botSlug: string;
  channelId: string;
  botCreatedAt: string;
  request: PrivateInputDeclaration;
  expectedRevision: string | undefined;
  signal: AbortSignal;
  origin?: PrivateInputOrigin;
  deadline: number;
  committed: boolean;
  commit?: Promise<ChannelAppendOnceResult>;
  terminal?: Terminal;
  decidingHuman?: HumanContext;
  operation?: Promise<boolean> | undefined;
  abort(): void;
  resolve(result: PrivateInputResult): void;
};
export type PrivateUse = {
  scope: PrivateAccountScope;
  controller: AbortController;
  done: Promise<'stopped' | 'completed'>;
  origin?: PrivateInputOrigin;
};
export type PrivateReplyScope = {
  scope: PrivateAccountScope;
  origin: PrivateInputOrigin;
  controller: AbortController;
  ready(): boolean;
  dispose(): void;
};
