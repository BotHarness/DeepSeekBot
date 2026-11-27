import { describe, expect, it, vi } from 'vitest';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';
import { createGenuiDiagramTool } from '../src/features/genui/tools.js';

const execution: ToolRunContext = {
  callId: ToolCallId('diagram-test'),
  rootCallId: ToolCallId('diagram-test'),
  token: Symbol('diagram-test') as ToolRunContext['token'],
  name: 'genui_diagram',
  arguments: {},
  signal: new AbortController().signal,
  deferContext: () => undefined,
  concludeTurn: () => undefined,
};

describe('GenUI diagram authoring Tool', () => {
  it('returns offline immutable SVG and bounded lifecycle diagnostics without publishing', async () => {
    const diagnostic = vi.fn();
    const tool = createGenuiDiagramTool({ onDiagnostic: diagnostic });
    const output = await tool.execute({ source: 'flowchart LR\n A[输入] --> B[结果]' }, execution);
    if (typeof output !== 'string') throw new Error('Expected serialized diagram result.');
    expect(JSON.parse(output)).toMatchObject({ compiler: 'pele@1.13.0', family: 'flowchart' });
    expect(tool.output.render?.({}, output)).toEqual([{ type: 'text', text: output }]);
    expect(diagnostic.mock.calls.map(([event]) => event.phase)).toEqual([
      'starting',
      'completed',
      'stopped',
    ]);
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('输入');
  });

  it('compiles a width written as a numeric string exactly like the integer', async () => {
    const tool = createGenuiDiagramTool();
    const source = 'flowchart LR\n A --> B';
    const integer = await tool.execute({ source, width: 720 }, execution);
    expect(await tool.execute({ source, width: '720' }, execution)).toBe(integer);
    expect(await tool.execute({ source, width: '720px' }, execution)).toBe(integer);
    await expect(tool.execute({ source, width: 'wide' }, execution)).rejects.toThrow(
      /integer width from 240 to 1600/u,
    );
  });

  it('honors direct-call cancellation', async () => {
    await expect(
      createGenuiDiagramTool().execute(
        { source: 'flowchart LR\n A --> B' },
        { ...execution, signal: AbortSignal.abort() },
      ),
    ).rejects.toThrow();
  });
});
