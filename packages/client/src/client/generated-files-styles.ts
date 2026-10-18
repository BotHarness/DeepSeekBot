import { color, radius, size, space } from './ds/tokens.stylex.js';

export const GENERATED_FILES_CSS = `
.bh-generated-files { box-sizing: border-box; display: flex; flex-direction: column; min-height: 0; height: 100%; overflow: auto; padding: 0; }
.bh-generated-files-list:empty { display: none; }
.bh-generated-files-list { display: flex; flex-direction: column; margin: 0; padding: 0; list-style: none; }
.bh-generated-file { min-width: 0; padding: 0; }
.bh-generated-file:hover { background: ${color.hover}; }
.bh-generated-file .bh-message-attachment { width: 100%; min-width: 0; }
.bh-generated-file .bh-message-file { box-sizing: border-box; flex-wrap: wrap; gap: ${space.x1} ${space.x3}; width: 100%; max-width: 100%; min-height: ${size.row}; padding: ${space.x2} ${space.x3}; border-radius: 0; background: transparent; }
.bh-generated-file .bh-message-file-main { flex: 1 1 18ch; max-width: 100%; }
.bh-generated-file .bh-message-file-icon { width: ${space.x5}; height: ${space.x5}; }
.bh-generated-file .bh-message-file-copy { flex-direction: row; align-items: baseline; gap: ${space.x3}; }
.bh-generated-file .bh-message-file-name { flex: 1; }
.bh-generated-file .bh-message-file-size { flex: none; }
.bh-generated-file .bh-message-file-divider { display: none; }
.bh-channel-file-actions { display: flex; flex: none; align-items: center; justify-content: flex-end; gap: ${space.x1}; margin-inline-start: auto; }
.bh-generated-file .bh-message-file-download { width: ${size.icon}; height: ${size.icon}; }
.bh-generated-file .bh-file-open { border: 0; background: transparent; }
.bh-generated-file .bh-file-open-more { border: 0; }
.bh-generated-file [data-file-reference][aria-pressed='true'] { color: ${color.accent}; background: ${color.accentTint}; border-radius: ${radius.sm}; }
`;
