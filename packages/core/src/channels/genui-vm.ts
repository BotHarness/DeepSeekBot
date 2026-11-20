import variant from '@jitl/quickjs-wasmfile-release-sync';
import {
  newQuickJSWASMModuleFromVariant,
  newVariant,
  type QuickJSContext,
  type QuickJSHandle,
  type QuickJSRuntime,
} from 'quickjs-emscripten-core';
import { GENUI_EXECUTION_LIMITS } from './genui-execution-limits.js';
import type { GenuiExecutionFailure } from './genui-execution.js';

interface GenuiVmBudget {
  deadline: number;
  pendingJobs: number;
}

function diagnostic(detail: string): string {
  let bytes = 0;
  let bounded = '';
  for (const character of detail) {
    const size = new TextEncoder().encode(character).byteLength;
    if (bytes + size > GENUI_EXECUTION_LIMITS.diagnosticBytes) break;
    bounded += character;
    bytes += size;
  }
  return bounded;
}

export class GenuiVmError extends Error {
  constructor(
    readonly reason: GenuiExecutionFailure,
    detail: string,
  ) {
    super(diagnostic(detail));
    this.name = 'GenuiVmError';
  }
}

export class GenuiVm {
  private deadline = Infinity;
  private interrupted = false;
  private failureReason: GenuiExecutionFailure | undefined;
  private memory: WebAssembly.Memory | undefined;
  private runtime: QuickJSRuntime | undefined;
  private guest: QuickJSContext | undefined;
  private errorFormatter: QuickJSHandle | undefined;

  constructor(memory: WebAssembly.Memory, runtime: QuickJSRuntime, guest: QuickJSContext) {
    this.memory = memory;
    this.runtime = runtime;
    this.guest = guest;
    runtime.setInterruptHandler(() => {
      if (performance.now() < this.deadline) return false;
      this.interrupted = true;
      return true;
    });
    const formatter = guest.evalCode(
      `(() => {
      const stringify = String;
      const slice = String.prototype.slice;
      const apply = Reflect.apply;
      return (error) => apply(slice, stringify(error && error.message !== undefined ? error.message : error), [0, 120]);
    })()`,
      'genui-error-formatter.js',
    );
    if (formatter.error) {
      formatter.dispose();
      throw new GenuiVmError('unsupported', 'Could not initialize the guest interpreter.');
    }
    this.errorFormatter = formatter.value;
  }

  get context(): QuickJSContext {
    if (!this.guest || this.failureReason)
      throw new GenuiVmError(this.failureReason ?? 'resource', 'The guest interpreter is stopped.');
    return this.guest;
  }

  get failure(): GenuiExecutionFailure | undefined {
    return this.failureReason;
  }

  get wasmBytes(): number {
    return this.memory?.buffer.byteLength ?? 0;
  }

  execute(source: string): void {
    this.evaluate(source, GENUI_EXECUTION_LIMITS.executionMs, false);
  }

  executeScripts(sources: readonly string[]): void {
    if (
      sources.length > GENUI_EXECUTION_LIMITS.scripts ||
      sources.reduce((bytes, source) => bytes + new TextEncoder().encode(source).byteLength, 0) >
        GENUI_EXECUTION_LIMITS.htmlBytes
    )
      return this.stop('resource', 'Document script source exceeds its budget.');
    const budget = {
      deadline: performance.now() + GENUI_EXECUTION_LIMITS.executionMs,
      pendingJobs: GENUI_EXECUTION_LIMITS.pendingJobs,
    };
    for (const source of sources)
      this.evaluate(source, GENUI_EXECUTION_LIMITS.executionMs, false, budget);
  }

  loadLibrary(source: string): void {
    this.evaluate(source, GENUI_EXECUTION_LIMITS.parserMs, false);
  }

  readString(source: string): string {
    return this.evaluate(source, GENUI_EXECUTION_LIMITS.executionMs, true);
  }

  private stop(reason: GenuiExecutionFailure, detail: string): never {
    this.failureReason = reason;
    throw new GenuiVmError(reason, detail);
  }

  private describe(error: QuickJSHandle): string {
    const guest = this.guest;
    if (!guest || !this.errorFormatter) return 'Generated script failed.';
    const result = guest.callFunction(this.errorFormatter, guest.undefined, error);
    try {
      return result.error ? 'Generated script failed.' : guest.getString(result.value);
    } finally {
      result.dispose();
    }
  }

