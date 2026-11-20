import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { createGenuiVm, createGenuiVmFactory, GenuiVmError } from '../src/channels/genui-vm.js';
import { GENUI_EXECUTION_LIMITS } from '../src/channels/genui-execution.js';

const require = createRequire(import.meta.url);
const wasm = new Uint8Array(
  await readFile(require.resolve('@jitl/quickjs-wasmfile-release-sync/wasm')),
).buffer;

describe('GenUI guest interpreter execution owner', () => {
  it('isolates runtime heaps while charging their allocations to one aggregate WASM memory', async () => {
    const createVm = await createGenuiVmFactory(wasm);
    const first = createVm();
    const second = createVm();
    try {
      first.execute(
        'globalThis.privateValue="first";globalThis.buffer=new ArrayBuffer(8*1024*1024)',
      );
      const before = first.wasmBytes;
      second.execute(
        'globalThis.privateValue="second";globalThis.buffer=new ArrayBuffer(8*1024*1024)',
      );
      expect(first.readString('privateValue')).toBe('first');
      expect(second.readString('privateValue')).toBe('second');
      expect(first.wasmBytes).toBeGreaterThan(before);
      expect(second.wasmBytes).toBe(first.wasmBytes);
      expect(first.wasmBytes).toBeLessThanOrEqual(GENUI_EXECUTION_LIMITS.wasmBytes);
      first.dispose();
      expect(second.readString('privateValue')).toBe('second');
    } finally {
      first.dispose();
      second.dispose();
    }
  });

  it('runs local JavaScript without exposing Browser, Node or Host capabilities', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      vm.execute('globalThis.answer = 6 * 7');
      expect(vm.readString('String(answer)')).toBe('42');
      expect(
        vm.readString(
          "JSON.stringify(['fetch','XMLHttpRequest','Worker','process','require','WebSocket','WebAssembly','postMessage'].map(name=>typeof globalThis[name]))",
        ),
      ).toBe(JSON.stringify(Array(8).fill('undefined')));
      expect(vm.wasmBytes).toBeLessThanOrEqual(GENUI_EXECUTION_LIMITS.wasmBytes);
    } finally {
      vm.dispose();
    }
  });

  it('interrupts an infinite guest loop and poisons that instance until disposal', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      expect(() => vm.execute('for (;;) {}')).toThrow(GenuiVmError);
      expect(vm.failure).toBe('execution');
      expect(() => vm.execute('globalThis.answer = 42')).toThrow(/stopped/);
    } finally {
      vm.dispose();
    }
  });

  it('interrupts native regexp backtracking as well as ordinary bytecode', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      expect(() => vm.execute("new RegExp('(a+)+$').test('a'.repeat(32)+'!')")).toThrow(
        GenuiVmError,
      );
      expect(vm.failure).toBe('execution');
    } finally {
      vm.dispose();
    }
  });

  it('enforces explicit WASM capacity rather than relying on allocator accounting', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      expect(() =>
        vm.execute(
          'globalThis.retained=[];for(let index=0;index<96;index++)retained.push(String.fromCharCode(65+index%26).repeat(1048576-16)+index)',
        ),
      ).toThrow(GenuiVmError);
      expect(['memory', 'execution']).toContain(vm.failure);
      expect(vm.wasmBytes).toBeLessThanOrEqual(GENUI_EXECUTION_LIMITS.wasmBytes);
    } finally {
      vm.dispose();
    }
  });

  it('drains a bounded number of promise jobs and refuses an endless queue', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      vm.execute('globalThis.answer=0;Promise.resolve().then(()=>{answer=42})');
      expect(vm.readString('String(answer)')).toBe('42');
      expect(() =>
        vm.execute('Promise.resolve().then(function again(){Promise.resolve().then(again)})'),
      ).toThrow(GenuiVmError);
      expect(vm.failure).toBe('resource');
    } finally {
      vm.dispose();
    }
  });

  it('preserves script directive boundaries while sharing one Promise-job budget', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      vm.executeScripts(['globalThis.answer=0', '"use strict"; answer=42']);
      expect(vm.readString('String(answer)')).toBe('42');
      expect(() =>
        vm.executeScripts([
          'globalThis.jobs=()=>{for(let index=0;index<60;index++)Promise.resolve().then(()=>{})};jobs()',
          'jobs()',
        ]),
      ).toThrow(/promise queue/iu);
      expect(vm.failure).toBe('resource');
    } finally {
      vm.dispose();
    }
  });

  it('never dumps an arbitrary guest object or an oversized string into native JS', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      vm.execute('globalThis.wasDumped=false;({toJSON(){wasDumped=true;for(;;){}}})');
      expect(vm.readString('String(wasDumped)')).toBe('false');
      expect(() => vm.readString(`'x'.repeat(${GENUI_EXECUTION_LIMITS.replyBytes + 1})`)).toThrow(
        GenuiVmError,
      );
      expect(vm.failure).toBe('resource');
    } finally {
      vm.dispose();
    }
  });

  it('bounds UTF-8 query results and diagnostics, not only code-unit counts', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      expect(() =>
        vm.readString(`'界'.repeat(${Math.floor(GENUI_EXECUTION_LIMITS.replyBytes / 3) + 1})`),
      ).toThrow(GenuiVmError);
      expect(vm.failure).toBe('resource');
      expect(
        new TextEncoder().encode(new GenuiVmError('invalid-content', '界'.repeat(200)).message)
          .byteLength,
      ).toBeLessThanOrEqual(GENUI_EXECUTION_LIMITS.diagnosticBytes);
    } finally {
      vm.dispose();
    }
  });

  it('keeps diagnostic getters inside the same interpreter deadline', async () => {
    const vm = await createGenuiVm(wasm);
    try {
      expect(() => vm.execute('throw {get message(){for(;;){}}}')).toThrow(GenuiVmError);
      expect(vm.failure).toBe('execution');
    } finally {
      vm.dispose();
    }
  });

  it('disposes idempotently and refuses work after disposal', async () => {
    const vm = await createGenuiVm(wasm);
    vm.dispose();
    vm.dispose();
    expect(() => vm.execute('1')).toThrow(/stopped/);
  });
});
