import { border, color, radius, space, text } from '../../ds/tokens.stylex.js';

export const appearanceCss = {
  botIcon: `.bh-bot-icon > svg,
.bh-bot-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Settings nav cell tagged by bot-icon-nav: hide the shell glyph, show ours. */
button.bh-bot-nav > svg {
  display: none;
}

`,
  botNavIcon: `.bh-bot-nav-icon > svg,
.bh-bot-nav-icon > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

/* Bot icon chooser: what you see is what you pick — one card per mark. */







.bh-settings-rows {
  display: flex;
  flex-direction: column;
}
.bh-channel-settings-caption {
  display: flex;
  align-items: center;
  gap: ${space.x3};
  min-width: 0;
  padding: ${space.x3} ${space.x4};
  border-radius: ${radius.md};
  background: var(--tobs-layer-raised);
}
`,
  channelSettingsCaptionText: `.bh-channel-settings-caption-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.bh-channel-settings-caption-kind {
  font-size: ${text.metaSize};
  line-height: ${text.metaLine};
  color: var(--tobs-ink-secondary);
}
.bh-channel-settings-caption-title {
  min-width: 0;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  overflow-wrap: anywhere;
  font-size: ${text.titleSize};
  font-weight: ${text.strong};
  line-height: ${text.bodyLine};
  color: var(--tobs-ink-primary);
}
.bh-settings-row {
  display: flex;
  align-items: center;
  gap: ${space.x4};
  padding: ${space.x4} 0;
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-settings-row-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: ${space.x1};
}
.bh-settings-row-desc {
  font-size: ${text.metaSize};
  font-weight: ${text.regular};
  line-height: ${text.metaLine};
  color: var(--tobs-ink-secondary);
}
`,
  sidebarOrderRow: `.bh-sidebar-order-row { position: relative; display: flex; align-items: flex-start; min-width: 0; }
.bh-sidebar-order-row[hidden] { display: none; }
.bh-sidebar-hidden-badge { flex: none; align-self: center; font-size: ${text.metaSize}; color: var(--tobs-ink-secondary); }
`,
  sidebarVisibilityToggle: `.bh-sidebar-visibility-toggle:hover { background: var(--tobs-state-hover); }
`,
  sidebarVisibilityToggleDisabled: `.bh-sidebar-visibility-toggle:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-row[data-dragging] { background: var(--tobs-state-hover); }
`,
  sidebarEditing: `.bh-sidebar-editing .bh-sidebar-order-row { cursor: grab; user-select: none; touch-action: none; }
.bh-sidebar-editing .bh-sidebar-order-row[data-dragging] { cursor: grabbing; }
`,
  sidebarOrderHandle: `.bh-sidebar-order-handle:hover { background: var(--tobs-state-hover); }
`,
  sidebarOrderToolbar: `.bh-sidebar-order-toolbar { padding: ${space.x3} ${space.x4} ${space.x4}; }
.bh-sidebar-order-hint { color: var(--tobs-ink-secondary); font-size: ${text.metaSize}; line-height: ${text.metaLine}; }
.bh-sidebar-order-actions { display: flex; flex-wrap: wrap; gap: ${space.x3}; margin-top: ${space.x3}; }
.bh-sidebar-order-actions button { border: 0; border-radius: ${radius.md}; padding: ${space.x2} ${space.x3}; background: var(--tobs-state-hover); color: var(--tobs-ink-primary); font: inherit; font-size: ${text.metaSize}; cursor: pointer; }
.bh-sidebar-order-actions button:disabled { opacity: 0.5; cursor: default; }
.bh-sidebar-order-actions button:focus-visible { outline: ${border.focus} solid var(--tobs-accent-solid); }
`,
};
