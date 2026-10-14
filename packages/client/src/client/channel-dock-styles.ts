import { DOCKVIEW_CSS } from './dockview-css.js';
import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';

export const CHANNEL_DOCK_CSS =
  DOCKVIEW_CSS +
  `
.bh-dock-theme {
  --dv-group-view-background-color: ${color.base};
  --dv-tabs-and-actions-container-background-color: ${color.base};
  --dv-tabs-and-actions-container-height: calc(${size.row} + ${space.x1} * 2);
  --dv-tabs-and-actions-container-font-size: ${text.bodySize};
  --dv-activegroup-visiblepanel-tab-background-color: ${color.base};
  --dv-activegroup-hiddenpanel-tab-background-color: ${color.base};
  --dv-inactivegroup-visiblepanel-tab-background-color: ${color.base};
  --dv-inactivegroup-hiddenpanel-tab-background-color: ${color.base};
  --dv-activegroup-visiblepanel-tab-color: ${color.fg};
  --dv-activegroup-hiddenpanel-tab-color: ${color.muted};
  --dv-inactivegroup-visiblepanel-tab-color: ${color.fg};
  --dv-inactivegroup-hiddenpanel-tab-color: ${color.muted};
  --dv-tab-divider-color: transparent;
  --dv-tab-font-size: inherit;
  --dv-tab-margin: 0;
  --dv-tab-close-icon-size: inherit;
  --dv-tab-border-radius: 0;
  --dv-border-radius: 0;
  --dv-spacing-padding: 0;
  --dv-separator-border: ${color.divider};
  --dv-paneview-header-border-color: ${color.divider};
  --dv-paneview-active-outline-color: ${color.accent};
  --dv-sash-color: transparent;
  --dv-active-sash-color: ${color.accent};
  --dv-active-sash-transition-duration: 0.1s;
  --dv-active-sash-transition-delay: 0.3s;
  --dv-sash-border-radius: 0;
  --dv-drag-over-background-color: color-mix(in srgb, ${color.accent} 14%, transparent);
  --dv-drag-over-border-color: ${color.accent};
  --dv-drag-over-border: ${border.hairline} solid ${color.accent};
  --dv-edge-dock-indicator-color: ${color.accent};
  --dv-icon-hover-background-color: ${color.hover};
  --dv-scrollbar-background-color: ${color.border};
  --dv-tabs-container-scrollbar-color: ${color.border};
  --dv-dropdown-border-radius: ${radius.sm};
  --dv-overlay-z-index: 999;
  --dv-context-menu-background-color: ${color.base};
  --dv-context-menu-color: ${color.fg};
}
.bh-dock {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
.bh-dock > div {
  flex: 1 1 0;
  min-width: 0;
  height: 100%;
}
.bh-dock .dv-tabs-and-actions-container {
  border-bottom: ${border.hairline} solid ${color.divider};
}
.bh-dock .dv-tab {
  padding: 0;
  cursor: grab;
}
.bh-dock .dv-tab:active { cursor: grabbing; }
.bh-dock .dv-tab:focus-visible,
.bh-dock .dv-tab:focus-within { outline: none; }
.bh-dock .dv-tab .dv-default-tab-action { display: none; }
.bh-dock .dv-resize-container {
  border-radius: ${radius.md};
  overflow: hidden;
}
.bh-dock-header {
  display: flex;
  align-items: center;
  width: 100%;
  min-width: 0;
  height: 100%;
}
.bh-dock-header > * { flex: 1 1 0; min-width: 0; }
.bh-dock-body {
  position: relative;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}
.bh-dock-body > .bh-chat-pane { flex: 1 1 0; }
.bh-dock-menu {
  position: absolute;
  top: calc((var(--bh-channel-header-height) - ${size.icon}) / 2);
  right: ${space.x3};
  z-index: 7;
}
`;
