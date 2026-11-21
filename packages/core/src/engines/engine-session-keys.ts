import { engineAccountKey } from '@botharness/host-protocol/subscription-engine';
import type { EngineTurnRequest } from './engine-host-types.js';
import type { EngineChoice, EngineId, EngineWorkspaceMode } from './engine-session.js';

export function choiceKey(engine: EngineId | undefined, choice: EngineChoice): string | undefined {
  return engine === undefined
    ? undefined
    : JSON.stringify([engineAccountKey(engine, choice.accountId), choice.model, choice.effort]);
}

export function sessionAccount(engine: EngineId, accountId: string): { accountId?: string } {
  return engineAccountKey(engine) === accountId ? {} : { accountId };
}

export function workspaceModeFor(request: EngineTurnRequest): EngineWorkspaceMode {
  return (
    request.workspaceMode?.() ?? (request.role === 'assignment' ? 'read-only' : 'workspace-write')
  );
}

export function sessionKey(
  choice: string | undefined,
  cwd: string | undefined,
  mode: EngineWorkspaceMode,
): string {
  return JSON.stringify([choice, cwd, mode]);
}
