import { radius, space, text } from './ds/tokens.stylex.js';
export const COMPOSER_CONTEXT_CSS = `
.bh-group-grant-members {display:flex;flex-wrap:wrap;gap:${space.x3};padding:0;border:0;min-width:0;}
.bh-group-grant-members legend {padding:0;margin-bottom:${space.x3};font-weight:${text.strong};}
.bh-group-grant-members label {display:flex;align-items:center;gap:${space.x3};padding:${space.x2} ${space.x3};border:1px solid var(--dsw-alias-border-l2);border-radius:${radius.row};overflow-wrap:anywhere;cursor:pointer;}
.bh-group-grant-results .bh-card-title {white-space:normal;overflow-wrap:anywhere;}
.bh-group-grant-directory {overflow-wrap:anywhere;}
.bh-group-grant-actions {display:flex;flex-wrap:wrap;gap:${space.x3};margin-top:${space.x4};}
.bh-group-grant-policy summary {cursor:pointer;color:var(--dsw-alias-label-secondary);}
.bh-composer-shortcuts {position:absolute;bottom:100%;left:0;right:0;z-index:4;display:flex;flex-direction:column;gap:${space.x1};padding:${space.x2};border:1px solid var(--dsw-alias-border-l2);border-radius:${radius.card};background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);}
.bh-composer-shortcuts button {display:flex;justify-content:space-between;gap:${space.x3};align-items:center;font:inherit;text-align:start;padding:${space.x3};border:0;border-radius:${radius.control};background:transparent;color:inherit;cursor:pointer;}
.bh-composer-shortcuts button[data-active='true'],.bh-composer-shortcuts button:hover {background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-shortcuts button:disabled {color:var(--dsw-alias-label-tertiary);cursor:default;}
.bh-composer-shortcuts small {color:var(--dsw-alias-label-secondary);}
.bh-composer-shortcut-label {display:flex;align-items:center;gap:${space.x3};}
.bh-composer-shortcut-label svg {flex-shrink:0;}
.bh-composer-usage-popover {position:fixed;z-index:1000;max-height:min(70vh,480px);overflow:auto;box-sizing:border-box;padding:${space.x5};border:1px solid var(--dsw-alias-border-l2);border-radius:${radius.menuItem};background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);box-shadow:0 8px 32px color-mix(in srgb,var(--dsw-alias-label-primary) 15%,transparent);font-size:${text.bodySize};line-height:1.5;}
.bh-composer-usage-head,.bh-composer-usage-total,.bh-composer-usage-row {display:flex;gap:${space.x3};align-items:center;justify-content:space-between;}
.bh-composer-usage-head {margin-bottom:${space.x4};}
.bh-composer-usage-popover button {font:inherit;display:flex;align-items:center;justify-content:space-between;gap:${space.x3};border:0;background:transparent;color:inherit;cursor:pointer;border-radius:${radius.control};padding:${space.x2};}
.bh-composer-usage-popover button:hover,.bh-composer-usage-popover button:focus-visible {background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-usage-caption {font-size:${text.metaSize};color:var(--dsw-alias-label-secondary);margin:${space.x2} 0 ${space.x4};}
.bh-composer-usage-section {padding:${space.x4} 0;margin-top:${space.x4};border-top:1px solid var(--dsw-alias-border-l2);}
.bh-composer-usage-section h3 {font:inherit;font-size:${text.metaSize};font-weight:${text.strong};color:var(--dsw-alias-label-secondary);margin:0 0 ${space.x3};}
.bh-composer-usage-row {padding:${space.x2} 0;}
.bh-composer-usage-row span {flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.bh-composer-usage-row strong {font-weight:${text.strong};flex-shrink:0;font-variant-numeric:tabular-nums;}
.bh-composer-usage-session + .bh-composer-usage-session {margin-top:${space.x3};}
.bh-composer-usage-meter {height:5px;overflow:hidden;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover);}
.bh-composer-usage-meter span {display:block;height:100%;border-radius:inherit;background:var(--bh-bot-color,var(--dsw-alias-label-secondary));}
.bh-composer-usage-footer {margin-top:${space.x2};padding-top:${space.x4};border-top:1px solid var(--dsw-alias-border-l2);}
.bh-composer-usage-popover .bh-composer-usage-details {width:100%;min-height:40px;padding:${space.x3} ${space.x4};border-radius:${radius.row};box-sizing:border-box;}
`;
