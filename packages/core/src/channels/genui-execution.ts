import {
  GENUI_DOCUMENT_LIMITS,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

export const GENUI_EXECUTION_PROTOCOL = 'botharness-genui-execution-v1';

export { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

export interface GenuiExecutionOwner {
  instanceId: string;
  generation: number;
  lastSequence: number;
}

interface GenuiExecutionHeader {
  protocol: typeof GENUI_EXECUTION_PROTOCOL;
  instanceId: string;
  generation: number;
  sequence: number;
}

export interface GenuiExecutionControl {
  id: string;
  value?: string;
  checked?: boolean;
}

export type GenuiExecutionFailure =
  | 'startup'
  | 'execution'
  | 'memory'
  | 'resource'
  | 'unsupported'
  | 'invalid-content';

export type GenuiExecutionReply = GenuiExecutionHeader &
  (
    | {
        type: 'snapshot';
        commandSequence: number;
        html: string;
        state: GenuiDocumentState;
        controls: GenuiExecutionControl[];
        wasmBytes: number;
      }
    | { type: 'heartbeat'; wasmBytes: number }
    | { type: 'error'; reason: GenuiExecutionFailure; detail: string; wasmBytes: number }
  );

export type GenuiExecutionEvent = GenuiExecutionHeader & {
  type: 'event';
  event: 'input' | 'change' | 'click';
  targetId: string;
  value?: string;
  checked?: boolean;
};

export type GenuiExecutionUpdate = GenuiExecutionHeader &
  ({ type: 'restore'; state: GenuiDocumentState } | { type: 'theme'; theme: 'light' | 'dark' });

const headerKeys = ['protocol', 'instanceId', 'generation', 'sequence', 'type'];
const encoder = new TextEncoder();

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  return Object.keys(value).every((key) => keys.includes(key));
}

function boundedBytes(value: unknown, limit: number): boolean {
  const serialized = JSON.stringify(value);
  return typeof serialized === 'string' && encoder.encode(serialized).byteLength <= limit;
}

function header(
  value: Record<string, unknown>,
  owner: GenuiExecutionOwner,
): GenuiExecutionHeader | undefined {
  const sequence = value['sequence'];
  if (
    value['protocol'] !== GENUI_EXECUTION_PROTOCOL ||
    value['instanceId'] !== owner.instanceId ||
    value['generation'] !== owner.generation ||
    !Number.isSafeInteger(owner.generation) ||
    owner.generation < 1 ||
    typeof sequence !== 'number' ||
    !Number.isSafeInteger(sequence) ||
    !Number.isSafeInteger(owner.lastSequence) ||
    owner.lastSequence < 0 ||
    sequence - owner.lastSequence !== 1
  )
    return undefined;
  return {
    protocol: GENUI_EXECUTION_PROTOCOL,
    instanceId: owner.instanceId,
    generation: owner.generation,
    sequence,
  };
}

function nodeId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9][0-9]{0,9}$/u.test(value) &&
    Number(value) <= GENUI_EXECUTION_LIMITS.nodeId
  );
}

function wasmBytes(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0 &&
    value <= GENUI_EXECUTION_LIMITS.wasmBytes
  );
}

function control(value: unknown): GenuiExecutionControl | undefined {
  if (!record(value) || !exactKeys(value, ['id', 'value', 'checked']) || !nodeId(value['id']))
    return undefined;
  const text = value['value'];
  const checked = value['checked'];
  if (
    (text !== undefined &&
      (typeof text !== 'string' || text.length > GENUI_DOCUMENT_LIMITS.stringLength)) ||
    (checked !== undefined && typeof checked !== 'boolean') ||
    (text === undefined && checked === undefined)
  )
    return undefined;
  return {
    id: value['id'],
    ...(typeof text === 'string' ? { value: text } : {}),
    ...(typeof checked === 'boolean' ? { checked } : {}),
  };
}

function failure(value: unknown): value is GenuiExecutionFailure {
  return (
    value === 'startup' ||
    value === 'execution' ||
    value === 'memory' ||
    value === 'resource' ||
    value === 'unsupported' ||
    value === 'invalid-content'
  );
}

