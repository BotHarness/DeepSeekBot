import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';
import { avatarsCss } from './styles.js';
import { personabotsCss } from '../personabots/styles.js';

export const AVATAR_EDITOR_CSS = [
  avatarsCss.avatarMediaComposed,
  `.bh-avatar-editor { display: grid; grid-template-columns: 160px minmax(0, 1fr); gap: ${space.x6}; align-items: start; }
`,
  avatarsCss.avatarEditorPreview,
  `.bh-avatar-families button { min-height: 26px; padding: 0 ${space.x4}; border: 0; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
`,
  avatarsCss.avatarFamilies,
  `.bh-avatar-ranges { display: flex; flex-direction: column; gap: ${space.x3}; max-width: 360px; }
.bh-avatar-ranges label { display: grid; grid-template-columns: 72px minmax(0, 1fr) 28px; align-items: center; gap: ${space.x3}; font-size: ${text.bodySize}; color: var(--tobs-ink-secondary); }
`,
  avatarsCss.avatarRanges,
  `.bh-avatar-categories button { min-height: 28px; padding: 0 ${space.x3}; border: ${border.hairline} solid transparent; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.bodySize}; cursor: pointer; }
`,
  avatarsCss.avatarCategories,
  `.bh-avatar-options { display: grid; grid-template-columns: repeat(auto-fill, minmax(56px, 1fr)); gap: ${space.x3}; }
`,
  avatarsCss.avatarOption,
  `.bh-part-divider { width: 1px; height: 20px; background: var(--tobs-line-edge); }
`,
  avatarsCss.partOptions,
  `.bh-part-cursor { position: absolute; box-sizing: border-box; border: ${border.focus} solid var(--tobs-ink-primary); box-shadow: 0 0 0 1px var(--tobs-layer-canvas); pointer-events: none; }
.bh-part-draw { align-self: stretch; min-width: 88px; padding: 0 ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: var(--tobs-ink-primary); font: inherit; touch-action: none; user-select: none; }
`,
  avatarsCss.partWorkspace,
  `.bh-part-grid { position: absolute; inset: 0 0 auto 0; display: grid; outline: ${border.focus} dashed var(--tobs-ink-secondary); outline-offset: -1px; }
.bh-part-cell { box-shadow: inset 0 0 0 0.5px var(--tobs-line-edge); cursor: crosshair; }
`,
  avatarsCss.partCell,
  `.bh-part-preview svg { display: block; width: 32px; height: 32px; image-rendering: pixelated; }
`,
  avatarsCss.partPalette,
  `.bh-part-swatch { width: 18px; height: 18px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.xs}; cursor: pointer; }
.bh-part-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 1px; }
`,
  avatarsCss.partName,
  `.bh-part-name input { flex: 1; min-height: 30px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: inherit; font: inherit; }
`,
  avatarsCss.partLibraryActions,
  `.bh-part-image input, .bh-part-image select { min-height: 28px; padding: 0 ${space.x2}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); color: inherit; font: inherit; }
.bh-part-image input { width: 72px; }
.bh-avatar-color-reset { min-height: 26px; padding: 0 ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: transparent; color: var(--tobs-ink-secondary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
`,
  avatarsCss.avatarColors,
  `.bh-avatar-color-row > span { width: 72px; color: var(--tobs-ink-secondary); }
.bh-avatar-swatch { width: 24px; height: 24px; padding: 0; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; cursor: pointer; }
.bh-avatar-swatch[aria-pressed='true'] { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
.bh-avatar-color-row input { width: 32px; height: 26px; padding: 0 ${space.x1}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.sm}; background: var(--tobs-layer-canvas); }
.bh-avatar-editor-fields :focus-visible { outline: ${border.focus} solid var(--tobs-ink-primary); outline-offset: 2px; }
`,
  avatarsCss.composedAvatarRaster,
  `@media (max-width: 640px) { .bh-avatar-editor { grid-template-columns: minmax(0, 1fr); } .bh-avatar-options { grid-template-columns: repeat(auto-fill, minmax(48px, 1fr)); } }
`,
  personabotsCss.bannerArt,
].join('');
