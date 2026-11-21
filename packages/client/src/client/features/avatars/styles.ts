import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const avatarsCss = {
  avatarMediaComposed: `.bh-avatar-media-composed svg { overflow: visible; }
.bh-illustrated-head { transform-box: fill-box; transform-origin: 50% 65%; }
.bh-illustrated-gaze { transform-box: fill-box; transform-origin: center; }
`,
  avatarEditorPreview: `.bh-avatar-editor-preview { display: flex; align-items: center; justify-content: center; }
.bh-avatar-editor-preview .bh-avatar-media-image { border-radius: 0; }
.bh-avatar-editor-controls h3 { margin: 0; font-size: ${text.titleSize}; }
.bh-avatar-editor-controls p { margin: ${space.x3} 0 ${space.x4}; color: var(--tobs-ink-secondary); font-size: ${text.bodySize}; }
.bh-avatar-editor-fields { border: 0; margin: 0 0 ${space.x4}; padding: 0; display: flex; flex-direction: column; gap: ${space.x4}; min-width: 0; }
.bh-avatar-families { display: inline-flex; gap: ${space.x1}; padding: ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; align-self: flex-start; }
`,
  avatarFamilies: `.bh-avatar-families button[aria-checked='true'] { background: var(--tobs-layer-elevated); color: var(--tobs-ink-primary); }
`,
  avatarRanges: `.bh-avatar-ranges output { text-align: right; color: var(--tobs-ink-primary); }
.bh-avatar-categories { display: flex; flex-wrap: wrap; align-items: flex-start; gap: ${space.x2}; }
.bh-avatar-categories [role='tablist'] { display: flex; flex-wrap: wrap; gap: ${space.x2}; flex: 1; min-width: 0; }
`,
  avatarCategories: `.bh-avatar-categories button:hover { background: var(--bh-hover); }
.bh-avatar-categories button[aria-selected='true'] { background: var(--tobs-layer-elevated); border-color: var(--tobs-line-edge); color: var(--tobs-ink-primary); }
.bh-avatar-categories .bh-avatar-shuffle { margin-left: auto; border-color: var(--tobs-line-edge); color: var(--tobs-ink-primary); }
`,
  avatarOption: `.bh-avatar-option { aspect-ratio: 1; padding: ${space.x1}; border: ${border.focus} solid transparent; border-radius: ${radius.md}; background: transparent; cursor: pointer; }
.bh-avatar-option span, .bh-avatar-option svg { display: block; width: 100%; height: 100%; }
.bh-avatar-option:hover { border-color: var(--tobs-line-edge); }
.bh-avatar-option[aria-pressed='true'] { border-color: var(--tobs-ink-primary); }
.bh-avatar-hidden-note { grid-column: 1 / -1; margin: 0; color: var(--tobs-ink-secondary); font-size: ${text.bodySize}; }
.bh-part-editor { grid-column: 1 / -1; display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-part-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; }
.bh-part-toolbar > button { flex-shrink: 0; }
.bh-avatar-editor-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; }
.bh-part-toolbar > button[aria-pressed='true'], .bh-part-toolbar > button[aria-pressed='true']:hover,
.bh-part-options button[aria-pressed='true']:not(.bh-part-swatch), .bh-part-options button[aria-pressed='true']:not(.bh-part-swatch):hover { background: ${color.selected}; color: ${color.fg}; box-shadow: inset 0 0 0 ${border.hairline} ${color.borderStrong}; }
`,
  partOptions: `.bh-part-options { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2} ${space.x4}; font-size: ${text.bodySize}; }
.bh-part-options > span, .bh-part-options label { display: inline-flex; align-items: center; gap: ${space.x2}; }
.bh-part-options small { color: var(--tobs-ink-secondary); }
.bh-part-hint { flex-basis: 100%; }
`,
  partWorkspace: `.bh-part-workspace { display: flex; flex-wrap: wrap; gap: ${space.x4}; align-items: flex-start; }
.bh-part-canvas { position: relative; flex: none; max-width: 100%; overflow: hidden; border-radius: ${radius.sm}; touch-action: none; user-select: none; }
.bh-part-backdrop { position: absolute; inset: 0; opacity: 0.38; pointer-events: none; }
.bh-part-backdrop svg { display: block; width: 100%; height: 100%; image-rendering: pixelated; }
`,
  partCell: `.bh-part-cell[data-part-other='true'] { opacity: 0.45; }
.bh-part-side { display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-part-preview { display: flex; align-items: center; gap: ${space.x3}; color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; }
`,
  partPalette: `.bh-part-palette { display: grid; grid-template-columns: repeat(2, auto); gap: ${space.x2} ${space.x3}; }
.bh-part-palette-row { display: flex; gap: ${space.x1}; }
`,
  partName: `.bh-part-name { display: flex; align-items: center; gap: ${space.x3}; font-size: ${text.bodySize}; }
`,
  partLibraryActions: `.bh-part-library-actions { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: ${space.x2}; }
.bh-part-image { grid-column: 1 / -1; display: flex; flex-direction: column; gap: ${space.x2}; padding: ${space.x3} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; font-size: ${text.bodySize}; }
.bh-part-image p { margin: 0; }
.bh-part-image label { display: flex; align-items: center; gap: ${space.x3}; }
`,
  avatarColors: `.bh-avatar-colors { display: flex; flex-direction: column; gap: ${space.x3}; }
.bh-avatar-color-row { display: flex; flex-wrap: wrap; align-items: center; gap: ${space.x2}; font-size: ${text.bodySize}; }
`,
  composedAvatarRaster: `.bh-avatar-media-composed svg { image-rendering: pixelated; }
`,
};
