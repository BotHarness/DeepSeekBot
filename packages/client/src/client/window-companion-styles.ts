import { COMPANION_FONT, COMPANION_RAISED } from './companion-surface.js';
import { color, radius, size, space, text } from './ds/tokens.stylex.js';

export const WINDOW_COMPANION_CSS = `
.bh-companion-chip { display: inline-flex; align-items: center; gap: ${space.x1}; }
.bh-channel-island-wrap > .bh-companion-pin { margin-left: ${space.x1}; width: 34px; height: 34px; border: 1px solid ${color.border}; border-radius: ${radius.round}; background: ${color.surface}; box-shadow: 0 3px 12px color-mix(in srgb, ${color.fg} 12%, transparent); }
.bh-channel-island-wrap > .bh-companion-pin:hover { background: color-mix(in srgb, ${color.fg} 8%, ${color.surface}); }
.bh-companion-pin { display: inline-grid; place-items: center; width: ${size.inlineIcon}; height: ${size.inlineIcon}; padding: 0; border: 0; background: transparent; color: ${color.muted}; border-radius: ${radius.control}; cursor: pointer; opacity: 0; transition: opacity 150ms ease; }
.bh-companion-chip:hover .bh-companion-pin, .bh-channel-island-wrap:hover > .bh-companion-pin, .bh-companion-pin:focus-visible, .bh-companion-pin[aria-pressed='true'] { opacity: 1; }
.bh-companion-pin:focus-visible { outline: 2px solid ${color.accent}; outline-offset: 2px; }
.bh-companion-pin:disabled { cursor: default; }
.bh-companion-character { transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: 2px solid ${color.accent}; outline-offset: 3px; }
.bh-companion[data-sync='stale'] .bh-companion-character { opacity: 0.55; filter: grayscale(1); }
@keyframes bh-companion-pop { from { transform: scale(.5); opacity: 0; } }
@keyframes bh-companion-option-in { from { transform: translateY(6px) scale(.92); opacity: 0; } }
@keyframes bh-companion-caret { 50% { opacity: 0; } }
.bh-companion-caret { display: inline-block; width: 2px; height: 1.05em; margin-left: ${space.x1}; vertical-align: -2px; background: ${color.accent}; animation: bh-companion-caret 1s steps(1) infinite; }
.bh-companion-bubble p { margin: ${space.x2} 0 0; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; max-height: 80px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; overflow-anchor: none; scroll-behavior: auto; }
.bh-companion[data-reading='true'] .bh-companion-bubble p { max-height: 220px; }
.bh-companion-bubble p::-webkit-scrollbar { display: none; }
.bh-companion-bubble p:focus-visible { outline: 2px solid ${color.accent}; outline-offset: 2px; }
.bh-companion-pending { animation: bh-companion-pop 260ms cubic-bezier(.3, 1.5, .5, 1); }
.bh-companion-pending [data-compact] { --bh-message-card-gap: ${space.x2}; width: auto; min-width: 0; font-size: ${text.metaSize}; }
.bh-companion-pending [data-compact] .bh-message-card-actions { gap: ${space.x2}; padding-top: ${space.x1}; }
.bh-companion-pending [data-compact] .bh-message-card-actions > * { animation: bh-companion-option-in 240ms cubic-bezier(.3, 1.4, .5, 1) both; }
.bh-companion-pending [data-compact] .bh-message-card-actions button { border-radius: 999px; }
.bh-companion-pending [data-compact] .bh-card-list.bh-message-card-list { display: grid; gap: ${space.x2}; overflow: visible; border: 0; border-radius: 0; background: transparent; counter-reset: bh-companion-option; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row, .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row + .bh-card-row { overflow: hidden; border: 1.5px solid ${color.border}; border-radius: ${radius.card}; background: ${COMPANION_RAISED}; box-shadow: none; counter-increment: bh-companion-option; transition: border-color 150ms ease; animation: bh-companion-option-in 240ms cubic-bezier(.3, 1.4, .5, 1) both; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(2) { animation-delay: 40ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(3) { animation-delay: 80ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(n + 4) { animation-delay: 120ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:hover, .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row[data-selected='true'] { border-color: ${color.accent}; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row[data-selected='true'] { background: color-mix(in srgb, ${color.accent} 12%, ${color.base}); }
.bh-companion-pending [data-compact] .bh-message-card-list .bh-card-main { min-height: ${size.row}; gap: ${space.x3}; padding: ${space.x2} ${space.x4}; }
.bh-companion-pending [data-compact] .bh-message-card-list button.bh-card-main::before { content: counter(bh-companion-option); flex: none; display: grid; place-items: center; width: 18px; height: 18px; border: 2px solid ${color.accent}; border-radius: ${radius.round}; font: ${text.heavy} ${text.metaSize}/1 ${COMPANION_FONT}; color: ${color.fg}; }
.bh-companion-details { font-size: ${text.metaSize}; color: ${color.muted}; }
.bh-companion-details > summary { cursor: pointer; width: max-content; }
.bh-companion-details[open] { display: grid; gap: ${space.x2}; }
.bh-companion-pending .bh-tool-approval-card { margin: 0; min-width: 0; grid-template-columns: minmax(0, 1fr); overflow-wrap: anywhere; }
.bh-companion-pending .bh-tool-approval-input { max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-companion-toolbar { left: calc(100% + ${space.x1}); }
.bh-companion[data-toolbar='left'] .bh-companion-toolbar { left: auto; right: calc(100% + ${space.x1}); }
.bh-companion-toolbar, .bh-companion-attention { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 150ms ease, visibility 0s linear 150ms; }
.bh-companion:hover .bh-companion-toolbar, .bh-companion:has(:focus-visible) .bh-companion-toolbar,
.bh-companion:hover .bh-companion-attention, .bh-companion:has(:focus-visible) .bh-companion-attention,
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
html[data-botharness-motion='reduce'] .bh-companion-pending, html[data-botharness-motion='reduce'] .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row, html[data-botharness-motion='reduce'] .bh-companion-pending [data-compact] .bh-message-card-actions > *, html[data-botharness-motion='reduce'] .bh-companion-caret { animation: none; }
`;
