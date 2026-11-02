import { sameDirectory } from '../fs/same-directory.js';

export class OrchestratorWorkingDirectoryError extends Error {
  override readonly name = 'OrchestratorWorkingDirectoryError';

  constructor(
    readonly sessionId: string,
    readonly sessionCwd: string,
    readonly memoryCwd: string,
  ) {
    super(
      `Orchestrator Session ${sessionId} runs in ${sessionCwd}, not this PersonaBot's Memory directory ${memoryCwd}; start a new Session to recover`,
    );
  }
}

export function assertOrchestratorWorkingDirectory(
  sessionId: string,
  sessionCwd: string | undefined,
  memoryCwd: string,
): void {
  if (sessionCwd !== undefined && !sameDirectory(sessionCwd, memoryCwd))
    throw new OrchestratorWorkingDirectoryError(sessionId, sessionCwd, memoryCwd);
}
