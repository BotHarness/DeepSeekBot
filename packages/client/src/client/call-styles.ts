import { actionColor, border, color, radius, size, space, text } from './ds/tokens.stylex.js';

export const CALL_CSS = `
.bh-call-control { position: relative; display: inline-flex; align-items: center; min-width: 0; }
.bh-call-control[data-variant='header'] .bh-call-island { min-height: ${size.icon}; box-shadow: none; background: transparent; }
.bh-call-island { display: inline-flex; align-items: center; gap: ${space.x3}; min-height: 34px; max-width: min(100%, 420px); padding: ${space.x1} ${space.x2} ${space.x1} ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: 999px; background: var(--dsw-alias-bg-module-platform); box-shadow: 0 3px 12px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); color: ${color.fg}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; pointer-events: auto; box-sizing: border-box; }
.bh-call-dot { flex: none; width: 8px; height: 8px; border-radius: ${radius.round}; background: var(--dsw-alias-state-success-primary); }
.bh-call-island[data-tone='busy'] .bh-call-dot, .bh-call-island[data-tone='warning'] .bh-call-dot { background: ${color.warning}; }
.bh-call-island[data-tone='muted'] .bh-call-dot { background: ${color.subtle}; }
.bh-call-status { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bh-call-island[data-tone='busy'] .bh-call-status, .bh-call-island[data-tone='warning'] .bh-call-status { color: ${color.muted}; }
.bh-call-duration { flex: none; color: ${color.muted}; font-size: ${text.metaSize}; font-variant-numeric: tabular-nums; }
.bh-call-island [data-muted='true'] { color: ${color.fg}; background: ${color.selected}; }
.bh-call-hangup { flex: none; display: inline-flex; align-items: center; justify-content: center; width: ${size.icon}; height: ${size.icon}; padding: 0; border: 0; border-radius: 999px; background: ${color.danger}; color: ${color.onDanger}; cursor: pointer; }
.bh-call-hangup:hover { background: color-mix(in srgb, ${color.danger} 88%, black); }
.bh-call-hangup:focus-visible { outline: ${border.focus} solid ${color.danger}; outline-offset: 2px; }
.bh-call-notice { position: fixed; top: 56px; right: ${space.x5}; z-index: 1000; display: grid; gap: ${space.x2}; width: max-content; max-width: min(320px, calc(100vw - 32px)); padding: ${space.x4}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-base); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); color: ${color.fg}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; }
.bh-call-notice strong { font-weight: ${text.strong}; }
.bh-call-notice p { margin: 0; color: ${color.muted}; }
.bh-call-notice-actions { display: flex; justify-content: flex-end; gap: ${space.x3}; margin-top: ${space.x2}; }
.bh-call-notice-actions button { min-height: ${size.icon}; padding: 0 ${space.x4}; border: 0; border-radius: ${radius.sm}; background: ${actionColor.secondary}; color: ${color.fg}; font: inherit; cursor: pointer; }
.bh-call-notice-actions button:hover { background: ${actionColor.hover}; }
.bh-call-notice-actions button:focus-visible { outline: ${border.focus} solid ${color.accent}; outline-offset: 2px; }
.bh-call-camera { position: fixed; top: 56px; right: ${space.x5}; z-index: 1000; display: grid; gap: ${space.x2}; width: 240px; max-width: calc(100vw - 32px); padding: ${space.x3}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.md}; background: var(--dsw-alias-bg-base); box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); color: ${color.fg}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; box-sizing: border-box; }
.bh-call-camera-frame { position: relative; overflow: hidden; aspect-ratio: 16 / 9; border-radius: ${radius.sm}; background: color-mix(in srgb, var(--dsw-alias-label-primary) 8%, transparent); }
.bh-call-camera-video { display: block; width: 100%; height: 100%; object-fit: cover; transform: scaleX(-1); }
.bh-call-camera-flash { position: absolute; inset: 0; border-radius: inherit; pointer-events: none; box-shadow: inset 0 0 0 3px var(--dsw-alias-state-success-primary); opacity: 0; }
.bh-call-camera-flash[data-flash='true'] { animation: bh-call-flash 700ms ease-out; }
@keyframes bh-call-flash { from { opacity: 1; } to { opacity: 0; } }
.bh-call-camera[data-source='screen'] .bh-call-camera-video { object-fit: contain; transform: none; }
.bh-call-camera-label { margin: 0; overflow: hidden; color: ${color.fg}; text-overflow: ellipsis; white-space: nowrap; }
.bh-call-camera-close { justify-self: end; min-height: ${size.icon}; padding: 0 ${space.x4}; border: 0; border-radius: ${radius.sm}; background: ${actionColor.secondary}; color: ${color.fg}; font: inherit; cursor: pointer; }
.bh-call-camera-close:hover { background: ${actionColor.hover}; }
.bh-call-camera-meta { margin: 0; color: ${color.muted}; font-variant-numeric: tabular-nums; }
.bh-call-camera-error { margin: 0; color: ${color.fg}; font-size: ${text.bodySize}; line-height: ${text.bodyLine}; }
.bh-call-camera-save { display: flex; align-items: center; gap: ${space.x2}; color: ${color.fg}; cursor: pointer; }
.bh-call-camera-save input { margin: 0; accent-color: ${color.accent}; }
.bh-call-record { display: flex; align-items: center; gap: ${space.x3}; width: fit-content; max-width: min(100%, 320px); margin: ${space.x3} auto; padding: ${space.x2} ${space.x5} ${space.x2} ${space.x2}; border: ${border.hairline} solid ${color.border}; border-radius: ${radius.lg}; background: var(--dsw-alias-bg-module-platform); color: ${color.fg}; box-sizing: border-box; }
.bh-call-record-icon { flex: none; display: inline-flex; align-items: center; justify-content: center; width: ${size.icon}; height: ${size.icon}; border-radius: ${radius.round}; background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 14%, transparent); color: var(--dsw-alias-state-success-primary); }
.bh-call-record[data-state='ended'] .bh-call-record-icon, .bh-call-record[data-state='share-stopped'] .bh-call-record-icon, .bh-call-record[data-state='share-paused'] .bh-call-record-icon { background: ${color.selected}; color: ${color.muted}; }
.bh-call-record-text { display: grid; min-width: 0; }
.bh-call-record-title { overflow: hidden; font-size: ${text.bodySize}; font-weight: ${text.strong}; line-height: ${text.bodyLine}; text-overflow: ellipsis; white-space: nowrap; }
.bh-call-record-detail { color: ${color.muted}; font-size: ${text.metaSize}; line-height: ${text.metaLine}; font-variant-numeric: tabular-nums; }
`;
