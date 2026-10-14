import { border, color, space, text } from './ds/tokens.stylex.js';

export const MOBILE_BOT_CSS = `
[data-bh-mobile-sidebar='true'] { display: none !important; }
.bh-mobile-nav button svg { flex: 0 0 auto; }
.bh-mobile-list > .bh-region { padding: 0 ${space.x4} ${space.x3}; }
.bh-mobile-list .bh-header { position: sticky; top: 0; z-index: 4; height: auto; min-height: 60px; margin-top: 0; padding: max(${space.x3}, env(safe-area-inset-top)) 0 ${space.x3}; border-radius: 0; border-bottom: ${border.hairline} solid ${color.border}; background: ${color.base}; }
.bh-mobile-list .bh-header-label { font-size: ${text.titleSize}; line-height: ${text.titleLine}; font-weight: ${text.strong}; color: ${color.fg}; }
.bh-mobile-list .bh-header button { min-width: 44px; min-height: 44px; }
.bh-mobile-list .bh-header svg { width: 22px; height: 22px; }
.bh-mobile-list .bh-header-actions { max-width: 92px; }
.bh-mobile-list .bh-header-actions-hidden { max-width: 0; }
.bh-mobile-list .bh-search-slot { max-width: 44px; }
.bh-mobile-list .bh-search-slot-open { max-width: 100%; }
.bh-mobile-list .bh-search { height: 44px; }
.bh-mobile-list .bh-search-open { width: 100%; margin-inline: 0; }
.bh-mobile-content .bh-chat-layout .bh-topbar { position: relative; inset: auto; flex: 0 0 auto; padding: 0; }
.bh-mobile-content .bh-chat-top-fade, .bh-mobile-content .bh-chat-layout > .bh-sidebar-toggle { display: none; }
.bh-mobile-content .bh-chat-body { padding-top: ${space.x4}; }
.bh-mobile-content .bh-channel-sidebar-head .bh-sidebar-settings-menu { right: ${space.x3}; }
.bh-mobile-content .bh-main, .bh-mobile-content .bh-chat-layout, .bh-mobile-content .bh-chat-pane { min-width: 0; }
.bh-mobile-content .bh-composer-shell { padding-bottom: max(${space.x3}, env(safe-area-inset-bottom)); }
.bh-mobile-content .bh-composer-rich-input:empty::before { display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; }
.bh-mobile-content .bh-activity-center-header > h1 { display: none; }
.bh-mobile-content .bh-channel-island-wrap { min-width: 0; max-width: 100%; }
.bh-mobile-content .bh-channel-island { min-width: 0; }
`;