  private evaluate(
    source: string,
    budgetMs: number,
    read: boolean,
    sharedBudget?: GenuiVmBudget,
  ): string {
    const guest = this.context;
    const runtime = this.runtime;
    if (!runtime) return this.stop('resource', 'The guest interpreter is stopped.');
    const sourceLimit =
      budgetMs === GENUI_EXECUTION_LIMITS.parserMs
        ? GENUI_EXECUTION_LIMITS.libraryBytes
        : GENUI_EXECUTION_LIMITS.htmlBytes;
    if (new TextEncoder().encode(source).byteLength > sourceLimit)
      return this.stop('resource', 'Guest source exceeds its byte budget.');
    this.interrupted = false;
    const budget = sharedBudget ?? {
      deadline: performance.now() + budgetMs,
      pendingJobs: GENUI_EXECUTION_LIMITS.pendingJobs,
    };
    this.deadline = budget.deadline;
    if (performance.now() >= this.deadline)
      return this.stop('execution', 'Guest execution exceeded its deadline.');
    try {
      const result = guest.evalCode(source, 'genui-document.js');
      let text = '';
      try {
        if (result.error) {
          const detail = this.describe(result.error);
          return this.stop(
            this.interrupted
              ? 'execution'
              : /out of memory/iu.test(detail)
                ? 'memory'
                : 'invalid-content',
            detail,
          );
        }
        if (read) {
          if (guest.typeof(result.value) !== 'string')
            return this.stop('invalid-content', 'Expected a serialized guest result.');
          const length = guest.getProp(result.value, 'length');
          try {
            if (guest.getNumber(length) > GENUI_EXECUTION_LIMITS.replyBytes)
              return this.stop('resource', 'Serialized guest result exceeds its budget.');
          } finally {
            length.dispose();
          }
          text = guest.getString(result.value);
          if (new TextEncoder().encode(text).byteLength > GENUI_EXECUTION_LIMITS.replyBytes)
            return this.stop('resource', 'Serialized guest result exceeds its byte budget.');
        }
      } finally {
        result.dispose();
      }
      if (runtime.hasPendingJob()) {
        if (budget.pendingJobs <= 0)
          return this.stop('resource', 'Guest promise queue exceeds its budget.');
        const jobs = runtime.executePendingJobs(budget.pendingJobs);
        try {
          if (jobs.error) {
            const detail = this.describe(jobs.error);
            return this.stop(this.interrupted ? 'execution' : 'invalid-content', detail);
          }
          budget.pendingJobs -= jobs.value;
          if (runtime.hasPendingJob())
            return this.stop('resource', 'Guest promise queue exceeds its budget.');
        } finally {
          jobs.dispose();
        }
      }
      if (this.interrupted || performance.now() >= this.deadline)
        return this.stop('execution', 'Guest execution exceeded its deadline.');
      return text;
    } catch (error) {
      if (error instanceof GenuiVmError) throw error;
      return this.stop(
        this.interrupted ? 'execution' : 'invalid-content',
        'Guest execution failed.',
      );
    } finally {
      this.deadline = Infinity;
    }
  }

  dispose(): void {
    const guest = this.guest;
    const runtime = this.runtime;
    if (!guest || !runtime) return;
    try {
      this.errorFormatter?.dispose();
      this.errorFormatter = undefined;
      guest.dispose();
    } finally {
      this.guest = undefined;
      this.runtime = undefined;
      this.memory = undefined;
      runtime.dispose();
    }
  }
}

export async function createGenuiVmFactory(wasmBinary: ArrayBuffer): Promise<() => GenuiVm> {
  const memory = new WebAssembly.Memory({
    initial: GENUI_EXECUTION_LIMITS.initialWasmBytes / 65536,
    maximum: GENUI_EXECUTION_LIMITS.wasmBytes / 65536,
  });
  const module = await newQuickJSWASMModuleFromVariant(
    newVariant(variant, {
      wasmMemory: memory,
      wasmBinary,
      locateFile: () => 'data:application/wasm;base64,',
    }),
  );
  return () => {
    const runtime = module.newRuntime();
    let guest: QuickJSContext | undefined;
    try {
      guest = runtime.newContext();
      return new GenuiVm(memory, runtime, guest);
    } catch (error) {
      guest?.dispose();
      runtime.dispose();
      throw error;
    }
  };
}

export async function createGenuiVm(wasmBinary: ArrayBuffer): Promise<GenuiVm> {
  return (await createGenuiVmFactory(wasmBinary))();
}
