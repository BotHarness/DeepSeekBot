import { border, color, radius, size, space, text } from './ds/tokens.stylex.js';

export const WINDOW_COMPANION_CSS = `
.bh-companion-chip { display: inline-flex; align-items: center; gap: ${space.x1}; }
.bh-channel-island-wrap > .bh-companion-pin { margin-left: ${space.x1}; width: 34px; height: 34px; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.round}; background: ${color.surface}; box-shadow: 0 3px 12px color-mix(in srgb, ${color.fg} 12%, transparent); }
.bh-channel-island-wrap > .bh-companion-pin:hover { background: color-mix(in srgb, ${color.fg} 8%, ${color.surface}); }
.bh-companion-pin { display: inline-grid; place-items: center; width: ${size.inlineIcon}; height: ${size.inlineIcon}; padding: 0; border: 0; background: transparent; color: ${color.muted}; border-radius: ${radius.sm}; cursor: pointer; opacity: 0; transition: opacity 150ms ease; }
.bh-companion-chip:hover .bh-companion-pin, .bh-channel-island-wrap:hover > .bh-companion-pin, .bh-companion-pin:focus-visible, .bh-companion-pin[aria-pressed='true'] { opacity: 1; }
.bh-companion-pin:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-companion-pin:disabled { cursor: default; }
.bh-companion-character { transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 3px; }
.bh-companion[data-sync='stale'] .bh-companion-character { opacity: 0.55; filter: grayscale(1); }
@keyframes bh-companion-pop { from { transform: scale(.92); opacity: 0; } }
@keyframes bh-companion-caret { 50% { opacity: 0; } }
.bh-companion-caret { display: inline-block; width: 2px; height: 1.05em; margin-left: ${space.x1}; vertical-align: -2px; background: ${color.accent}; animation: bh-companion-caret 1s steps(1) infinite; }
.bh-companion-bubble p { margin: ${space.x2} 0 0; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; max-height: 80px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; overflow-anchor: none; scroll-behavior: auto; }
.bh-companion[data-reading='true'] .bh-companion-bubble p { max-height: 220px; }
.bh-companion-bubble p::-webkit-scrollbar { display: none; }
.bh-companion-bubble p:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-companion-pending { animation: bh-companion-pop 220ms var(--bh-ease-out); }
.bh-companion-details { font-size: ${text.metaSize}; color: ${color.muted}; }
.bh-companion-details > summary { cursor: pointer; width: max-content; }
.bh-companion-details[open] { display: grid; gap: ${space.x2}; }
.bh-companion-toolbar { left: calc(100% + ${space.x1}); }
.bh-companion[data-toolbar='left'] .bh-companion-toolbar { left: auto; right: calc(100% + ${space.x1}); }
.bh-companion-toolbar, .bh-companion-attention { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 150ms ease, visibility 0s linear 150ms; }
.bh-companion:hover .bh-companion-toolbar, .bh-companion:has(:focus-visible) .bh-companion-toolbar,
.bh-companion:hover .bh-companion-attention, .bh-companion:has(:focus-visible) .bh-companion-attention,
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
html[data-botharness-motion='reduce'] .bh-companion-pending, html[data-botharness-motion='reduce'] .bh-companion-caret { animation: none; }
`;
