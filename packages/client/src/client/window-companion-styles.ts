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
.bh-companion-capacity-controls { display: flex; align-items: end; flex-wrap: wrap; gap: 8px; }
.bh-companion-capacity-controls label { display: grid; gap: 4px; max-width: 150px; }
.bh-companion { position: absolute; width: 96px; height: 96px; pointer-events: auto; }
.bh-companion-tether { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; pointer-events: none; }
.bh-companion-tether path { fill: none; stroke: var(--bh-companion-border); stroke-width: 2; stroke-linejoin: miter; }
.bh-companion-character { border: 0; padding: 0; background: transparent; cursor: grab; touch-action: none; width: 96px; height: 96px; transform-origin: center 20%; transition: transform 140ms ease-out, transform-origin 140ms ease-out; }
.bh-companion[data-motion='fall'] .bh-companion-character,
.bh-companion[data-motion='land'] .bh-companion-character { transform-origin: center bottom; transition: transform 70ms ease-out, transform-origin 140ms ease-out; }
.bh-companion-character:active { cursor: grabbing; }
.bh-companion .bh-persona-avatar[data-surface='companion'],
.bh-companion .bh-persona-avatar[data-surface='companion']::before,
.bh-companion .bh-avatar-media { background: transparent; border: 0; border-radius: 0; box-shadow: none; overflow: visible; }
.bh-companion button:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 3px; }
.bh-companion-activity { position: absolute; bottom: 134px; width: 320px; max-width: calc(100vw - 16px); padding: 6px 9px; background: var(--bh-companion-surface); border: 1px solid var(--bh-companion-border); color: var(--bh-companion-muted); font: 12px/18px var(--bh-companion-font); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-companion[data-sync='stale'] .bh-companion-activity { border-style: dashed; }
.bh-companion-pending { position: absolute; z-index: 3; display: flex; flex-direction: column; width: 320px; max-width: calc(100vw - 16px); background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-border); color: var(--bh-companion-text); box-shadow: 3px 3px 0 var(--bh-companion-border); }
.bh-companion-pending > header { flex: none; padding: 8px 10px; font: 12px/18px var(--bh-companion-font); border-bottom: 1px solid var(--bh-companion-border); }
.bh-companion-pending > ol { margin: 0; padding: 8px; list-style: none; overflow: auto; scrollbar-gutter: stable; }
.bh-companion-pending > ol:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: -2px; }
.bh-companion-pending > ol > li + li { margin-top: 12px; }
.bh-companion-request-source { margin-bottom: 6px; font: 11px/16px var(--bh-companion-font); color: var(--bh-companion-muted); overflow-wrap: anywhere; }
.bh-companion-pending .bh-tool-approval-card { margin: 0; min-width: 0; grid-template-columns: minmax(0, 1fr); overflow-wrap: anywhere; }
.bh-companion-pending .bh-tool-approval-input { max-height: 160px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; }
.bh-companion-cards { position: absolute; bottom: 174px; width: 320px; max-width: calc(100vw - 16px); margin: 0; padding: 0; list-style: none; overflow: visible; transition: height 220ms ease; }
.bh-companion[data-reading='true'] .bh-companion-cards { overflow: auto; scrollbar-width: none; }
.bh-companion-cards::-webkit-scrollbar, .bh-companion-card p::-webkit-scrollbar { display: none; }
.bh-companion-card { position: absolute; width: 100%; height: 104px; padding: 8px 10px; background: var(--bh-companion-surface); border: 2px solid var(--bh-companion-border); transform-origin: center top; color: var(--bh-companion-text); transition: top 220ms ease, transform 220ms ease; box-shadow: 3px 3px 0 var(--bh-companion-border); }
.bh-companion-card header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.bh-companion-source { display: flex; flex: 1; flex-direction: column; min-width: 0; gap: 2px; }
.bh-companion-source small { font: 11px/14px var(--bh-companion-font); color: var(--bh-companion-muted); overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-source button { text-align: left; line-height: 14px; }
.bh-companion-source button:disabled { cursor: default; }
.bh-companion-card header button { font-size: 11px; color: var(--bh-companion-muted); background: transparent; border: 0; padding: 0; cursor: pointer; overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
.bh-companion-card p { margin: 6px 0 0; font: 12px/18px var(--bh-companion-font); white-space: pre-wrap; overflow-wrap: anywhere; max-height: 54px; overflow-x: hidden; overflow-y: auto; scrollbar-width: none; overflow-anchor: none; scroll-behavior: auto; }
.bh-companion-card p:focus-visible { outline: 2px solid var(--bh-accent); outline-offset: 2px; }
.bh-companion-card p[data-context='true'] { max-height: 36px; }
.bh-companion-toolbar { position: absolute; bottom: 96px; left: -10px; display: flex; align-items: center; gap: 4px; padding: 5px; background: var(--bh-companion-surface); border: 1px solid var(--bh-companion-border); }
.bh-companion-toolbar button { display: grid; place-items: center; min-width: 28px; height: 26px; border: 0; background: transparent; color: var(--bh-companion-text); cursor: pointer; }
.bh-companion-toolbar button:hover { background: var(--bh-companion-hover); }
.bh-companion-attention { position: absolute; z-index: 2; right: 4px; top: 4px; min-width: 20px; height: 20px; padding: 0 3px; border: 1px solid var(--bh-companion-border); background: var(--bh-companion-surface); color: var(--bh-companion-attention); cursor: pointer; }
.bh-companion-toolbar, .bh-companion-attention { opacity: 0; visibility: hidden; pointer-events: none; transition: opacity 150ms ease, visibility 0s linear 150ms; }
.bh-companion:hover .bh-companion-toolbar, .bh-companion:has(:focus-visible) .bh-companion-toolbar,
.bh-companion:hover .bh-companion-attention, .bh-companion:has(:focus-visible) .bh-companion-attention,
.bh-companion-toolbar[data-open='true'] { opacity: 1; visibility: visible; pointer-events: auto; transition-delay: 0s; }
html[data-botharness-motion='reduce'] .bh-companion * { transition: none; }
`;
