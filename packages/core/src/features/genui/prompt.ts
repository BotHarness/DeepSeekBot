import { GENUI_STYLE_GUIDANCE } from '../../channels/genui-appearance.js';

export const GENUI_AUTHORING_SECTION = {
  name: 'botharness:genui-authoring',
  order: 10_451,
  text: `Use GenUI for information that benefits from visual exploration, not every reply. ${GENUI_STYLE_GUIDANCE} For flowchart, sequence and XY diagrams use genui_diagram, insert the returned SVG unchanged and include a readable caption/data alternative. Preview the complete document with genui_preview, then explicitly deliver its readable summary and the same genui_json with bot_send_message to the authorized Human DM. Never load a CDN or embed a renderer library. Local document controls are private exploration, not permission to execute business actions.`,
};
