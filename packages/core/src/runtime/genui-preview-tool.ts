import { defineTool } from '@deepseek-ai/dsh-tools';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { previewGenuiDocument, type GenuiPreviewDiagnostic } from './genui-preview.js';
import { GENUI_STYLE_GUIDANCE } from '../channels/genui-appearance.js';

export function createGenuiPreviewTool(options: {
  saveImage: (data: Uint8Array) => Promise<ImageAttachmentRef>;
  onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
}) {
  return defineTool({
    name: 'genui_preview',
    description: `Preview a self-contained version:2 GenUI HTML document before explicitly publishing it with bot_send_message genui_json. Returns a screenshot and bounded diagnostics; never publishes a message or performs business actions. No remote scripts, fonts or network requests. ${GENUI_STYLE_GUIDANCE} Compile supported Mermaid with genui_diagram and embed its SVG unchanged; never include a renderer library. Use CSS variables and window.genui.getState()/setState(values) for registered private state; listen for genui:state after restore. The document is untrusted and has no Host/tool access.`,
    parameters: {
      genui_json: {
        type: 'string',
        required: true,
        description:
          'Complete version:2 document JSON (256 KiB max): snapshotId, observedAt ISO timestamp, title, html (192 KiB max), optional stateContract and predecessorMessageId. HTML may contain inline CSS, scripts and SVG; no remote assets.',
      },
      width: { type: 'integer', description: 'Preview width 240–1600 CSS pixels; default 728.' },
      theme: {
        type: 'string',
        enum: ['light', 'dark'],
        description: 'Document appearance; default dark.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => {
        const result = JSON.parse(value) as Omit<
          Awaited<ReturnType<typeof previewGenuiDocument>>,
          'screenshot'
        > & { image: ImageAttachmentRef };
        const { image, ...diagnostics } = result;
        return [
          { type: 'text' as const, text: JSON.stringify(diagnostics) },
          { type: 'image' as const, attachment: image },
        ];
      },
    },
    execute: async (args, execution) => {
      if (new TextEncoder().encode(args.genui_json).length > 262_144)
        throw new Error('GenUI JSON exceeds its 256 KiB budget.');
      const result = await previewGenuiDocument(JSON.parse(args.genui_json), {
        ...(args.width === undefined ? {} : { width: args.width }),
        theme: args.theme === 'light' ? 'light' : 'dark',
        signal: execution.signal,
        ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
      });
      execution.signal.throwIfAborted();
      const { screenshot, ...diagnostics } = result;
      const image = await options.saveImage(Buffer.from(screenshot.data, 'base64'));
      return JSON.stringify({ ...diagnostics, image });
    },
  });
}
