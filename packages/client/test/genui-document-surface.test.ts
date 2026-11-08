import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GenuiMirrorFrame } from '../../core/src/channels/genui-mirror-frame.js';
import type { GenuiExecutionSupervisor } from '../../core/src/channels/genui-execution-supervisor.js';
import type { GenuiExecutionSnapshot } from '../../core/src/channels/genui-execution-supervisor.js';
import { GenuiDocumentSurface } from '../../core/src/channels/genui-document-surface.js';
import { initialGenuiDocumentState } from '../../core/src/channels/genui-document.js';
import { GENUI_EXECUTION_PROTOCOL } from '../../core/src/channels/genui-execution.js';
import { syntheticGenuiDocument } from '../../core/test/fixtures/genui-document.js';

const { JSDOM }: { JSDOM: new (html: string) => { window: Window & typeof globalThis } } =
  createRequire(import.meta.url)('jsdom');
const documents: { window: Window & typeof globalThis }[] = [];

const controlled = vi.hoisted(() => {
  class Frame {
    static readonly created: Frame[] = [];
    readonly ready: Promise<void>;
    readonly frame: HTMLIFrameElement;
    release: (() => void) | undefined;
    readonly paint = vi.fn(() => true);
    readonly theme = vi.fn();
    readonly dispose = vi.fn();

    constructor(
      container: HTMLElement,
      readonly options: ConstructorParameters<typeof GenuiMirrorFrame>[1],
    ) {
      this.frame = container.ownerDocument.createElement('iframe');
      this.ready = new Promise<void>((resolve) => {
        this.release = resolve;
      });
      Frame.created.push(this);
    }
  }
  class Supervisor {
    static readonly created: Supervisor[] = [];
    readonly send = vi.fn();
    readonly dispose = vi.fn();
    readonly pendingControlIds = new Set<string>();

    constructor(readonly options: ConstructorParameters<typeof GenuiExecutionSupervisor>[0]) {
      Supervisor.created.push(this);
    }
  }
  return { Frame, Supervisor };
});

vi.mock('../../core/src/channels/genui-mirror-frame.js', () => ({
  GenuiMirrorFrame: controlled.Frame,
}));
vi.mock('../../core/src/channels/genui-execution-supervisor.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  GenuiExecutionSupervisor: controlled.Supervisor,
}));

const surfaces: GenuiDocumentSurface[] = [];
const initial = initialGenuiDocumentState(syntheticGenuiDocument);

function open() {
  const onState = vi.fn();
  const onHeight = vi.fn();
  const onFailure = vi.fn();
  const surface = new GenuiDocumentSurface(documentContainer(), {
    document: syntheticGenuiDocument,
    state: initial,
    theme: 'light',
    instanceId: 'surface-test',
    generation: 1,
    workerSource: 'trusted packaged Worker',
    onState,
    onHeight,
    onFailure,
  });
  void surface.ready.catch(() => {});
  surfaces.push(surface);
  const frame = controlled.Frame.created.at(-1);
  if (!frame) throw Error('Missing controlled frame.');
  return { surface, frame, onState, onHeight, onFailure };
}

function documentContainer(): HTMLElement {
  const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>');
  documents.push(dom);
  return dom.window.document.body;
}

async function load(frame: InstanceType<typeof controlled.Frame>) {
  frame.release?.();
  await frame.ready;
  const supervisor = controlled.Supervisor.created.at(-1);
  if (!supervisor) throw Error('Missing controlled supervisor.');
  return supervisor;
}

function snapshot(state = initial): GenuiExecutionSnapshot {
  return {
    protocol: GENUI_EXECUTION_PROTOCOL,
    instanceId: 'surface-test',
    generation: 1,
    sequence: 1,
    commandSequence: 0,
    type: 'snapshot' as const,
    html: '<p>Bounded output</p>',
    controls: [],
    state,
    wasmBytes: 0,
  };
}

afterEach(() => {
  for (const surface of surfaces.splice(0)) surface.dispose();
  for (const dom of documents.splice(0)) dom.window.close();
  controlled.Frame.created.length = 0;
  controlled.Supervisor.created.length = 0;
});

describe('GenUI document surface lifecycle composition', () => {
  it('does not start execution when disposed before the script-disabled frame loads', async () => {
    const { surface, frame } = open();
    surface.dispose();
    frame.release?.();
    await frame.ready;
    expect(controlled.Supervisor.created).toHaveLength(0);
    expect(frame.dispose).toHaveBeenCalledTimes(1);
    await expect(surface.ready).rejects.toThrow('disposed');
  });

  it('starts with the latest caller state and theme, not a stale initial closure', async () => {
    const { surface, frame, onState } = open();
    const state = { version: 1 as const, values: { ...initial.values, filter: 'Beta' } };
    surface.restore(state);
    surface.theme('dark');
    const supervisor = await load(frame);
    expect(supervisor.options.state).toEqual(state);
    expect(supervisor.options.theme).toBe('dark');
    supervisor.options.onSnapshot(snapshot(state));
    await surface.ready;
    expect(onState).not.toHaveBeenCalled();
  });

  it('publishes only changed state after successful paint and tears down both owners on failure', async () => {
    const { surface, frame, onState, onFailure } = open();
    const supervisor = await load(frame);
    supervisor.options.onSnapshot(snapshot());
    await surface.ready;
    const state = { version: 1 as const, values: { ...initial.values, details: true } };
    supervisor.options.onSnapshot(snapshot(state));
    supervisor.options.onSnapshot(snapshot(state));
    expect(onState).toHaveBeenCalledExactlyOnceWith(state);
    frame.options.onFailure('resource');
    expect(onFailure).toHaveBeenCalledExactlyOnceWith('resource');
    expect(supervisor.dispose).toHaveBeenCalledTimes(1);
    expect(frame.dispose).toHaveBeenCalledTimes(1);
    supervisor.options.onSnapshot(snapshot(initial));
    surface.restore(initial);
    surface.theme('dark');
    expect(onState).toHaveBeenCalledTimes(1);
    expect(supervisor.send).not.toHaveBeenCalled();
  });

  it('does not report readiness or save state when native mirroring fails', async () => {
    const { surface, frame, onState } = open();
    const supervisor = await load(frame);
    frame.paint.mockReturnValue(false);
    supervisor.options.onSnapshot(snapshot());
    expect(onState).not.toHaveBeenCalled();
    frame.options.onFailure('unsupported');
    await expect(surface.ready).rejects.toThrow('disposed');
  });
});
