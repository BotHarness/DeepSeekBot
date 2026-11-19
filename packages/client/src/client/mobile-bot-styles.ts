import { space } from './ds/tokens.stylex.js';

export const MOBILE_BOT_CSS = `
[data-bh-mobile-sidebar='true'],
body:has([data-bot-window-class]:not([data-bot-window-class='expanded']))
  :is([data-shell-leading], [data-sidebar-mask], [data-side='sidebar']) { display: none !important; }
.bh-mobile-content .bh-chat-layout .bh-topbar { position: relative; inset: auto; flex: 0 0 auto; padding: 0; }
.bh-mobile-content .bh-chat-layout > .bh-sidebar-toggle { display: none; }
.bh-mobile-content .bh-chat-body { --bh-chat-mask-top: 0px; --bh-chat-top-inset: ${space.x4}; }
.bh-mobile-content .bh-channel-sidebar-head .bh-sidebar-settings-menu { right: ${space.x3}; }
.bh-mobile-content .bh-main, .bh-mobile-content .bh-chat-layout, .bh-mobile-content .bh-chat-pane { min-width: 0; min-height: 0; }
.bh-mobile-content .bh-composer-shell { padding-bottom: max(${space.x3}, env(safe-area-inset-bottom)); }
.bh-mobile-content .bh-composer-rich-input:empty::before { display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; }
.bh-mobile-content .bh-activity-center-header > h1 { display: none; }
.bh-mobile-content .bh-channel-island-wrap { min-width: 0; max-width: 100%; }
.bh-mobile-content .bh-channel-island { min-width: 0; }
`;
