import { ENGINE_IDS } from '@botharness/host-protocol/subscription-engine';
import { z } from 'zod';

import type { BridgeMethodsDeps, BridgeResult } from '../bridge/methods.js';
import type { HumanContext } from '../humans/context.js';
import { invalidInput, modelFailure, requireModelSources } from '../models/provider-bridge.js';
import { engineAccountFilter } from '../team/models.js';
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
  | 'submitClaudeCode'
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
  engineAccountSubmitCode(
    payload: unknown,
  ): Promise<BridgeResult<Awaited<ReturnType<Accounts['submitClaudeCode']>>>>;
}

const id = z.string().trim().min(1);
const name = z.string().trim().min(1).max(80);
const expectedRevision = z.number().int().nonnegative();
const list = z.object({ grantable: z.boolean().optional() });
const engine = z.enum(ENGINE_IDS);
const add = z.object({ engine, name, expectedRevision });
const rename = z.object({ id, name, expectedRevision });
const remove = z.object({ id, expectedRevision, confirm: z.literal(true) });
const login = z.object({ id, engine: engine.optional() });
const submitCode = z.object({
  id,
  code: z
    .string()
    .trim()
    .regex(/^[!-~]{1,2048}$/u),
});

export function createEngineAccountBridge(
  human: HumanContext,
  deps: Pick<BridgeMethodsDeps, 'team' | 'engineAccounts'>,
): EngineAccountBridgeMethods {
  async function run<Input, T>(
    schema: z.ZodType<Input>,
    payload: unknown,
    operation: (host: Accounts, input: Input) => T | Promise<T>,
    authorize: (input: Input | undefined) => void = () => requireModelSources(human, deps.team),
  ): Promise<BridgeResult<T>> {
    try {
      const input = schema.safeParse(payload);
      authorize(input.data);
      if (!deps.engineAccounts)
        throw new EngineRefusal('engine-unavailable', 'Subscription Engines are unavailable');
      if (!input.success) return invalidInput('Invalid subscription account request');
      return { ok: true, value: await operation(deps.engineAccounts, input.data) };
    } catch (error) {
      return modelFailure(error);
    }
  }
  return {
    engineAccounts(payload) {
      return run(
        list,
        payload,
        async (host, input) => {
          const snapshot = host.accounts();
          if (input.grantable) {
            const allowed = engineAccountFilter(deps.team, human);
            return {
              accounts: snapshot.accounts.filter(({ id }) => allowed(id)),
              engines: [],
              selections: [],
            };
          }
          return { ...snapshot, engines: await host.status(), selections: [] };
        },
        (input) => {
          if (input?.grantable !== true || human.caller === 'bot')
            requireModelSources(human, deps.team);
        },
      );
    },
    engineAccountAdd(payload) {
      return run(add, payload, (host, input) =>
        host.addAccount(input.engine, input.name, input.expectedRevision),
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
        const account =
          input.engine === undefined
            ? host.target(input.id)
            : host.resolveAccount(input.engine, input.id);
        return host.login(account.engine, account.id);
      });
    },
    engineAccountSubmitCode(payload) {
      return run(submitCode, payload, (host, input) => host.submitClaudeCode(input.id, input.code));
    },
  };
}

export type EngineAccountOperations = Accounts;
