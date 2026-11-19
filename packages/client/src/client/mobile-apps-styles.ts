import { actionColor, border, color, radius, space, text } from './ds/tokens.stylex.js';

export const MOBILE_APPS_CSS = `
.bh-mobile-apps-hint,.bh-mobile-apps-popover {position:fixed;z-index:1000;box-sizing:border-box;padding:${space.x5};border:${border.hairline} solid ${color.border};border-radius:${radius.md};background:${color.base};color:${color.fg};box-shadow:0 8px 32px color-mix(in srgb,${color.fg} 15%,transparent);font-size:${text.bodySize};line-height:${text.bodyLine};}
.bh-mobile-apps-popover {overflow:auto;}
.bh-mobile-apps-hint::before {content:'';position:absolute;bottom:var(--bh-mobile-apps-arrow,10px);width:10px;height:10px;box-sizing:border-box;background:inherit;border:${border.hairline} solid ${color.border};transform:rotate(45deg);}
.bh-mobile-apps-hint[data-side='right']::before {left:-6px;border-top-color:transparent;border-right-color:transparent;}
.bh-mobile-apps-hint[data-side='left']::before {right:-6px;border-bottom-color:transparent;border-left-color:transparent;}
body.driver-active .bh-mobile-apps-hint,body:has([aria-modal='true']) .bh-mobile-apps-hint {display:none;}
.bh-mobile-apps-head {display:flex;gap:${space.x3};align-items:center;justify-content:space-between;}
.bh-mobile-apps-head strong {font-size:${text.titleSize};font-weight:${text.strong};}
.bh-mobile-apps-head > button {display:flex;align-items:center;justify-content:center;padding:${space.x2};border:0;border-radius:${radius.sm};background:transparent;color:${color.muted};cursor:pointer;}
.bh-mobile-apps-head > button:hover,.bh-mobile-apps-head > button:focus-visible {background:${color.hover};color:${color.fg};}
.bh-mobile-apps-caption {margin:${space.x2} 0 ${space.x4};font-size:${text.metaSize};line-height:${text.metaLine};color:${color.muted};}
.bh-mobile-apps-hint .bh-mobile-apps-primary {width:100%;justify-content:center;}
.bh-mobile-apps-section {padding-top:${space.x4};margin-top:${space.x4};border-top:${border.hairline} solid ${color.divider};}
.bh-mobile-apps-section h3 {margin:0;font:inherit;font-weight:${text.strong};}
.bh-mobile-apps-section .bh-mobile-apps-caption {margin-bottom:${space.x3};}
.bh-mobile-apps-link {display:flex;align-items:center;gap:${space.x3};min-height:36px;box-sizing:border-box;padding:${space.x2} ${space.x3};border-radius:${radius.sm};background:${actionColor.secondary};color:inherit;text-decoration:none;}
.bh-mobile-apps-link + .bh-mobile-apps-link {margin-top:${space.x2};}
a.bh-mobile-apps-link:hover,a.bh-mobile-apps-link:focus-visible {background:${actionColor.hover};}
.bh-mobile-apps-link > span {flex:1;min-width:0;}
.bh-mobile-apps-link > svg {flex-shrink:0;}
.bh-mobile-apps-link > svg:last-child {color:${color.muted};}
`;
