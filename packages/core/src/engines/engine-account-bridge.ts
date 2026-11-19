import { z } from 'zod';

import type { BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import type { HumanContext } from '../humans/context.js';
import { invalidInput, modelFailure, requireModelSources } from '../models/provider-bridge.js';
import type { EngineHost } from './engine-host.js';
import { EngineRefusal } from './engine-session.js';

type Accounts = Pick<
  EngineHost,
  | 'accounts'
  | 'status'
  | 'addAccount'
  | 'renameAccount'
  | 'removeAccount'
  | 'target'
  | 'login'
  | 'resolveAccount'
>;
type AccountList = ReturnType<Accounts['accounts']> & {
  engines: Awaited<ReturnType<Accounts['status']>>;
  selections: [];
};

export interface EngineAccountBridgeMethods {
  engineAccounts(payload: unknown): Promise<BridgeResult<AccountList>>;
  engineAccountAdd(payload: unknown): Promise<BridgeResult<ReturnType<Accounts['addAccount']>>>;
  engineAccountRename(
    payload: unknown,
  ): Promise<BridgeResult<ReturnType<Accounts['renameAccount']>>>;
  engineAccountRemove(
    payload: unknown,
  ): Promise<BridgeResult<ReturnType<Accounts['removeAccount']>>>;
  engineAccountLogin(
    payload: unknown,
  ): Promise<BridgeResult<Awaited<ReturnType<Accounts['login']>>>>;
}

const id = z.string().trim().min(1);
const name = z.string().trim().min(1).max(80);
const expectedRevision = z.number().int().nonnegative();
const add = z.object({ engine: z.literal('codex'), name, expectedRevision });
const rename = z.object({ id, name, expectedRevision });
const remove = z.object({ id, expectedRevision, confirm: z.literal(true) });
const login = z.object({ id });

export function createEngineAccountBridge(
  human: HumanContext,
  deps: Pick<BridgeMethodsDeps, 'team' | 'engineAccounts'>,
): EngineAccountBridgeMethods {
  async function run<Input, T>(
    schema: z.ZodType<Input>,
    payload: unknown,
    operation: (host: Accounts, input: Input) => T | Promise<T>,
  ): Promise<BridgeResult<T>> {
    try {
      requireModelSources(human, deps.team);
      if (!deps.engineAccounts)
        throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
      const input = schema.safeParse(payload);
      if (!input.success) return invalidInput('Invalid subscription account request');
      return { ok: true, value: await operation(deps.engineAccounts, input.data) };
    } catch (error) {
      return modelFailure(error);
    }
  }
  return {
    engineAccounts(payload) {
      return run(z.object({}), payload, async (host) => {
        const snapshot = host.accounts();
        return { ...snapshot, engines: await host.status(), selections: [] };
      });
    },
    engineAccountAdd(payload) {
      return run(add, payload, (host, input) =>
        host.addAccount(input.name, input.expectedRevision),
      );
    },
    engineAccountRename(payload) {
      return run(rename, payload, (host, input) =>
        host.renameAccount(input.id, input.name, input.expectedRevision),
      );
    },
    engineAccountRemove(payload) {
      return run(remove, payload, (host, input) =>
        host.removeAccount(input.id, input.expectedRevision),
      );
    },
    engineAccountLogin(payload) {
      return run(login, payload, (host, input) => {
        const account = host.target(input.id);
        return host.login(account.engine, account.id);
      });
    },
  };
}

export type EngineAccountOperations = Accounts;
