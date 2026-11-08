import { z } from 'zod';
import { parseGenuiDocument, validateGenuiDocumentState } from './genui-document.js';
import {
  createGenuiExecutionSession,
  type GenuiExecutionSession,
} from './genui-execution-session.js';
import { GENUI_EXECUTION_PROTOCOL, type GenuiExecutionReply } from './genui-execution.js';
import { createGenuiVmFactory, GenuiVmError, type GenuiVm } from './genui-vm.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

declare const __GENUI_GUEST_LIBRARY__: string;
declare const __GENUI_WASM_BASE64__: string;

const bootSchema = z.strictObject({
  protocol: z.literal(GENUI_EXECUTION_PROTOCOL),
  type: z.literal('boot'),
  instanceId: z
    .string()
    .min(1)
    .max(100)
    .regex(/^[a-zA-Z0-9._:-]+$/u),
  generation: z.number().int().min(1).max(Number.MAX_SAFE_INTEGER),
  document: z.unknown(),
  state: z.unknown(),
  theme: z.enum(['light', 'dark']),
});

const envelopeSchema = z.union([
  z.strictObject({ portId: z.number().int().positive().safe(), command: z.unknown() }),
  z.strictObject({ portId: z.number().int().positive().safe(), dispose: z.literal(true) }),
]);
interface Slot {
  closed: boolean;
  session?: GenuiExecutionSession;
}
const slots = new Map<number, Slot>();
let factory: Promise<() => GenuiVm> | undefined;
let lastPortId = 0;

const release = (portId: number, slot: Slot) => {
  if (slot.closed) return;
  slot.closed = true;
  slots.delete(portId);
  slot.session?.dispose();
};

globalThis.addEventListener('message', async (event: MessageEvent<unknown>) => {
  const envelope = envelopeSchema.safeParse(event.data);
  if (!envelope.success) {
    globalThis.close();
    return;
  }
  const { portId } = envelope.data;
  const existing = slots.get(portId);
  if ('dispose' in envelope.data) {
    if (existing) release(portId, existing);
    return;
  }
  if (existing) {
    if (existing.session) existing.session.receive(envelope.data.command);
    else globalThis.close();
    return;
  }
  if (portId <= lastPortId || slots.size >= GENUI_EXECUTION_LIMITS.activeDocuments) {
    globalThis.close();
    return;
  }
  lastPortId = portId;
  const boot = bootSchema.safeParse(envelope.data.command);
  if (!boot.success) {
    globalThis.close();
    return;
  }
  const slot: Slot = { closed: false };
  slots.set(portId, slot);
  const send = (reply: GenuiExecutionReply) => {
    if (!slot.closed) globalThis.postMessage({ portId, reply }, {});
  };
  const { instanceId, generation, theme } = boot.data;
  try {
    const document = parseGenuiDocument(boot.data.document);
    const state = validateGenuiDocumentState(document, boot.data.state);
    if (!factory) {
      const wasmBinary = Uint8Array.from(atob(__GENUI_WASM_BASE64__), (character) =>
        character.charCodeAt(0),
      ).buffer;
      factory = createGenuiVmFactory(wasmBinary);
    }
    const createVm = await factory;
    if (slot.closed) return;
    const started = await createGenuiExecutionSession({
      instanceId,
      generation,
      document,
      state,
      theme,
      wasmBinary: new ArrayBuffer(0),
      createVm,
      librarySource: __GENUI_GUEST_LIBRARY__,
      send,
      stopped: () => release(portId, slot),
    });
    if (slot.closed) started.dispose();
    else slot.session = started;
  } catch (error) {
    send({
      protocol: GENUI_EXECUTION_PROTOCOL,
      instanceId,
      generation,
      sequence: 1,
      type: 'error',
      reason: error instanceof GenuiVmError ? error.reason : 'invalid-content',
      detail: error instanceof GenuiVmError ? error.message : 'Generated document startup failed.',
      wasmBytes: 0,
    });
    release(portId, slot);
  }
});
