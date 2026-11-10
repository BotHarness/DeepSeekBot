import {
  initialGenuiDocumentState,
  validateGenuiDocumentState,
  type GenuiDocument,
  type GenuiDocumentState,
} from './genui-document.js';
import {
  GENUI_EXECUTION_PROTOCOL,
  parseGenuiExecutionEvent,
  parseGenuiExecutionReply,
  type GenuiExecutionEvent,
  type GenuiExecutionReply,
} from './genui-execution.js';
import { createGenuiVm, GenuiVm, GenuiVmError } from './genui-vm.js';
import { installGenuiNumberFormat } from './genui-guest-intl.js';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';

type LocalEvent = Pick<GenuiExecutionEvent, 'event' | 'targetId' | 'value' | 'checked'>;
const internalHeader = {
  protocol: GENUI_EXECUTION_PROTOCOL,
  instanceId: 'guest-adapter',
  generation: 1,
  sequence: 1,
};
const internalOwner = { ...internalHeader, lastSequence: 0 };

export class GenuiGuest {
  private stopped = false;

  constructor(
    private readonly vm: GenuiVm,
    private readonly document: GenuiDocument,
    private readonly resetFormatBudget: () => void,
  ) {}

  get wasmBytes(): number {
    return this.vm.wasmBytes;
  }

  snapshot(): Extract<GenuiExecutionReply, { type: 'snapshot' }> {
    const serialized = this.read('__genuiRuntime.snapshot()');
    const parsed = parseGenuiExecutionReply(
      {
        ...JSON.parse(serialized),
        ...internalHeader,
        type: 'snapshot',
        commandSequence: 0,
        wasmBytes: this.vm.wasmBytes,
      },
      internalOwner,
      this.document,
    );
    if (!parsed || parsed.type !== 'snapshot') {
      this.dispose();
      throw new GenuiVmError('invalid-content', 'Invalid guest snapshot or private state.');
    }
    return parsed;
  }

  event(event: LocalEvent): void {
    const parsed = parseGenuiExecutionEvent(
      { ...event, ...internalHeader, type: 'event' },
      internalOwner,
    );
    if (!parsed) throw new GenuiVmError('invalid-content', 'Invalid local DOM event.');
    this.execute(`__genuiRuntime.event(${JSON.stringify(parsed)})`);
  }

  restore(state: GenuiDocumentState): void {
    const validated = validateGenuiDocumentState(this.document, state);
    this.execute(`__genuiRuntime.restore(${JSON.stringify(validated)})`);
  }

  theme(theme: 'light' | 'dark'): void {
    if (theme !== 'light' && theme !== 'dark')
      throw new GenuiVmError('invalid-content', 'Invalid theme.');
    this.execute(`__genuiRuntime.theme(${JSON.stringify(theme)})`);
  }

  tick(now: number): number {
    if (!Number.isFinite(now) || now < 0)
      throw new GenuiVmError('invalid-content', 'Invalid timer time.');
    const executed: unknown = JSON.parse(
      this.read(`JSON.stringify(__genuiRuntime.tick(${JSON.stringify(now)}))`),
    );
    if (
      typeof executed === 'number' &&
      Number.isSafeInteger(executed) &&
      executed >= 0 &&
      executed <= GENUI_EXECUTION_LIMITS.callbacksPerSecond
    )
      return executed;
    this.dispose();
    throw new GenuiVmError('invalid-content', 'Invalid guest timer result.');
  }

  nextTimer(): number | null {
    const next: unknown = JSON.parse(this.read('JSON.stringify(__genuiRuntime.nextTimer())'));
    if (next === null || (typeof next === 'number' && Number.isFinite(next) && next >= 0))
      return next;
    this.dispose();
    throw new GenuiVmError('invalid-content', 'Invalid guest timer deadline.');
  }

  dispose(): void {
    this.stopped = true;
    this.vm.dispose();
  }

  private execute(source: string): void {
    if (this.stopped) throw new GenuiVmError('resource', 'The guest adapter is stopped.');
    this.resetFormatBudget();
    try {
      this.vm.execute(source);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private read(source: string): string {
    if (this.stopped) throw new GenuiVmError('resource', 'The guest adapter is stopped.');
    this.resetFormatBudget();
    try {
      return this.vm.readString(source);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
}

export async function createGenuiGuest(options: {
  document: GenuiDocument;
  state: GenuiDocumentState;
  wasmBinary: ArrayBuffer;
  librarySource: string;
  createVm?: () => GenuiVm;
}): Promise<GenuiGuest> {
  const state = validateGenuiDocumentState(options.document, options.state);
  const vm = options.createVm ? options.createVm() : await createGenuiVm(options.wasmBinary);
  try {
    const resetFormatBudget = installGenuiNumberFormat(vm);
    vm.loadLibrary(options.librarySource);
    vm.execute(
      `const __genuiRuntime=__genuiCreateDom(${JSON.stringify(options.document.html)},${JSON.stringify(state)},${options.document.stateContract !== undefined});`,
    );
    const scripts: unknown = JSON.parse(vm.readString('__genuiRuntime.scripts()'));
    if (
      !Array.isArray(scripts) ||
      scripts.length > GENUI_EXECUTION_LIMITS.scripts ||
      !scripts.every((script): script is string => typeof script === 'string')
    )
      throw new GenuiVmError('invalid-content', 'Invalid document scripts.');
    resetFormatBudget();
    vm.executeScripts(scripts);
    if (JSON.stringify(state) !== JSON.stringify(initialGenuiDocumentState(options.document)))
      vm.execute(`__genuiRuntime.restore(${JSON.stringify(state)})`);
    const guest = new GenuiGuest(vm, options.document, resetFormatBudget);
    guest.snapshot();
    return guest;
  } catch (error) {
    vm.dispose();
    throw error;
  }
}
