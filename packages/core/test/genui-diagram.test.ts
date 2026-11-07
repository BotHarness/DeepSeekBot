import { describe, expect, it } from 'vitest';
import { Worker } from 'node:worker_threads';
import { compileGenuiDiagram, GENUI_DIAGRAM_LIMITS } from '../src/runtime/genui-diagram.js';
import { GENUI_DEFAULT_CSS } from '../src/channels/genui-appearance.js';

describe('offline GenUI diagram compiler', () => {
  it.each([
    ['flowchart', 'flowchart LR\n A[用户] --> B[可视化结果]'],
    ['sequence', 'sequenceDiagram\n participant H as 用户\n H->>B: 查看报告\n B-->>H: 结果'],
    [
      'xychart',
      'xychart-beta\n x-axis ["一月", "二月", "三月"]\n y-axis -10 --> 20\n bar [-5, 0, 15]\n line [4, 8, 12]',
    ],
  ])('compiles %s without a browser or model', async (family, source) => {
    const result = await compileGenuiDiagram(source, 728);
    expect(result.family).toBe(family);
    expect(result.svg).toContain('<svg');
    expect(result.compiler).toBe('pele@1.13.0');
    expect(result.sourceSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.svgSha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(result.bytes).toBe(Buffer.byteLength(result.svg));
    expect(result.bytes).toBeLessThanOrEqual(GENUI_DIAGRAM_LIMITS.svgBytes);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it('produces identical immutable SVG bytes for repeated input', async () => {
    const source = 'flowchart LR\n A[Draft] --> B[Done]';
    const first = await compileGenuiDiagram(source, 728);
    const second = await compileGenuiDiagram(source, 728);
    expect(second.svg).toBe(first.svg);
    expect(second.svgSha256).toBe(first.svgSha256);
    expect(second.sourceSha256).toBe(first.sourceSha256);
  });

  it('keeps actual Pele XY axis strokes visible while flowchart node borders are decorative', async () => {
    const result = await compileGenuiDiagram('xychart-beta\n x-axis ["A", "B"]\n bar [1, 2]', 728);
    expect(result.svg).toContain('class="pele-axis"');
    expect(result.svg).toContain('stroke="var(--_b)"');
    expect(GENUI_DEFAULT_CSS).toContain('--pele-border:var(--axis)');
    expect(GENUI_DEFAULT_CSS).toContain(':where(.pele-flowchart) { --pele-border:transparent }');
  });

  it('does not expose source-authored links', async () => {
    const result = await compileGenuiDiagram(
      'flowchart LR\n A[Read] --> B[Report]\n click A "https://example.invalid" "Open"',
      728,
    );
    expect(result.svg).not.toMatch(/\bhref\s*=/u);
    expect(result.svg).not.toContain('example.invalid');
  });

  it.each(['', 'x'.repeat(GENUI_DIAGRAM_LIMITS.sourceBytes + 1), '用户'.repeat(2000)])(
    'refuses invalid or UTF-8-oversize input before creating a worker',
    async (source) => {
      let spawned = false;
      await expect(
        compileGenuiDiagram(source, 728, {
          spawn: () => {
            spawned = true;
            throw new Error('must not spawn');
          },
        }),
      ).rejects.toMatchObject({ code: 'genui-diagram-input' });
      expect(spawned).toBe(false);
    },
  );

  it.each([239, 1601, 1.5, Number.NaN])('refuses invalid width %s', async (width) => {
    await expect(compileGenuiDiagram('flowchart LR\n A --> B', width)).rejects.toMatchObject({
      code: 'genui-diagram-input',
    });
  });

  it.each(['pie\n "A": 2', 'flowchart LR\n A[', 'not a diagram'])(
    'refuses unsupported/invalid syntax',
    async (source) => {
      await expect(compileGenuiDiagram(source, 728)).rejects.toMatchObject({
        code: 'genui-diagram-invalid',
      });
    },
  );

  it('rejects an already-cancelled request before starting work', async () => {
    await expect(
      compileGenuiDiagram('flowchart LR\n A --> B', 728, {
        signal: AbortSignal.abort(),
      }),
    ).rejects.toThrow();
  });

  it('cancels an active worker and refuses concurrent work without queuing', async () => {
    const controller = new AbortController();
    let stalled: Worker | undefined;
    const pending = compileGenuiDiagram('flowchart LR\n A --> B', 728, {
      signal: controller.signal,
      spawn: () => (stalled = new Worker('setInterval(() => {}, 1000)', { eval: true })),
    });
    const cancelled = expect(pending).rejects.toThrow('Synthetic cancellation');
    await expect(compileGenuiDiagram('flowchart LR\n A --> B', 728)).rejects.toMatchObject({
      code: 'genui-diagram-busy',
    });
    controller.abort(new Error('Synthetic cancellation'));
    await cancelled;
    expect(stalled?.threadId).toBe(-1);
  });

  it('enforces the SVG budget in UTF-8 bytes independently of character limits', async () => {
    const reply = {
      ok: true,
      svg: '图'.repeat(20_000),
      family: 'flowchart',
      width: 100,
      height: 100,
    };
    await expect(
      compileGenuiDiagram('flowchart LR\n A --> B', 728, {
        spawn: () =>
          new Worker(
            `require('node:worker_threads').parentPort.postMessage(${JSON.stringify(reply)})`,
            { eval: true },
          ),
      }),
    ).rejects.toMatchObject({ code: 'genui-diagram-output' });
  });

  it('fences excessive graph complexity and recovers after worker startup errors', async () => {
    const source =
      'flowchart LR\n' +
      Array.from({ length: 130 }, (_, index) => `A${index} --> A${index + 1}`).join('\n');
    await expect(compileGenuiDiagram(source, 728)).rejects.toMatchObject({
      code: 'genui-diagram-invalid',
    });
    await expect(
      compileGenuiDiagram('flowchart LR\n A --> B', 728, {
        spawn: () => new Worker('throw new Error("Synthetic worker failure")', { eval: true }),
      }),
    ).rejects.toMatchObject({ code: 'genui-diagram-worker' });
    expect((await compileGenuiDiagram('flowchart LR\n A --> B', 728)).family).toBe('flowchart');
  });

  it('terminates a stalled worker, releases concurrency and records bounded diagnostics', async () => {
    const phases: string[] = [];
    let stalled: Worker | undefined;
    await expect(
      compileGenuiDiagram('flowchart LR\n A --> B', 728, {
        deadlineMs: 30,
        spawn: () => (stalled = new Worker('setInterval(() => {}, 1000)', { eval: true })),
        onDiagnostic: (event) => phases.push(event.phase),
      }),
    ).rejects.toMatchObject({ code: 'genui-diagram-timeout' });
    expect(stalled?.threadId).toBe(-1);
    expect(phases).toEqual(['starting', 'refused', 'stopped']);
    expect((await compileGenuiDiagram('flowchart LR\n A --> B', 728)).family).toBe('flowchart');
  });
});
