import type { Context } from '@deepseek-ai/cordis';
import type { ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { GENUI_STYLE_GUIDANCE } from '../../channels/genui-appearance.js';
import { compileGenuiDiagram } from '../../runtime/genui-diagram.js';
import {
  GenuiPreviewError,
  previewGenuiDocument,
  type GenuiPreviewDiagnostic,
} from '../../runtime/genui-preview.js';

export function createGenuiDiagramTool(
  options: {
    onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  } = {},
) {
  return defineTool({
    name: 'genui_diagram',
    description:
      'Compile bounded Mermaid to offline SVG with the product-pinned Pele compiler. Supported: flowchart, sequenceDiagram, xychart-beta. Insert the returned SVG unchanged into your version:2 HTML, add a readable caption/data alternative, preview with genui_preview, then explicitly publish with bot_send_message. No links, images, callbacks, network, publication or business actions. Never paste a renderer library into a message. SVG uses product theme variables; keep category-to-series colors stable and provide non-color cues.',
    parameters: {
      source: {
        type: 'string',
        required: true,
        description:
          'Mermaid source up to 8 KiB UTF-8. Diagram links/images are disabled. Unsupported families or syntax fail explicitly.',
      },
      width: {
        type: 'integer',
        description:
          'Integer layout width 240–1600 CSS pixels; default 728. SVG scales, but layout is fixed before publication.',
      },
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text' as const, text: value }],
    },
    execute: async (args, execution) =>
      JSON.stringify(
        await compileGenuiDiagram(args.source, args.width, {
          signal: execution.signal,
          onDiagnostic: options.onDiagnostic,
        }),
      ),
  });
}

export function createGenuiPreviewTool(options: {
  saveImage: (data: Uint8Array) => Promise<ImageAttachmentRef>;
  onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  browserPath?: string | undefined;
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
        ...(options.browserPath === undefined ? {} : { browserPath: options.browserPath }),
        ...(options.onDiagnostic === undefined ? {} : { onDiagnostic: options.onDiagnostic }),
      });
      execution.signal.throwIfAborted();
      const { screenshot, ...diagnostics } = result;
      const image = await options.saveImage(Buffer.from(screenshot.data, 'base64')).catch(() => {
        throw new GenuiPreviewError(
          'genui-preview-image-unavailable',
          'The preview rendered, but its image could not be saved.',
        );
      });
      return JSON.stringify({ ...diagnostics, image });
    },
  });
}

export function registerGenuiTools(
  agentCtx: Pick<Context, 'get'>,
  registerTool: (tool: ToolDefinition) => unknown,
  options: {
    browserPath: string | undefined;
    onDiagnostic: ((event: GenuiPreviewDiagnostic) => void) | undefined;
    attachmentContext: Pick<Context, 'get'> | undefined;
  },
): void {
  registerTool(
    createGenuiDiagramTool({
      onDiagnostic: (event) => options.onDiagnostic?.({ ...event, component: 'diagram' }),
    }),
  );
  registerTool(
    createGenuiPreviewTool({
      browserPath: options.browserPath,
      onDiagnostic: options.onDiagnostic,
      saveImage: async (data) => {
        const attachments =
          agentCtx.get('attachments') ?? options.attachmentContext?.get('attachments');
        if (attachments === undefined) throw new Error('DSH attachment service is unavailable.');
        return attachments.saveImage({ data, mediaType: 'image/png', name: 'GenUI preview' });
      },
    }),
  );
}