export function parseGenuiExecutionReply(
  value: unknown,
  owner: GenuiExecutionOwner,
  document: GenuiDocument,
): GenuiExecutionReply | undefined {
  try {
    if (!record(value) || !boundedBytes(value, GENUI_EXECUTION_LIMITS.replyBytes)) return undefined;
    const parsedHeader = header(value, owner);
    const capacity = value['wasmBytes'];
    if (!parsedHeader || !wasmBytes(capacity)) return undefined;
    if (value['type'] === 'heartbeat')
      return exactKeys(value, [...headerKeys, 'wasmBytes'])
        ? { ...parsedHeader, type: 'heartbeat', wasmBytes: capacity }
        : undefined;
    if (value['type'] === 'error') {
      const reason = value['reason'];
      const detail = value['detail'];
      return exactKeys(value, [...headerKeys, 'wasmBytes', 'reason', 'detail']) &&
        failure(reason) &&
        typeof detail === 'string' &&
        encoder.encode(detail).byteLength <= GENUI_EXECUTION_LIMITS.diagnosticBytes
        ? { ...parsedHeader, type: 'error', reason, detail, wasmBytes: capacity }
        : undefined;
    }
    if (
      value['type'] !== 'snapshot' ||
      !exactKeys(value, [
        ...headerKeys,
        'commandSequence',
        'wasmBytes',
        'html',
        'state',
        'controls',
      ])
    )
      return undefined;
    const html = value['html'];
    const commandSequence = value['commandSequence'];
    const controls = value['controls'];
    if (
      typeof commandSequence !== 'number' ||
      !Number.isSafeInteger(commandSequence) ||
      commandSequence < 0 ||
      typeof html !== 'string' ||
      encoder.encode(html).byteLength > GENUI_EXECUTION_LIMITS.htmlBytes ||
      !Array.isArray(controls) ||
      controls.length > GENUI_EXECUTION_LIMITS.controls
    )
      return undefined;
    const parsedControls: GenuiExecutionControl[] = [];
    const ids = new Set<string>();
    for (const item of controls) {
      const parsed = control(item);
      if (!parsed || ids.has(parsed.id)) return undefined;
      ids.add(parsed.id);
      parsedControls.push(parsed);
    }
    return {
      ...parsedHeader,
      type: 'snapshot',
      commandSequence,
      html,
      state: validateGenuiDocumentState(document, value['state']),
      controls: parsedControls,
      wasmBytes: capacity,
    };
  } catch {
    return undefined;
  }
}

export function parseGenuiExecutionEvent(
  value: unknown,
  owner: GenuiExecutionOwner,
): GenuiExecutionEvent | undefined {
  try {
    if (
      !record(value) ||
      !boundedBytes(value, GENUI_EXECUTION_LIMITS.eventBytes) ||
      !exactKeys(value, [...headerKeys, 'event', 'targetId', 'value', 'checked']) ||
      value['type'] !== 'event'
    )
      return undefined;
    const parsedHeader = header(value, owner);
    const event = value['event'];
    const targetId = value['targetId'];
    const text = value['value'];
    const checked = value['checked'];
    if (
      !parsedHeader ||
      !nodeId(targetId) ||
      (event !== 'input' && event !== 'change' && event !== 'click') ||
      (text !== undefined &&
        (typeof text !== 'string' || text.length > GENUI_DOCUMENT_LIMITS.stringLength)) ||
      (checked !== undefined && typeof checked !== 'boolean')
    )
      return undefined;
    return {
      ...parsedHeader,
      type: 'event',
      event,
      targetId,
      ...(typeof text === 'string' ? { value: text } : {}),
      ...(typeof checked === 'boolean' ? { checked } : {}),
    };
  } catch {
    return undefined;
  }
}

export function parseGenuiExecutionUpdate(
  value: unknown,
  owner: GenuiExecutionOwner,
  document: GenuiDocument,
): GenuiExecutionUpdate | undefined {
  try {
    if (!record(value) || !boundedBytes(value, GENUI_EXECUTION_LIMITS.replyBytes)) return undefined;
    const parsedHeader = header(value, owner);
    if (!parsedHeader) return undefined;
    if (value['type'] === 'restore' && exactKeys(value, [...headerKeys, 'state']))
      return {
        ...parsedHeader,
        type: 'restore',
        state: validateGenuiDocumentState(document, value['state']),
      };
    if (
      value['type'] === 'theme' &&
      exactKeys(value, [...headerKeys, 'theme']) &&
      (value['theme'] === 'light' || value['theme'] === 'dark')
    )
      return { ...parsedHeader, type: 'theme', theme: value['theme'] };
    return undefined;
  } catch {
    return undefined;
  }
}
