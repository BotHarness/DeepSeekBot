import type { ApprovalRequest } from '../host/requests';
import { t } from './strings';

export function alwaysNote(request: Pick<ApprovalRequest, 'toolName' | 'allowAlways'>): string {
  if (!request.allowAlways) return t.alwaysUnavailable;
  if (request.toolName === 'secret_cli') return t.alwaysKindScope;
  if (request.toolName === 'secret_mcp_connect') return t.alwaysServiceScope;
  return t.alwaysToolScope(request.toolName);
}

const HIGH_RISK = new Set([
  'secret_cli',
  'secret_mcp_connect',
  'bot_create',
  'channel_attachment_open',
]);

export function highRisk(toolName: string): boolean {
  return HIGH_RISK.has(toolName);
}

export function riskNote(toolName: string): string {
  if (toolName === 'channel_attachment_open') return t.riskOriginal;
  if (toolName === 'bot_create') return t.riskBotCreate;
  if (toolName === 'secret_cli') return t.riskSecretCli;
  if (toolName === 'secret_mcp_connect') return t.riskSecretMcp;
  return t.riskTool;
}

export function executionNote(request: Pick<ApprovalRequest, 'execution'>): string | undefined {
  if (request.execution === 'waiting-human') return t.waitingHumanCapacity;
  if (request.execution === 'waiting-capacity') return t.waitingCapacity;
  if (request.execution === 'needs-repair') return t.needsRepair;
  return undefined;
}

export function expiryLabel(expiresAt: string | undefined, now: number): string | undefined {
  if (expiresAt === undefined) return undefined;
  const left = Date.parse(expiresAt) - now;
  if (!(left > 0) || left >= 60 * 60 * 1000) return undefined;
  if (left < 60 * 1000) return t.expiresSoon;
  return t.expiresInMinutes(Math.floor(left / (60 * 1000)));
}
