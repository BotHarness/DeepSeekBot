import {
  parseGenuiDocument,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from '../../../../packages/core/src/channels/genui-document';
import { GENUI_EXECUTION_LIMITS } from '../../../../packages/core/src/channels/genui-execution-limits';
import {
  buildGenuiPageHtml,
  GENUI_NATIVE_INBOUND_BYTES,
  GENUI_PAGE_FAILURES,
} from '../../../../packages/core/src/channels/genui-page';

export type { GenuiDocument, GenuiDocumentState };
export type GenuiDocumentFailure = (typeof GENUI_PAGE_FAILURES)[number];
export type GenuiBridgeMessage =
  | { type: 'ready' }
  | { type: 'height'; height: number }
  | { type: 'failure'; reason: GenuiDocumentFailure }
  | { type: 'state'; state: GenuiDocumentState };

export const GENUI_BRIDGE_BYTES = GENUI_NATIVE_INBOUND_BYTES;
export const GENUI_FRAME_MAX_HEIGHT =
  GENUI_EXECUTION_LIMITS.mirrorMaxHeight * GENUI_EXECUTION_LIMITS.mirrorMaxTextScale;

export function genuiDocumentOf(value: unknown): GenuiDocument | undefined {
  if (!value || typeof value !== 'object' || !('version' in value) || value.version !== 2)
    return undefined;
  try {
    return parseGenuiDocument(value);
  } catch {
    return undefined;
  }
}

export function genuiTextScale(fontScale: number): number {
  if (!Number.isFinite(fontScale) || fontScale <= 0) return 1;
  return Math.min(
    GENUI_EXECUTION_LIMITS.mirrorMaxTextScale,
    Math.max(GENUI_EXECUTION_LIMITS.mirrorMinTextScale, fontScale),
  );
}

export function genuiDocumentPage(
  document: GenuiDocument,
  options: {
    instanceId: string;
    theme: 'light' | 'dark';
    fontScale: number;
    runtimeBase64: string;
    state?: GenuiDocumentState;
  },
): string {
  return buildGenuiPageHtml(document, {
    instanceId: options.instanceId,
    theme: options.theme,
    ...(options.state === undefined ? {} : { state: options.state }),
    textScale: genuiTextScale(options.fontScale),
    runtimeBase64: options.runtimeBase64,
    bridge: 'native',
  });
}

function keys(value: object): string {
  return Object.keys(value).sort().join(',');
}

export function parseGenuiBridgeMessage(
  data: unknown,
  instanceId: string,
  document?: GenuiDocument,
): GenuiBridgeMessage | undefined {
  if (typeof data !== 'string' || data.length === 0 || data.length > GENUI_BRIDGE_BYTES)
    return undefined;
  let value: unknown;
  try {
    value = JSON.parse(data);
  } catch {
    return undefined;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const message = value as Record<string, unknown>;
  if (message['instanceId'] !== instanceId) return undefined;
  if (message['type'] === 'ready' && keys(message) === 'instanceId,type') return { type: 'ready' };
  if (message['type'] === 'height' && keys(message) === 'height,instanceId,type') {
    const height = message['height'];
    if (
      typeof height === 'number' &&
      Number.isFinite(height) &&
      height > 0 &&
      height <= GENUI_FRAME_MAX_HEIGHT
    )
      return { type: 'height', height: Math.ceil(height) };
    return undefined;
  }
  if (message['type'] === 'state' && keys(message) === 'instanceId,state,type') {
    if (document?.stateContract === undefined) return undefined;
    try {
      return { type: 'state', state: validateGenuiDocumentState(document, message['state']) };
    } catch {
      return undefined;
    }
  }
  if (message['type'] === 'failure' && keys(message) === 'instanceId,reason,type') {
    const reason = message['reason'];
    return GENUI_PAGE_FAILURES.includes(reason as GenuiDocumentFailure)
      ? { type: 'failure', reason: reason as GenuiDocumentFailure }
      : undefined;
  }
  return undefined;
}

export function genuiNavigationAllowed(url: string): boolean {
  return url === 'about:blank' || url === 'about:srcdoc';
}

export function genuiRestoreMessage(
  instanceId: string,
  document: GenuiDocument,
  state: GenuiDocumentState,
): string | undefined {
  try {
    const data = JSON.stringify({
      instanceId,
      type: 'restore',
      state: validateGenuiDocumentState(document, state),
    });
    return data.length <= GENUI_NATIVE_INBOUND_BYTES ? data : undefined;
  } catch {
    return undefined;
  }
}
