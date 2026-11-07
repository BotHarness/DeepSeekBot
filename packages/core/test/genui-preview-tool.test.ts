import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolRunContext } from '@deepseek-ai/dsh-tools';
import { ToolCallId } from '@deepseek-ai/dsh-llm';

const preview = vi.hoisted(() => vi.fn());
vi.mock('../src/runtime/genui-preview.js', () => ({ previewGenuiDocument: preview }));
import { createGenuiPreviewTool } from '../src/runtime/genui-preview-tool.js';

const execution: ToolRunContext = {
  callId: ToolCallId('preview-test'),
  rootCallId: ToolCallId('preview-test'),
  token: Symbol('preview-test') as ToolRunContext['token'],
  name: 'genui_preview',
  arguments: {},
  signal: new AbortController().signal,
  deferContext: () => undefined,
  concludeTurn: () => undefined,
};

beforeEach(() => {
  preview.mockReset();
  preview.mockResolvedValue({
    documentId: 'a'.repeat(64),
    policyVersion: 'botharness-html-1',
    width: 728,
    height: 100,
    diagnostics: [],
    screenshot: { mimeType: 'image/png', data: Buffer.from('synthetic-image').toString('base64') },
  });
});

describe('GenUI preview Tool', () => {
  it('stores a native image attachment without returning raw screenshot bytes to the model', async () => {
    const saveImage = vi.fn().mockResolvedValue({ type: 'image', id: 'synthetic-image' });
    const tool = createGenuiPreviewTool({ saveImage });
    const value = await tool.execute({ genui_json: '{}' }, execution);
    if (typeof value !== 'string') throw new Error('Expected serialized preview result.');
    expect(saveImage).toHaveBeenCalledWith(Buffer.from('synthetic-image'));
    expect(JSON.parse(value)).toMatchObject({
      documentId: 'a'.repeat(64),
      image: { id: 'synthetic-image' },
    });
    expect(value).not.toContain('screenshot');
    expect(tool.output?.render?.({ genui_json: '{}' }, value)).toEqual([
      {
        type: 'text',
        text: JSON.stringify({
          documentId: 'a'.repeat(64),
          policyVersion: 'botharness-html-1',
          width: 728,
          height: 100,
          diagnostics: [],
        }),
      },
      { type: 'image', attachment: { type: 'image', id: 'synthetic-image' } },
    ]);
  });

  it('refuses oversized JSON before launching a browser', async () => {
    const tool = createGenuiPreviewTool({ saveImage: vi.fn() });
    await expect(tool.execute({ genui_json: 'x'.repeat(262_145) }, execution)).rejects.toThrow(
      '256 KiB',
    );
    expect(preview).not.toHaveBeenCalled();
  });

  it('does not save an image after cancellation', async () => {
    const saveImage = vi.fn();
    const tool = createGenuiPreviewTool({ saveImage });
    await expect(
      tool.execute({ genui_json: '{}' }, { ...execution, signal: AbortSignal.abort() }),
    ).rejects.toThrow();
    expect(saveImage).not.toHaveBeenCalled();
  });
});
