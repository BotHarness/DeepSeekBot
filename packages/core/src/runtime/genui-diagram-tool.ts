import { defineTool } from '@deepseek-ai/dsh-tools';
import { compileGenuiDiagram } from './genui-diagram.js';
import type { GenuiPreviewDiagnostic } from './genui-preview.js';

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
