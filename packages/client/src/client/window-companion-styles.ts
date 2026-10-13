export const WINDOW_COMPANION_CSS = `
.bh-companion-stage {
  /* @bh-companion-aliases:start — pixel geometry over native DSH surfaces. */
  --bh-companion-surface: var(--dsw-alias-bg-base);
  --bh-companion-text: var(--dsw-alias-label-primary);
  --bh-companion-muted: var(--dsw-alias-label-secondary);
  --bh-companion-border: var(--dsw-alias-border-l2);
  --bh-companion-hover: var(--dsw-alias-interactive-bg-hover);
  --bh-companion-attention: var(--dsw-alias-state-warn-primary);
  --bh-companion-font: var(--dsw-font-markdown-code-block-font-family);
  --bh-companion-ink: var(--dsw-alias-label-primary);
  --bh-companion-raised: color-mix(in srgb, var(--dsw-alias-label-primary) 4%, var(--dsw-alias-bg-base));
  --bh-companion-shadow: color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
  /* @bh-companion-aliases:end */
  /* Focus may scroll hidden overflow; the presentation viewport must stay fixed. */
  position: absolute; inset: 0; pointer-events: none; overflow: clip;
}
.bh-companion-chip { display: inline-flex; align-items: center; gap: 2px; }
.bh-channel-island-wrap > .bh-companion-pin { margin-left: 2px; }
.bh-channel-island-wrap > .bh-companion-pin { width: 34px; height: 34px; border: 1px solid var(--dsw-alias-border-l2); border-radius: 999px; background: var(--dsw-alias-bg-module-platform); box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
.bh-channel-island-wrap > .bh-companion-pin:hover { background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, var(--dsw-alias-bg-module-platform)); }
.bh-companion-pin { display: inline-grid; place-items: center; width: 26px; height: 26px; padding: 0; border: 0; background: transparent; color: var(--bh-overview-muted); border-radius: var(--bh-overview-radius-control); cursor: pointer; opacity: 0; transition: opacity 150ms ease; }
.bh-companion-chip:hover .bh-companion-pin, .bh-channel-island-wrap:hover > .bh-companion-pin, .bh-companion-pin:focus-visible, .bh-companion-pin[aria-pressed='true'] { opacity: 1; }
.bh-companion-pin:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-companion-pin:disabled { cursor: default; }
.bh-companion { position: absolute; width: 96px; height: 96px; pointer-events: auto; }
.bh-companion-tether { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bh-companion-tether path { fill: none; stroke: var(--bh-companion-ink); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 0 6; }
.bh-companion-character { border: 0; padding: 0; background: transparent; cursor: grab; touch-action: none; width: 96px; height: 96px; transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion-character:active { cursor: grabbing; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 3px; }
.bh-companion[data-sync='stale'] .bh-companion-character { opacity: 0.55; filter: grayscale(1); }
.bh-companion-bubble, .bh-companion-pending { position: absolute; display: flex; flex-direction: column; width: 300px; max-width: calc(100vw - 16px); background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-ink); border-radius: 16px; color: var(--bh-companion-text); box-shadow: 0 8px 22px var(--bh-companion-shadow); transform-origin: var(--bh-companion-tail, 50%) calc(100% + 10px); }
.bh-companion-bubble { padding: 8px 12px 10px; }
.bh-companion-bubble::before, .bh-companion-bubble::after, .bh-companion-pending::before, .bh-companion-pending::after { content: ''; position: absolute; left: calc(var(--bh-companion-tail, 50%) - 11px); bottom: -11px; width: 22px; height: 11.5px; pointer-events: none; }
.bh-companion-bubble::before, .bh-companion-pending::before { background: var(--bh-companion-ink); clip-path: path('M0 0.5 L8.9 9.4 Q11 11.5 13.1 9.4 L22 0.5 Z'); }
.bh-companion-bubble::after, .bh-companion-pending::after { background: var(--bh-companion-surface); clip-path: path('M2.6 0 L10.5 7.9 Q11 8.4 11.5 7.9 L19.4 0 Z'); }
@keyframes bh-companion-pop { from { transform: scale(.5); opacity: 0; } }
@keyframes bh-companion-option-in { from { transform: translateY(6px) scale(.92); opacity: 0; } }
@keyframes bh-companion-caret { 50% { opacity: 0; } }
.bh-companion-caret { display: inline-block; width: 2px; height: 1.05em; margin-left: 2px; vertical-align: -2px; background: var(--bh-accent); animation: bh-companion-caret 1s steps(1) infinite; }
.bh-companion-bubble header, .bh-companion-pending > header { display: flex; align-items: center; gap: 6px; min-width: 0; }
.bh-companion-source { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }
.bh-companion-source small { font: 11px/14px var(--bh-companion-font); color: var(--bh-companion-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-source button { text-align: left; line-height: 14px; }
.bh-companion-source button:disabled { cursor: default; }
.bh-companion-bubble header button { font-size: 11px; color: var(--bh-companion-muted); background: transparent; border: 0; padding: 0; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-queue { flex: none; font: 11px/14px var(--bh-companion-font); color: var(--bh-companion-muted); }
.bh-companion-bubble p { margin: 4px 0 0; font-size: 13px; line-height: 20px; white-space: pre-wrap; overflow-wrap: anywhere; text-wrap: pretty; max-height: 80px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; overflow-anchor: none; scroll-behavior: auto; }
.bh-companion[data-reading='true'] .bh-companion-bubble p { max-height: 220px; }
.bh-companion-bubble p::-webkit-scrollbar { display: none; }
.bh-companion-bubble p:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-companion-pending { z-index: 3; animation: bh-companion-pop 260ms cubic-bezier(.3, 1.5, .5, 1); }
.bh-companion-pending > header { flex: none; padding: 8px 12px 0; font: 11px/16px var(--bh-companion-font); color: var(--bh-companion-muted); }
.bh-companion-pending > ol { margin: 0; padding: 6px 12px 12px; list-style: none; overflow: auto; scrollbar-width: thin; }
.bh-companion-request-source { flex: 1; min-width: 0; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-request-nav { display: inline-flex; flex: none; align-items: center; gap: 2px; }
.bh-companion-request-nav button { width: 20px; height: 20px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: var(--bh-companion-text); cursor: pointer; font: inherit; }
.bh-companion-request-nav button:hover { background: var(--bh-companion-hover); }
.bh-companion-pending [data-compact] { --bh-message-card-gap: 6px; width: auto; min-width: 0; font-size: 12px; }
.bh-companion-pending [data-compact] .bh-message-card-actions { gap: 6px; padding-top: 2px; }
.bh-companion-pending [data-compact] .bh-message-card-actions > * { animation: bh-companion-option-in 240ms cubic-bezier(.3, 1.4, .5, 1) both; }
.bh-companion-pending [data-compact] .bh-message-card-actions button { border-radius: 999px; }
.bh-companion-pending [data-compact] .bh-card-list.bh-message-card-list { display: grid; gap: 6px; overflow: visible; border: 0; border-radius: 0; background: transparent; counter-reset: bh-companion-option; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row, .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row + .bh-card-row { overflow: hidden; border: 1.5px solid var(--bh-companion-border); border-radius: 11px; background: var(--bh-companion-raised); box-shadow: none; counter-increment: bh-companion-option; transition: border-color 150ms ease; animation: bh-companion-option-in 240ms cubic-bezier(.3, 1.4, .5, 1) both; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(2) { animation-delay: 40ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(3) { animation-delay: 80ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:nth-child(n + 4) { animation-delay: 120ms; }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row:hover, .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row[data-selected='true'] { border-color: var(--bh-accent); }
.bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row[data-selected='true'] { background: color-mix(in srgb, var(--bh-accent) 12%, var(--bh-companion-surface)); }
.bh-companion-pending [data-compact] .bh-message-card-list .bh-card-main { min-height: 32px; gap: 8px; padding: 6px 10px; }
.bh-companion-pending [data-compact] .bh-message-card-list button.bh-card-main::before { content: counter(bh-companion-option); flex: none; display: grid; place-items: center; width: 18px; height: 18px; border: 2px solid var(--bh-accent); border-radius: 50%; font: 600 10px/1 var(--bh-companion-font); color: var(--bh-companion-text); }
.bh-companion-details { font-size: 12px; color: var(--bh-companion-muted); }
.bh-companion-details > summary { cursor: pointer; width: max-content; }
.bh-companion-details[open] { display: grid; gap: 4px; }
.bh-companion-pending .bh-tool-approval-card { margin: 0; min-width: 0; grid-template-columns: minmax(0, 1fr); overflow-wrap: anywhere; }
.bh-companion-pending .bh-tool-approval-input { max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-companion-toolbar { position: absolute; bottom: 8px; left: calc(100% + 2px); display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 4px; background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-ink); border-radius: 14px; box-shadow: 0 6px 16px var(--bh-companion-shadow); }
.bh-companion[data-toolbar='left'] .bh-companion-toolbar { left: auto; right: calc(100% + 2px); }
.bh-companion-toolbar button { display: grid; place-items: center; min-width: 28px; height: 26px; border: 0; border-radius: 9px; background: transparent; color: var(--bh-companion-text); cursor: pointer; }
.bh-companion-toolbar button:hover { background: var(--bh-companion-hover); }
.bh-companion-attention { position: absolute; z-index: 2; right: 4px; top: 4px; min-width: 20px; height: 20px; padding: 0 3px; border: 1px solid var(--bh-companion-border); background: var(--bh-companion-surface); color: var(--bh-companion-attention); cursor: pointer; }
.bh-companion-toolbar, .bh-companion-attention { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 150ms ease, visibility 0s linear 150ms; }
.bh-companion:hover .bh-companion-toolbar, .bh-companion:has(:focus-visible) .bh-companion-toolbar,
.bh-companion:hover .bh-companion-attention, .bh-companion:has(:focus-visible) .bh-companion-attention,
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
html[data-botharness-motion='reduce'] .bh-companion-pending, html[data-botharness-motion='reduce'] .bh-companion-pending [data-compact] .bh-message-card-list > .bh-card-row, html[data-botharness-motion='reduce'] .bh-companion-pending [data-compact] .bh-message-card-actions > *, html[data-botharness-motion='reduce'] .bh-companion-caret { animation: none; }
`;
