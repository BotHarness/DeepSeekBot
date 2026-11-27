import type { AttachmentStore, ImageAttachmentRef } from '@deepseek-ai/dsh-attachment';
import { defineTool, type ToolDefinition } from '@deepseek-ai/dsh-tools';
import { GENUI_STYLE_GUIDANCE } from '../../channels/genui-appearance.js';
import { compileGenuiDiagram } from '../../runtime/genui-diagram.js';
import {
  expandGenuiContent,
  genuiPreviews,
  type GenuiPreviewStore,
} from '../../runtime/genui-authoring.js';
import {
  GenuiPreviewError,
  previewGenuiDocument,
  type GenuiPreviewDiagnostic,
} from '../../runtime/genui-preview.js';

const WIDTH_TEXT = /^\s*(\d{1,4})\s*(?:px)?\s*$/iu;

function widthArgument(value: number | string | undefined): number | undefined {
  if (typeof value !== 'string') return value;
  const digits = WIDTH_TEXT.exec(value)?.[1];
  return digits === undefined ? Number.NaN : Number(digits);
}

function widthParameter(description: string) {
  return {
    oneOf: [{ type: 'integer' }, { type: 'string' }],
    description,
  } as const;
}

export function createGenuiDiagramTool(
  options: {
    onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  } = {},
) {
  return defineTool({
    name: 'genui_diagram',
    description:
      'Check bounded Mermaid with the product-pinned Pele compiler and return its offline SVG. Supported: flowchart, sequenceDiagram, xychart-beta. You do not need this tool to publish a diagram: write <genui-diagram>Mermaid source</genui-diagram> in your version:2 HTML and genui_preview/bot_send_message compile it into the same SVG. Use it only to debug a diagram that fails. No links, images, callbacks, network, publication or business actions. Never paste a renderer library into a message.',
    parameters: {
      source: {
        type: 'string',
        required: true,
        description:
          'Mermaid source up to 8 KiB UTF-8. Diagram links/images are disabled. Quote CJK XY category labels, for example x-axis ["一月", "二月"]. Unsupported families or syntax fail explicitly.',
      },
      width: widthParameter(
        'Layout width in CSS pixels, 240–1600, such as 728; default 728. SVG scales, but layout is fixed before publication.',
      ),
    },
    output: {
      schema: { type: 'string' },
      render: (_args, value) => [{ type: 'text' as const, text: value }],
    },
    execute: async (args, execution) =>
      JSON.stringify(
        await compileGenuiDiagram(args.source, widthArgument(args.width), {
          signal: execution.signal,
          onDiagnostic: options.onDiagnostic,
        }),
      ),
  });
}

export function createGenuiPreviewTool(options: {
  saveImage: (data: Uint8Array) => Promise<ImageAttachmentRef>;
  scope?: string | undefined;
  previews?: GenuiPreviewStore | undefined;
  onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  browserPath?: string | undefined;
}) {
  return defineTool({
    name: 'genui_preview',
    description: `Preview a self-contained version:2 GenUI HTML document before explicitly publishing it. Returns a screenshot, bounded diagnostics and genui_preview_id; publish exactly the previewed document with bot_send_message genui_preview_id instead of repeating genui_json. Never publishes a message or performs business actions. No remote scripts, fonts or network requests. ${GENUI_STYLE_GUIDANCE} For flowchart, sequenceDiagram and xychart-beta write <genui-diagram>Mermaid source</genui-diagram> (optional width="240–1600") where the figure belongs; it compiles to an offline SVG. Never include a renderer library or hand-written diagram SVG. Use CSS variables and window.genui.getState()/setState(values) for registered private state; listen for genui:state after restore. The document is untrusted and has no Host/tool access.`,
    parameters: {
      genui_json: {
        type: 'string',
        required: true,
        description:
          'Complete document JSON (256 KiB max), for example {"version":2,"snapshotId":"weekly-1","observedAt":"2026-11-24T09:00:00+09:00","title":"Weekly report","html":"<h1>…</h1>"}. html is at most 192 KiB after diagrams compile and may contain inline CSS, scripts, SVG and <genui-diagram> Mermaid; no remote assets. Optional predecessorMessageId; optional stateContract {"version":1,"fields":{"key":{"type":"string|number|boolean|choice","initial":…}}} with at most 16 fields (string maxLength<=500; number min/max; choice options<=20).',
      },
      width: widthParameter(
        'Preview width in CSS pixels, 240–1600, such as 728; default 728. A tool argument beside genui_json, not a document key.',
      ),
      theme: {
        type: 'string',
        enum: ['light', 'dark'],
        description: 'Document appearance; default dark. A tool argument, not a document key.',
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
      const document = await expandGenuiContent(JSON.parse(args.genui_json), {
        signal: execution.signal,
      });
      const width = widthArgument(args.width);
      const result = await previewGenuiDocument(document, {
        ...(width === undefined ? {} : { width }),
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
      (options.previews ?? genuiPreviews).remember(
        options.scope ?? '',
        diagnostics.documentId,
        document,
      );
      return JSON.stringify({ ...diagnostics, genui_preview_id: diagnostics.documentId, image });
    },
  });
}

export type GenuiAttachmentReader = () => Pick<AttachmentStore, 'saveImage'> | undefined;

export interface GenuiToolOptions {
  browserPath?: string | undefined;
  onDiagnostic?: ((event: GenuiPreviewDiagnostic) => void) | undefined;
  getFallbackAttachments?: GenuiAttachmentReader | undefined;
}

export function registerGenuiTools(
  getAttachments: GenuiAttachmentReader,
  registerTool: (tool: ToolDefinition) => unknown,
  options: GenuiToolOptions & { scope: string },
): void {
  registerTool(
    createGenuiDiagramTool({
      onDiagnostic: (event) => options.onDiagnostic?.({ ...event, component: 'diagram' }),
    }),
  );
  registerTool(
    createGenuiPreviewTool({
      browserPath: options.browserPath,
      scope: options.scope,
      onDiagnostic: options.onDiagnostic,
      saveImage: async (data) => {
        const attachments = getAttachments() ?? options.getFallbackAttachments?.();
        if (attachments === undefined) throw new Error('DSH attachment service is unavailable.');
        return attachments.saveImage({ data, mediaType: 'image/png', name: 'GenUI preview' });
      },
    }),
  );
}
