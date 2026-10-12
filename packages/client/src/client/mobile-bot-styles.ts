export const MOBILE_BOT_CSS = `
[data-bh-mobile-sidebar='true'] { display: none !important; }
.bh-mobile-shell { position: fixed; inset: var(--bh-mobile-top, 0px) 0 auto; height: var(--bh-mobile-height, 100dvh); z-index: 10; display: flex; flex-direction: column; min-width: 0; overflow: hidden; background: var(--dsw-alias-bg-base); padding-inline: env(safe-area-inset-left) env(safe-area-inset-right); }
.bh-mobile-header { display: flex; align-items: center; justify-content: space-between; flex: 0 0 auto; padding: max(4px, env(safe-area-inset-top)) 8px 4px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.bh-mobile-header button, .bh-mobile-nav button, .bh-mobile-exit, .bh-mobile-conversation-header button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; min-width: 44px; border: 0; border-radius: 8px; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; cursor: pointer; }
.bh-mobile-header button { padding: 6px 10px; }
.bh-mobile-header button:focus-visible, .bh-mobile-nav button:focus-visible, .bh-mobile-exit:focus-visible, .bh-mobile-conversation-header button:focus-visible { outline: 2px solid var(--dsw-alias-state-business-primary); outline-offset: -2px; }
.bh-mobile-header button:hover, .bh-mobile-nav button:hover, .bh-mobile-nav button[aria-current='page'] { background: var(--dsw-alias-interactive-bg-hover); }
.bh-mobile-list, .bh-mobile-content { flex: 1; min-height: 0; min-width: 0; overflow: hidden; }
.bh-mobile-list[hidden], .bh-mobile-content[hidden] { display: none; }
.bh-mobile-list > .bh-region { padding: 0 12px 8px; }
.bh-mobile-list .bh-header { position: sticky; top: 0; z-index: 4; height: auto; min-height: 60px; margin-top: 0; padding: max(8px, env(safe-area-inset-top)) 0 8px; border-radius: 0; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); }
.bh-mobile-list .bh-header-label { font-size: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.bh-mobile-list .bh-header button { min-width: 44px; min-height: 44px; }
.bh-mobile-list .bh-header svg { width: 22px; height: 22px; }
.bh-mobile-list .bh-header-actions { max-width: 92px; }
.bh-mobile-list .bh-header-actions-hidden { max-width: 0; }
.bh-mobile-list .bh-search-slot { max-width: 44px; }
.bh-mobile-list .bh-search-slot-open { max-width: 100%; }
.bh-mobile-list .bh-search { height: 44px; }
.bh-mobile-list .bh-search-open { width: 100%; margin-inline: 0; }
.bh-mobile-exit { flex: 0 0 auto; }
.bh-mobile-nav { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px 8px max(4px, env(safe-area-inset-bottom)); border-top: 1px solid var(--dsw-alias-border-l2); }
.bh-mobile-nav button { padding: 6px 4px; overflow-wrap: anywhere; }
.bh-mobile-nav button svg { flex: 0 0 auto; }
.bh-mobile-content .bh-chat-layout .bh-topbar { position: relative; inset: auto; flex: 0 0 auto; padding: 0; }
.bh-mobile-conversation-header { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; align-items: center; gap: 8px; width: 100%; min-width: 0; padding: max(6px, env(safe-area-inset-top)) 12px 6px; border-bottom: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); pointer-events: auto; }
.bh-mobile-conversation-header h1 { margin: 0; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; text-align: center; font-size: 16px; font-weight: 600; }
.bh-mobile-content .bh-chat-top-fade, .bh-mobile-content .bh-chat-layout > .bh-sidebar-toggle { display: none; }
.bh-mobile-content .bh-chat-body { padding-top: 12px; }
.bh-mobile-content .bh-channel-sidebar-head .bh-sidebar-settings-menu { right: 8px; }
.bh-mobile-content .bh-main, .bh-mobile-content .bh-chat-layout, .bh-mobile-content .bh-chat-pane { min-width: 0; }
.bh-mobile-content .bh-composer-shell { padding-bottom: max(8px, env(safe-area-inset-bottom)); }
.bh-mobile-content .bh-composer-rich-input:empty::before { display: inline-block; max-width: 100%; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; vertical-align: bottom; }
.bh-mobile-content .bh-activity-center-header > h1 { display: none; }
.bh-mobile-content .bh-channel-island-wrap { min-width: 0; max-width: 100%; }
.bh-mobile-content .bh-channel-island { min-width: 0; }
`;
