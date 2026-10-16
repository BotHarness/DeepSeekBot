import { border, color, radius, space, text } from './ds/tokens.stylex.js';

export const GENERATED_FILES_CSS = `
.bh-generated-files { box-sizing: border-box; display: flex; flex-direction: column; gap: ${space.x2}; min-height: 0; height: 100%; overflow: auto; }
.bh-generated-files-empty { margin: 0; padding: ${space.x4} ${space.x2}; color: var(--dsw-alias-label-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-generated-files-list { display: flex; flex-direction: column; gap: ${space.x1}; margin: 0; padding: 0; list-style: none; }
.bh-generated-file { display: flex; flex-direction: column; align-items: stretch; gap: ${space.x1}; padding: ${space.x1} ${space.x2}; border-radius: ${radius.sm}; background: ${color.base}; }
.bh-generated-file:hover { background: ${color.hover}; }
.bh-generated-file .bh-message-attachment { width: 100%; min-width: 0; }
.bh-generated-file .bh-message-file { width: 100%; max-width: 100%; }
.bh-generated-file-reference { align-self: flex-end; flex: none; padding: ${space.x1} ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; outline: none; background: transparent; color: var(--dsw-alias-label-secondary); font: inherit; font-size: ${text.metaSize}; line-height: ${text.metaLine}; white-space: nowrap; cursor: pointer; }
.bh-generated-file-reference:hover { border-color: ${color.border}; background: ${color.hover}; color: var(--dsw-alias-label-primary); }
.bh-generated-file-reference:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: ${space.x1}; }
.bh-generated-file-reference[data-mounted='true'] { border-color: ${color.accent}; color: ${color.accent}; background: color-mix(in srgb, ${color.accent} 12%, transparent); }
.bh-generated-file-reference:disabled { opacity: 0.5; cursor: default; }
`;
