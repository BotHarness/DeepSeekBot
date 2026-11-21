import { VOICE_CALL_LIMITS, type VoiceCallZoom } from './call-contract.js';
import { CallFrameError, frameLabel, type PreparedFrame } from './call-frames.js';
import type { CallVisualSource } from './keyframes.js';
import { ended } from './calls-types.js';
import type {
  KeptGrid,
  Call,
  EventInput,
  VoiceCallsDeps,
  VisualFrame,
  GridJob,
  VoiceCallSentVisual,
} from './calls-types.js';
import { CallRefusal } from './calls-command.js';

export function createCallVisuals(wiring: {
  now: () => number;
  calls: Map<string, Call>;
  push: (call: Call, event: EventInput) => void;
  log: NonNullable<VoiceCallsDeps['log']>;
  images: () => NonNullable<VoiceCallsDeps['imaging']>;
  deps: VoiceCallsDeps;
  iso: (ms: number) => string;
}) {
  const { now, calls, log, images, deps } = wiring;

  const kept = new Map<string, KeptGrid>();

  let keptCells = 0;

  const keep = (
    call: Call,
    messageId: string,
    source: CallVisualSource,
    cells: readonly PreparedFrame[],
  ) => {
    if (cells.length === 0) return;
    kept.set(messageId, { callId: call.id, slug: call.slug, source, cells });
    keptCells += cells.length;
    for (const [id, grid] of kept) {
      if (keptCells <= VOICE_CALL_LIMITS.keptFrames) break;
      kept.delete(id);
      keptCells -= grid.cells.length;
    }
  };

  const release = (callId: string) => {
    for (const [id, grid] of kept)
      if (grid.callId === callId) {
        kept.delete(id);
        keptCells -= grid.cells.length;
      }
  };

  const clearKeptFrames = () => {
    kept.clear();
    keptCells = 0;
  };

  const zoom = (input: { slug?: string; messageId: string; cell: number }): VoiceCallZoom => {
    const started = now();
    const grid = kept.get(input.messageId);
    if (grid === undefined || (input.slug !== undefined && grid.slug !== input.slug))
      return { released: true, messageId: input.messageId, cell: input.cell };
    const frame = input.cell >= 1 ? grid.cells[input.cell - 1] : undefined;
    if (frame === undefined)
      throw new CallRefusal(
        'cell-invalid',
        `That grid has ${grid.cells.length} cell${grid.cells.length === 1 ? '' : 's'}; pick 1 to ${grid.cells.length}.`,
      );
    const call = calls.get(grid.callId);
    if (call !== undefined && !ended(call))
      wiring.push(call, {
        type: 'frame-zoomed',
        messageId: input.messageId,
        cell: input.cell,
        ms: now() - started,
      });
    log('call-frame-zoomed', { call: grid.callId, cell: input.cell, cells: grid.cells.length });
    return {
      released: false,
      messageId: input.messageId,
      cell: input.cell,
      cells: grid.cells.length,
      source: grid.source,
      jpeg: frame.jpeg,
      width: frame.width,
      height: frame.height,
    };
  };

  const visualBase = (call: Call) => call.connectedAt ?? call.startedAt;

  const pictureRange = (call: Call, frames: readonly VisualFrame[]) => {
    const base = visualBase(call);
    const fromMs = Math.max(0, frames[0]!.at - base);
    return { fromMs, toMs: Math.max(fromMs, frames.at(-1)!.at - base) };
  };

  const reportDropped = (call: Call, source: CallVisualSource, dropped: number) => {
    if (dropped === 0 || ended(call)) return;
    wiring.push(call, { type: 'frames-dropped', source, dropped, total: call.harvest.dropped });
    log('call-frames-dropped', { call: call.id, source, dropped, total: call.harvest.dropped });
  };

  const writeCommit = async (
    call: Call,
    session: number,
    source: CallVisualSource,
    taken: readonly VisualFrame[],
  ) => {
    const endAt = now();
    const started = now();
    try {
      const image = await images().compose(
        taken.map((entry) => entry.frame),
        taken.map((entry, index) => frameLabel(index, (endAt - entry.at) / 1000)),
      );
      const composeMs = now() - started;
      const { fromMs, toMs } = pictureRange(call, taken);
      const messageId = await deps.recordFrames!({
        slug: call.slug,
        channelId: call.channelId,
        callId: call.id,
        startedAt: wiring.iso(visualBase(call)),
        source,
        image,
        frames: taken.length,
        fromMs,
        toMs,
      });
      if (messageId === undefined || ended(call)) return;
      keep(
        call,
        messageId,
        source,
        taken.map((entry) => entry.frame),
      );
      if (call.visualSession === session) call.lastGrid = { source, session, messageId };
      wiring.push(call, {
        type: 'frame-record',
        messageId,
        source,
        frames: taken.length,
        layout: image.layout,
        bytes: image.jpeg.byteLength,
        composeMs,
        fromMs,
        toMs,
      });
      log('call-frame-record', { call: call.id, source, frames: taken.length, ms: composeMs });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'The frame record could not be saved.';
      if (!ended(call)) wiring.push(call, { type: 'grid-failed', message: message.slice(0, 200) });
      log('call-frame-record-failed', { call: call.id, message: message.slice(0, 200) });
    }
  };

  const commit = (
    call: Call,
    session: number,
    source: CallVisualSource,
    batches: readonly (readonly VisualFrame[])[],
  ) => {
    if (batches.length === 0) return;
    if (deps.recordFrames === undefined) {
      reportDropped(
        call,
        source,
        batches.reduce((sum, batch) => sum + batch.length, 0),
      );
      return;
    }
    call.committing += 1;
    call.commits = call.commits
      .then(async () => {
        for (const batch of batches) await writeCommit(call, session, source, batch);
      })
      .finally(() => {
        call.committing -= 1;
        harvest(call);
      });
  };

  const harvest = (call: Call) => {
    if (call.visual === 'off' || call.committing > 0 || ended(call)) return;
    commit(call, call.visualSession, call.visual, call.harvest.due(call.vad.speaking));
  };

  const commitsWritten = async (call: Call, written: Promise<void>) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const late = await Promise.race([
      written.then(() => false),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(true), VOICE_CALL_LIMITS.operationTimeoutMs);
        timer.unref?.();
      }),
    ]);
    clearTimeout(timer);
    if (late) log('call-frame-record-late', { call: call.id });
  };

  const takeGrid = (call: Call): GridJob | undefined => {
    if (call.visual === 'off') return undefined;
    const source = call.visual;
    const session = call.visualSession;
    const { commits, sentence: frames } = call.harvest.cut();
    commit(call, session, source, commits);
    const written = call.commits;
    const endAt = now();
    const id = (call.grids += 1);
    if (frames.length === 0)
      return {
        id,
        source,
        session,
        frames,
        picked: [],
        result: Promise.resolve(undefined),
        written,
      };
    const started = now();
    const range = pictureRange(call, frames);
    const result = images()
      .compose(
        frames.map((entry) => entry.frame),
        frames.map((entry, index) => frameLabel(index, (endAt - entry.at) / 1000)),
      )
      .then((image) => {
        const composeMs = now() - started;
        if (!ended(call))
          wiring.push(call, {
            type: 'grid-built',
            grid: id,
            source,
            frames: frames.length,
            commits: commits.length,
            layout: image.layout,
            bytes: image.jpeg.byteLength,
            composeMs,
            ...range,
          });
        log('call-grid-built', {
          call: call.id,
          source,
          frames: frames.length,
          commits: commits.length,
          layout: image.layout,
          bytes: image.jpeg.byteLength,
          ms: composeMs,
        });
        return { source, image, frames: frames.length, ...range } as const;
      });
    result.catch(() => undefined);
    return {
      id,
      source,
      session,
      frames,
      picked: frames.map((entry) => entry.frame),
      result,
      written,
    };
  };

  const restoreGrid = (call: Call, grid: GridJob | undefined) => {
    if (grid === undefined || grid.frames.length === 0 || call.visualSession !== grid.session)
      return;
    reportDropped(call, grid.source, call.harvest.restore(grid.frames));
  };

  const gridVisual = async (
    call: Call,
    grid: GridJob | undefined,
  ): Promise<{ visual: VoiceCallSentVisual | undefined; waitedMs: number }> => {
    if (grid === undefined) return { visual: undefined, waitedMs: 0 };
    const unseen =
      deps.seesImages !== undefined && !(await deps.seesImages(call.slug).catch(() => true));
    await commitsWritten(call, grid.written);
    let visual: VoiceCallSentVisual | undefined;
    let waitedMs = 0;
    if (grid.frames.length === 0) {
      const last = call.lastGrid;
      if (last !== undefined && last.session === grid.session)
        visual = { source: grid.source, sameAs: last.messageId };
    } else {
      const waitFrom = now();
      try {
        visual = await grid.result;
      } catch (error) {
        const message =
          error instanceof CallFrameError ? error.message : 'The grid image could not be built.';
        if (!ended(call))
          wiring.push(call, { type: 'grid-failed', message: message.slice(0, 200) });
        log('call-grid-failed', { call: call.id, message: message.slice(0, 200) });
      }
      waitedMs = now() - waitFrom;
    }
    if (unseen && visual !== undefined && 'image' in visual) {
      visual = { ...visual, unseen: true };
      log('call-grid-unseen', { call: call.id, source: visual.source });
    }
    return { visual, waitedMs };
  };

  const gridSent = (
    call: Call,
    grid: GridJob | undefined,
    visual: VoiceCallSentVisual | undefined,
    messageId: string,
    waitedMs: number,
  ) => {
    if (visual !== undefined && 'image' in visual) {
      if (grid !== undefined && call.visualSession === grid.session)
        call.lastGrid = { source: visual.source, session: grid.session, messageId };
      keep(call, messageId, visual.source, grid?.picked ?? []);
      wiring.push(call, {
        type: 'grid-sent',
        grid: grid?.id ?? 0,
        messageId,
        layout: visual.image.layout,
        waitedMs,
      });
    } else if (visual !== undefined && 'sameAs' in visual)
      wiring.push(call, { type: 'grid-unchanged', messageId, sameAs: visual.sameAs });
  };

  return {
    clearKeptFrames,
    release,
    zoom,
    visualBase,
    reportDropped,
    commit,
    harvest,
    takeGrid,
    restoreGrid,
    gridVisual,
    gridSent,
  };
}
